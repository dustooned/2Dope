import { App } from '../app';
import { Project } from './project';
import { ArtworkAssets } from './assets';
import { AssetClipDrag } from '../ui/assetclipdrag';
import { buildRails, drawRailState } from '../ui/rails';
import { Strip } from '../ui/strip';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!,document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(128,128)); app.setWorkspace('animate'); app.flipbook=false;
const assets=new ArtworkAssets(app), source=assets.create('Prop')!; assets.place(source);
const id=app.placedAsset!.id, track=document.querySelector<HTMLElement>('#track')!, inner=document.querySelector<HTMLElement>('#inner')!;
const layer=()=>app.project.comp.layers.find(l=>l.id===id)!;
const render=()=>inner.replaceChildren(...buildRails(app,drawRailState,24,0,0,3000,()=>document.createElement('canvas'),()=>{}).nodes);
app.onFrameChange=render; app.editor.onChange=render;
new AssetClipDrag(app,track,()=>24);
let passed=0, failed=0;
function check(name:string, ok:boolean) { const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++; }
function pointer(type:string,x:number,target:EventTarget=window,pointerId=1,pointerType='mouse') {
  const r=track.getBoundingClientRect();
  target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+140,pointerId,pointerType,button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1}));
}
function down(kind='move',pointerType='mouse') { const b=track.querySelector<HTMLElement>(`[data-asset-gesture="${kind}"]`)!;pointer('pointerdown',200,b,1,pointerType); }
function drag(kind:string,delta:number,end='pointerup') {down(kind);pointer('pointermove',200+24*delta);pointer(end,200+24*delta);}
try {
  app.editor.setAssetTiming(id,'hold',8); app.history.clear(); render();
  down();pointer('pointerup',200);
  check('Tap selects without changing timing or adding history',app.placedAsset?.id===id&&!app.history.canUndo&&!app.strokeActive);
  down();pointer('pointermove',248);pointer('pointermove',272);pointer('pointerup',272);
  check('Body drag survives rebuilt bars and commits one frame-snapped move',layer().in===3&&layer().out===11&&layer().start===3&&app.history.canUndo&&!app.strokeActive);
  app.history.undo();check('One Undo restores the entire move',layer().in===0&&layer().out===8&&!app.history.canUndo);
  app.history.redo();app.history.clear();
  drag('in',2);check('Start handle trims without moving source origin or end',layer().in===5&&layer().start===3&&layer().out===11);
  app.history.clear();const siblings=JSON.stringify(app.project.comp.layers.filter(l=>l.id!==id));
  drag('out',4);check('End handle extends the shot without rippling sibling tracks',layer().out===15&&app.compEnd===15&&JSON.stringify(app.project.comp.layers.filter(l=>l.id!==id))===siblings);
  app.history.clear();let before=JSON.stringify(layer());drag('out',2,'pointercancel');
  check('Pointer cancellation restores timing with no history entry',JSON.stringify(layer())===before&&!app.history.canUndo&&!app.strokeActive);
  down();pointer('pointermove',248);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));pointer('pointerup',248);
  check('Escape cancels a preview and keeps arrangement available',JSON.stringify(layer())===before&&!app.history.canUndo&&app.arrangingAssets&&!app.strokeActive);
  down('move','touch');pointer('pointermove',248,window,1,'touch');pointer('pointerdown',300,track,2,'touch');pointer('pointerup',248);
  check('A second pointer cancels rather than committing the first drag',JSON.stringify(layer())===before&&!app.history.canUndo&&!app.strokeActive);
  down();pointer('pointermove',248);track.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:1}));
  check('Lost capture restores the preview and releases busy state',JSON.stringify(layer())===before&&!app.strokeActive);
  down();pointer('pointermove',248);window.dispatchEvent(new Event('blur'));
  check('Window blur cancels with no saved mutation',JSON.stringify(layer())===before&&!app.history.canUndo&&!app.strokeActive);
  const otherButton=document.createElement('button');track.append(otherButton);let clicked=false;otherButton.onclick=()=>{clicked=true;};
  pointer('pointerdown',200,otherButton);otherButton.click();
  check('After cancellation the next unrelated control click still works',clicked);otherButton.remove();
  down();pointer('pointermove',248);document.body.classList.add('flipmode');pointer('pointerup',248);document.body.classList.remove('flipmode');
  check('Switching to Flipbook before release cancels the clip preview',JSON.stringify(layer())===before&&!app.history.canUndo&&!app.strokeActive);
  app.editor.setAssetTiming(id,'shot');app.history.clear();before=JSON.stringify(layer());
  down();pointer('pointermove',248);pointer('pointermove',200);pointer('pointerup',200);
  check('Dragging back to the origin preserves Follow shot end without history',JSON.stringify(layer())===before&&layer().out===null&&!app.history.canUndo);
  app.editor.setAssetTiming(id,'hold',8);app.history.clear();before=JSON.stringify(layer());
  down();pointer('pointermove',248);app.setWorkspace('draw');pointer('pointerup',248);
  check('Leaving the workspace cancels unfinished clip timing',JSON.stringify(layer())===before&&!app.history.canUndo&&!app.strokeActive);
  app.setWorkspace('animate');app.setArrangeAssets(true,id);drag('out',2);
  const captured=await captureProject(app.project,{mode:'archive'}).settle();
  const loaded=loadProjectFile(parseProjectFile(stringifyProjectFile(captured.file))).project;
  check('Gesture timing survives validated capture and source-link reload',JSON.stringify(loaded.comp.layers.find(l=>l.id===id))===JSON.stringify(layer())&&loaded.comps.get(source)?.asset===true);
  const stripRoot=document.createElement('div');document.body.append(stripRoot);const strip=new Strip(app,stripRoot);
  const scroll=stripRoot.querySelector<HTMLElement>('.strip-track')!;
  scroll.style.cssText='position:relative;width:300px;height:200px;overflow:auto';
  stripRoot.querySelector<HTMLElement>('.strip-inner')!.style.position='relative';
  app.onFrameChange=()=>{render();strip.update();};app.setFrame(app.compEnd-1);
  const head=stripRoot.querySelector<HTMLElement>('.strip-playhead')!,cell=Number.parseFloat(head.style.width);
  check('Clips playhead and scroll follow the comp beyond the last drawing',head.style.transform===`translateX(${(app.compEnd-1)*cell}px)`&&scroll.scrollLeft>0&&app.lf===0);
  const old=app.project,oldTiming=JSON.stringify(layer());down();pointer('pointermove',248);app.loadProject(new Project(128,128));pointer('pointerup',248);
  check('Opening another project cancels in the old project without modifying the new one',JSON.stringify(old.comp.layers.find(l=>l.id===id))===oldTiming&&!app.history.canUndo&&!app.arrangingAssets&&!app.strokeActive);
}catch(e){check(String(e),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
