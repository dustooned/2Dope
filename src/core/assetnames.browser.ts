import { App } from '../app';
import { Project } from './project';
import { ArtworkAssetsUI } from '../ui/artworkassets';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';

const app=new App(document.querySelector<HTMLCanvasElement>('#canvas')!,document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(64,64));app.setWorkspace('animate');
const ui=new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('#header')!);
const source=ui.assets.create('Sky')!;ui.assets.place(source);ui.assets.place(source);
app.onFrameChange=()=>ui.update();app.editor.onChange=()=>ui.update();app.history.onChange=()=>ui.update();ui.update();app.history.clear();
const id=app.placedAsset!.id;
const layer=()=>app.project.comp.layers.find(l=>l.id===id)!;
let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
async function until(test:()=>boolean){for(let i=0;i<120;i++){if(test())return;await new Promise<void>(r=>requestAnimationFrame(()=>r()));}throw new Error('Dialog did not settle');}
function click(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim(),b.firstChild?.textContent?.trim()].includes(name));if(!b)throw new Error(`Missing button ${name}`);if(b.closest<HTMLElement>('.asset-placement-details')?.hidden)document.querySelector<HTMLButtonElement>('button[aria-label="Asset options"]')!.click();b.click();}
async function choose(kind:'placement'|'source'){await until(()=>!document.querySelector<HTMLButtonElement>('button[aria-label="Rename artwork"]')!.disabled);click('Rename artwork');click(`Rename ${kind}`);await until(()=>!!document.querySelector(`input[aria-label="Rename ${kind}"]`));}
async function save(name:string){document.querySelector<HTMLInputElement>('dialog input')!.value=name;click('Save name');await until(()=>!document.querySelector('dialog.small'));}
try{
  click('Rename artwork');check('Names offers two separately explained actions',document.querySelector('dialog')!.textContent!.includes('This copy only')&&document.querySelector('dialog')!.textContent!.includes('Existing placement names stay the same'));click('Cancel');await until(()=>!document.querySelector('dialog'));
  check('Cancelling Names leaves history empty',!app.history.canUndo);
  await choose('placement');click('Cancel');await until(()=>!document.querySelector('dialog'));
  check('Cancelling a text rename leaves names and history unchanged',layer().name==='Sky'&&!app.history.canUndo);
  await choose('placement');await save('  Foreground trees  ');
  check('Placement dialog changes only the selected copy and updates the picker',layer().name==='Foreground trees'&&app.project.comps.get(source)!.name==='Sky'&&app.project.comp.layers.filter(l=>l.kind==='comp'&&l.name==='Sky').length===1&&document.querySelector<HTMLSelectElement>('select[aria-label="Placed asset"]')!.selectedOptions[0]!.textContent!.includes('Foreground trees (Sky)'));
  app.history.undo();check('One Undo restores placement name',layer().name==='Sky'&&!app.history.canUndo);app.history.redo();app.history.clear();
  await choose('source');await save('Sunset');
  check('Source dialog updates shared identity while preserving instance names',app.project.comps.get(source)!.name==='Sunset'&&layer().name==='Foreground trees'&&document.querySelector('.asset-source-info')!.textContent!.includes('Source: Sunset'));
  const saved=await captureProject(app.project,{mode:'archive'}).settle();const reopened=loadProjectFile(parseProjectFile(stringifyProjectFile(saved.file))).project;
  check('Validated archive capture reload keeps distinct source and placement names',reopened.comps.get(source)!.name==='Sunset'&&reopened.comp.layers.find(l=>l.id===id)!.name==='Foreground trees'&&reopened.comp.layers.filter(l=>l.kind==='comp'&&l.comp===source).length===2);
  click('Edit source');ui.update();check('Draw header identifies the renamed shared source',app.workspace==='draw'&&document.querySelector('.asset-editing-name')!.textContent==='Source: Sunset');
  click('Assets (1)');click('Rename source Sunset');await until(()=>!!document.querySelector('input[aria-label="Rename source"]'));await save('Evening');await until(()=>!!document.querySelector('.artwork-shelf'));
  check('Shelf Rename refreshes the source card and Draw header',!!document.querySelector('article[aria-label="Evening"]')&&document.querySelector('.asset-editing-name')!.textContent==='Source: Evening');click('Close assets');click('Done editing asset');ui.update();app.setArrangeAssets(true,id);app.history.clear();
  await choose('placement');const old=app.project;app.loadProject(new Project(64,64));await save('Wrong project');
  check('A stale dialog cannot rename the old or newly opened project',old.comp.layers.find(l=>l.id===id)!.name==='Foreground trees'&&!app.history.canUndo&&!app.project.comp.layers.some(l=>l.name==='Wrong project'));
}catch(e){check(String(e),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
