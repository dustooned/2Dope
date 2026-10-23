import { App } from '../app';
import { Project, planeCanvas } from './project';
import { ArtworkAssetsUI } from '../ui/artworkassets';
import { drawComp } from '../view/composite';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { readZip, writeZip } from '../io/zip';
import { Residency } from './residency';
import { domPlaneOps } from '../view/planeops';

const app=new App(document.querySelector<HTMLCanvasElement>('#canvas')!,document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(32,32));app.setWorkspace('animate');
const ui=new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('#header')!);
app.onFrameChange=()=>ui.update();app.editor.onChange=()=>ui.update();app.history.onChange=()=>ui.update();
const paint=(canvas:HTMLCanvasElement,color:string)=>{const g=canvas.getContext('2d')!;g.fillStyle=color;g.fillRect(0,0,32,32);};
const red=ui.assets.create('Sunset')!,original=app.project.drawing(app.project.exposures[0]!.drawing);paint(original.line,'#ff0000');paint(planeCanvas(original,'fill'),'#0000ff');original.rev++;
ui.assets.place(red);ui.assets.place(red);
const p=app.project,placements=p.comp.layers.filter(l=>l.kind==='comp'),id=placements[0]!.id,sibling=placements[1]!.id;
const green=ui.assets.create('Meadow')!,replacement=app.project.drawing(app.project.exposures[0]!.drawing);paint(replacement.line,'#00ff00');replacement.rev++;ui.assets.done();
p.comp.duration=20;app.setArrangeAssets(true,id);app.setFrame(5);
const target=()=>{const l=p.comp.layers.find(l=>l.id===id)!;if(l.kind!=='comp')throw new Error('Missing target');return l;};
target().name='Foreground';target().start=2;target().in=3;target().out=16;const before=structuredClone(target());
ui.update();app.history.clear();
const composite=(project:Project)=>{const c=document.createElement('canvas');c.width=c.height=32;drawComp(c.getContext('2d')!,project,project.comp,5,{export:true,planes:'all'});return [...c.getContext('2d')!.getImageData(16,16,1,1).data];};
const isColor=(actual:number[],expected:number[])=>actual.every((v,i)=>Math.abs(v-expected[i]!)<=1);
let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
async function until(test:()=>boolean){for(let i=0;i<180;i++){if(test())return;await new Promise<void>(r=>requestAnimationFrame(()=>r()));}throw new Error('UI did not settle');}
function click(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim(),b.firstChild?.textContent?.trim()].includes(name));if(!b)throw new Error(`Missing button ${name}`);if(b.closest<HTMLElement>('.asset-placement-details')?.hidden)document.querySelector<HTMLButtonElement>('button[aria-label="Asset options"]')!.click();b.click();}
try{
  click('Replace artwork source');
  check('Replace opens the familiar preview shelf with selected-placement scope',document.querySelector('#artwork-shelf-title')!.textContent==='Replace source'&&document.querySelector('.artwork-note')!.textContent!.includes('Foreground')&&!!document.querySelector('article[aria-label="Meadow"] canvas'));
  check('The current source is disabled and shelf actions do not add or edit sources',document.querySelector<HTMLButtonElement>('button[aria-label="Current source Sunset"]')!.disabled&&!document.querySelector('button[aria-label="Place Meadow"]')&&!document.querySelector('button[aria-label="Edit Meadow"]'));
  click('Close assets');check('Cancel adds no history and returns focus to Replace',target().comp===red&&!app.history.canUndo&&document.activeElement?.getAttribute('aria-label')==='Replace artwork source');
  click('Replace artwork source');click('Replace with Meadow');
  check('Choosing artwork swaps only selected source and refreshes source/picker labels',target().comp===green&&p.comp.layers.find(l=>l.id===sibling)!.kind==='comp'&&placements[1]!.comp===red&&document.querySelector('.asset-source-info')!.textContent!.includes('Meadow')&&document.querySelector<HTMLSelectElement>('select[aria-label="Placed asset"]')!.selectedOptions[0]!.textContent!.includes('Foreground (Meadow)'));
  check('Placement name, interval, transform and shared clock are preserved',JSON.stringify(target())===JSON.stringify({...before,comp:green,overrides:{}})&&app.frame===5&&p.comp.duration===20);
  check('The actual shot compositor displays replacement pixels',isColor(composite(p),[0,255,0,255]));
  app.undo();await until(()=>target().comp===red);check('One Undo restores source and red composite without another history step',isColor(composite(p),[255,0,0,255])&&!app.history.canUndo);
  app.redo();await until(()=>target().comp===green);check('Redo restores the new source and green composite',isColor(composite(p),[0,255,0,255]));
  click('Edit source');ui.update();check('Edit source opens the replacement in Draw',p.activeComp===green&&document.querySelector('.asset-editing-name')!.textContent==='Source: Meadow');click('Done editing asset');app.setArrangeAssets(true,id);ui.update();
  const saved=await captureProject(p,{mode:'archive'}).settle();const entries=await readZip(writeZip([{name:'project.json',data:new TextEncoder().encode(stringifyProjectFile(saved.file))},...[...saved.assets].map(([name,data])=>({name,data}))]));
  const loaded=loadProjectFile(parseProjectFile(new TextDecoder().decode(entries.get('project.json')!))).project,r=new Residency(domPlaneOps,async key=>entries.get(key)??null);r.setProject(loaded);
  for(const d of loaded.drawings.values())await r.pin(d);
  check('Standalone ZIP reload keeps replacement, old editable source, timing and painted pixels',loaded.comps.has(red)&&loaded.comps.has(green)&&loaded.comp.layers.some(l=>l.id===id&&l.kind==='comp'&&l.comp===green&&l.in===3&&l.out===16&&l.name==='Foreground')&&isColor(composite(loaded),[0,255,0,255]));
  for(const d of loaded.drawings.values())r.unpin(d);
  app.history.clear();click('Replace artwork source');const stale=document.querySelector<HTMLButtonElement>('button[aria-label="Replace with Sunset"]')!;
  app.editor.select(sibling);ui.update();check('Selecting another placement dismisses a stale replacement shelf',!document.querySelector('.artwork-shelf'));stale.click();check('A removed shelf action cannot replace a newly selected instance',target().comp===green&&!app.history.canUndo);
  app.setArrangeAssets(true,id);click('Replace artwork source');const oldProjectAction=document.querySelector<HTMLButtonElement>('button[aria-label="Replace with Sunset"]')!;
  app.loadProject(new Project(32,32));ui.update();oldProjectAction.click();check('Opening another project invalidates old shelf actions without changing either project',!document.querySelector('.artwork-shelf')&&target().comp===green&&!app.history.canUndo&&app.project.comps.size===1);
}catch(e){check(String(e),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
