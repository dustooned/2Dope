import { App } from '../app';
import { Project, planeCanvas } from './project';
import { ArtworkAssetsUI } from '../ui/artworkassets';
import { PRESETS } from './brush';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { readZip, writeZip } from '../io/zip';
import { Residency } from './residency';
import { domPlaneOps } from '../view/planeops';

const app=new App(document.querySelector<HTMLCanvasElement>('#canvas')!,document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(32,32));app.setWorkspace('animate');
const ui=new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('#header')!);
app.onFrameChange=()=>ui.update();app.editor.onChange=()=>ui.update();app.history.onChange=()=>ui.update();
const source=ui.assets.create('Sky')!,original=app.project.drawing(app.project.exposures[0]!.drawing);
const paint=(canvas:HTMLCanvasElement,color:string)=>{const g=canvas.getContext('2d')!;g.fillStyle=color;g.fillRect(0,0,32,32);};
paint(original.line,'#ff0000');paint(planeCanvas(original,'fill'),'#0000ff');original.role='key';
original.vectors=[{id:'v1',tool:'pen',brush:structuredClone(PRESETS[0]!),color:'#000000',seed:7,points:[{x:1,y:2,pressure:1,tiltX:0,tiltY:0,t:0}]}];original.rev++;
ui.assets.place(source);ui.assets.place(source);ui.update();
const p=app.project,id=app.placedAsset!.id,sibling=p.comp.layers.find(l=>l.kind==='comp'&&l.id!==id)!;
app.history.clear();
const placement=()=>p.comp.layers.find(l=>l.id===id)!;
const currentSource=()=>{const l=placement();if(l.kind!=='comp')throw new Error('Missing placement');return l.comp;};
const drawing=(project:Project,comp:string)=>{const l=project.comps.get(comp)!.layers.find(l=>l.kind==='drawings')!;if(l.kind!=='drawings')throw new Error('Missing drawings');return project.drawing(l.exposures[0]!.drawing);};
const pixel=(canvas:HTMLCanvasElement,expected:number[])=>[...canvas.getContext('2d')!.getImageData(16,16,1,1).data].every((v,i)=>Math.abs(v-expected[i]!)<=1);
let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
async function until(test:()=>boolean){for(let i=0;i<180;i++){if(test())return;await new Promise<void>(r=>requestAnimationFrame(()=>r()));}throw new Error('Operation did not settle');}
function click(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim(),b.firstChild?.textContent?.trim()].includes(name));if(!b)throw new Error(`Missing button ${name}`);if(b.closest<HTMLElement>('.asset-placement-details')?.hidden)document.querySelector<HTMLButtonElement>('button[aria-label="Asset options"]')!.click();b.click();}
try{
  click('Asset copies');check('Copies distinguishes linked duplicate from independent artwork',document.querySelector('dialog')!.textContent!.includes('Duplicate placement')&&document.querySelector('dialog')!.textContent!.includes('Other placements keep their shared source'));
  click('Cancel');await until(()=>!document.querySelector<HTMLButtonElement>('button[aria-label="Asset copies"]')!.disabled);check('Cancel leaves links and history untouched',currentSource()===source&&!app.history.canUndo);
  click('Asset copies');click('Make independent');await until(()=>currentSource()!==source&&!ui.assets.copying);
  const independent=currentSource(),copy=drawing(p,independent);
  check('Only the selected locked placement receives a named independent source',p.comps.get(independent)!.name==='Sky copy'&&placement().locked&&sibling.kind==='comp'&&sibling.comp===source&&document.querySelector('.asset-source-info')!.textContent!.includes('Sky copy'));
  check('Drawing identity, vectors and role are independently owned',copy.id!==original.id&&copy.role==='key'&&copy.vectors!==original.vectors&&copy.vectors[0]!.points!==original.vectors[0]!.points);
  await app.residency.pin(copy);await app.residency.pin(original);
  check('Real PNG decode preserves separate Line and Fill pixels',pixel(copy.line,[255,0,0,255])&&!!copy.fill&&pixel(copy.fill,[0,0,255,255]));
  copy.vectors[0]!.points[0]!.x=9;check('Editing copied vector points leaves original points intact',original.vectors[0]!.points[0]!.x===1);copy.vectors[0]!.points[0]!.x=1;
  app.history.push({label:'Paint independent copy',drawings:[copy],do:()=>{paint(copy.line,'#00ff00');copy.rev++;app.editor.changed();},undo:()=>{paint(copy.line,'#ff0000');copy.rev++;app.editor.changed();}},false);
  check('Painting the independent source leaves original Line and Fill unchanged',pixel(copy.line,[0,255,0,255])&&pixel(original.line,[255,0,0,255])&&pixel(original.fill!,[0,0,255,255]));
  app.history.undo();check('One paint Undo restores only copied pixels',pixel(copy.line,[255,0,0,255])&&currentSource()===independent);
  app.history.undo();check('One more Undo removes copied comps and restores the shared link',currentSource()===source&&!p.comps.has(independent)&&!app.history.canUndo);
  app.history.redo();app.history.redo();check('Redo restores the same independent drawing and painted pixels',currentSource()===independent&&drawing(p,independent)===copy&&pixel(copy.line,[0,255,0,255]));
  app.residency.unpin(copy);app.residency.unpin(original);
  const saved=await captureProject(p,{mode:'archive'}).settle();
  const entries=await readZip(writeZip([{name:'project.json',data:new TextEncoder().encode(stringifyProjectFile(saved.file))},...[...saved.assets].map(([name,data])=>({name,data}))]));
  const loaded=loadProjectFile(parseProjectFile(new TextDecoder().decode(entries.get('project.json')!))).project;
  const r=new Residency(domPlaneOps,async key=>entries.get(key)??null);r.setProject(loaded);
  const loadedOriginal=drawing(loaded,source),loadedCopy=drawing(loaded,independent);await r.pin(loadedOriginal);await r.pin(loadedCopy);
  check('Standalone ZIP reload keeps independently editable red and green sources',loadedOriginal.id!==loadedCopy.id&&pixel(loadedOriginal.line,[255,0,0,255])&&pixel(loadedCopy.line,[0,255,0,255])&&pixel(loadedCopy.fill!,[0,0,255,255]));
  paint(loadedCopy.fill!,'#ffff00');loadedCopy.rev++;check('Recoloring reloaded Fill does not alter either Line or original Fill',pixel(loadedCopy.fill!,[255,255,0,255])&&pixel(loadedOriginal.fill!,[0,0,255,255])&&pixel(loadedCopy.line,[0,255,0,255]));
  r.unpin(loadedCopy);r.unpin(loadedOriginal);
  click('Edit source');ui.update();check('Edit source opens independent artwork in Draw',p.activeComp===independent&&document.querySelector('.asset-editing-name')!.textContent==='Source: Sky copy');click('Done editing asset');ui.update();app.setArrangeAssets(true,id);
  app.history.clear();click('Asset copies');click('Duplicate placement');await until(()=>!document.querySelector<HTMLButtonElement>('button[aria-label="Asset copies"]')!.disabled);
  check('Copies still creates a linked duplicate of the selected independent source',p.comp.layers.filter(l=>l.kind==='comp'&&l.comp===independent).length===2);app.history.undo();
}catch(e){check(String(e),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
