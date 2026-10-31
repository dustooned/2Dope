import { App } from '../app';
import { Project } from '../core/project';
import { ArtworkAssetsUI } from './artworkassets';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { TracksSheet } from './sheet';
import { FlipMode } from './flipmode';

const keys=['2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.sheet.draw','2dope.sheet.animate','2dope.m3.--track-h','2dope.flip.mini'];
const saved=keys.map(k=>localStorage.getItem(k));
const stage=document.querySelector<HTMLElement>('#stage')!,column=document.querySelector<HTMLElement>('.stage-col')!;
const app=new App(document.querySelector<HTMLCanvasElement>('#canvas')!,stage);app.loadProject(new Project(128,72));app.setWorkspace('animate');
const sheet=new TracksSheet(app,column,document.querySelector<HTMLElement>('#strip')!,()=>setTimeout(()=>app.refit(),0));
const flip=new FlipMode(app,stage);
const refresh=()=>{flip.update();sheet.update();assets.update();app.requestRender();};
const painting=new PaintingWorkspaceUI(app,flip,stage,refresh);
const assets=new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('.painting-header')!);painting.onReset=()=>assets.resetLayout();
flip.onChange=()=>{painting.update();assets.update();};
app.onFrameChange=()=>{painting.update();refresh();};app.onWorkspaceChange=()=>{painting.update();sheet.restore();refresh();};app.editor.onChange=()=>assets.update();
const source=assets.assets.create('Background')!;assets.assets.place(source);app.project.comp.duration=24;app.setFrame(8);flip.set(false);sheet.set('half',false);painting.update();refresh();app.history.clear();
let passed=0,failed=0;
const check=(name:string,ok:boolean)=>{const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;};
const settle=()=>new Promise<void>(r=>setTimeout(r,120));
const click=(name:string)=>{if(name==='Toggle options')name='Toggle tool settings';const b=document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);if(!b||b.disabled)throw new Error(`Missing enabled ${name}`);b.click();};
const visible=(e:Element)=>{const r=e.getBoundingClientRect(),s=stage.getBoundingClientRect();return r.width>0&&r.height>=40&&r.top>=s.top&&r.bottom<=s.bottom+1;};
const view=()=>JSON.stringify([app.view.x,app.view.y,app.view.zoom,app.view.rot,app.frame]);
try{
  await settle();app.fit();const start=view(),doc=JSON.stringify([...app.project.comps.values()]);
  check('Asset options start folded with a compact readable picker and Done',document.querySelector<HTMLElement>('.asset-placement-details')!.hidden&&document.querySelector('.asset-placement-tools')!.getBoundingClientRect().height<=66&&document.querySelector('select[aria-label="Placed asset"]')!.getBoundingClientRect().width>=Math.min(150,stage.clientWidth*0.4)&&visible(document.querySelector('select[aria-label="Placed asset"]')!)&&visible(document.querySelector('button[aria-label="Done arranging assets"]')!));
  const edit=document.querySelector<HTMLButtonElement>('button[aria-label="Edit source"]')!,editBounds=()=>edit.getBoundingClientRect();
  const compactEdit=editBounds();
  check('Edit source is labeled and reachable directly in the compact row with a 44px touch target',visible(edit)&&compactEdit.width>=43.9&&compactEdit.height>=43.9&&edit.innerText.includes('Edit')&&edit.contains(document.elementFromPoint(compactEdit.x+compactEdit.width/2,compactEdit.y+compactEdit.height/2)));
  const selected=app.placedAsset!.id;app.editor.select(null);assets.update();
  check('Edit source is disabled without a selected placement',edit.disabled);
  app.editor.select(selected);assets.update();
  check('Fit canvas keeps the page between the workspace header and compact asset row',app.view.docToScreen(app.docW,app.docH).y<=document.querySelector('.asset-placement-tools')!.getBoundingClientRect().top-stage.getBoundingClientRect().top&&app.view.y>=document.querySelector('.painting-header')!.getBoundingClientRect().bottom-stage.getBoundingClientRect().top);
  click('Asset options');click('Asset timing');await settle();
  check('Expanded options keep picker and Done outside the scrolling details',visible(document.querySelector('select[aria-label="Placed asset"]')!)&&visible(document.querySelector('button[aria-label="Done arranging assets"]')!)&&document.querySelector<HTMLElement>('.asset-placement-details')!.scrollHeight>=document.querySelector<HTMLElement>('.asset-placement-details')!.clientHeight);
  check('Edit source remains outside the scrolling options with its width and height unchanged',visible(edit)&&!edit.closest('.asset-placement-details')&&editBounds().width===compactEdit.width&&editBounds().height===compactEdit.height);
  click('Asset options');await settle();check('Folding options restores compact height without changing zoom or frame',view()===start&&document.querySelector('.asset-placement-tools')!.getBoundingClientRect().height<=66);
  sheet.set('full');await settle();
  check('Full Tracks reserves at least 45 percent canvas with a 280px floor when space permits',stage.clientHeight>=Math.min(Math.max(280,column.clientHeight*0.45),column.clientHeight-160)-3);
  check('Picker and Done stay reachable above full Tracks',visible(document.querySelector('select[aria-label="Placed asset"]')!)&&visible(document.querySelector('button[aria-label="Done arranging assets"]')!));
  check('Opening full Tracks preserves the fitted view and playhead',view()===start);
  sheet.set('half');await settle();sheet.set('peek');await settle();check('Track size changes preserve zoom and playhead',view()===start);
  sheet.set('full');await settle();click('Toggle editor');await settle();click('Toggle editor');await settle();
  check('Editor collapse and recovery preserve view and restore the canvas budget',view()===start&&stage.clientHeight>=Math.min(Math.max(280,column.clientHeight*0.45),column.clientHeight-160)-3);
  click('Asset options');click('Asset timing');painting.reset();await settle();
  check('Reset layout restores recoverable collapsed asset options',document.querySelector<HTMLElement>('.asset-placement-details')!.hidden&&document.querySelector('button[aria-label="Asset options"]')!.getAttribute('aria-expanded')==='false');
  app.setWorkspace('draw');flip.set(true);await settle();app.view.x=31;app.view.y=47;app.view.zoom=1.4;app.view.rot=0.1;const draw=view();
  for(const name of ['Toggle tools','Toggle options','Toggle brush controls','Toggle editor']){click(name);await settle();click(name);await settle();}
  check('Draw folding handles recover their initial panel state without changing a panned/zoomed view',view()===draw&&[...document.querySelectorAll<HTMLButtonElement>('.painting-handle')].every(b=>!b.hidden&&b.getAttribute('aria-expanded')===(b.classList.contains('painting-options-handle')?'false':'true')));
  check('Layout changes add no document edits or history',!app.history.canUndo&&JSON.stringify([...app.project.comps.values()])===doc);
  app.setWorkspace('animate');flip.set(false);app.setArrangeAssets(true);assets.resetLayout();click('Done arranging assets');check('Done remains usable while options are collapsed',!app.arrangingAssets);
}catch(e){check(String(e),false);}
finally{keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
