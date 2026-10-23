/** Real App/UI workflow; in-memory artwork, no library or autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { compLayer, newComp } from '../core/comp';
import { ArtworkAssetsUI } from './artworkassets';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { TracksSheet } from './sheet';
import { FlipMode } from './flipmode';

const keys=['2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.sheet.draw','2dope.sheet.animate','2dope.m3.--track-h','2dope.flip.mini'];
const saved=keys.map(k=>localStorage.getItem(k));
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,stage=document.querySelector<HTMLElement>('#stage')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.setWorkspace('draw');app.project.comp.duration=24;app.setFrame(7);
const sheet=new TracksSheet(app,document.querySelector<HTMLElement>('.stage-col')!,document.querySelector<HTMLElement>('#strip')!,()=>{});
const flip=new FlipMode(app,stage);
const painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh(),()=>{});
const ui=new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('.painting-header')!);
function refresh(){painting.update();sheet.update();ui.update();}
app.onFrameChange=refresh;app.onWorkspaceChange=()=>{sheet.restore();refresh();};app.editor.onChange=()=>ui.update();
const settle=()=>new Promise<void>(r=>setTimeout(r,120));
const button=(name:string)=>{const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim()].includes(name));if(!b)throw new Error(`Missing ${name}`);return b;};
const click=(name:string)=>button(name).click();
function key(target:HTMLElement,code:string,type='keydown',prevent=false){const e=new KeyboardEvent(type,{code,key:code==='Space'?' ':code.replace('Arrow',''),bubbles:true,cancelable:true});if(prevent)e.preventDefault();target.dispatchEvent(e);return e;}
function pointer(type:string,x:number,y:number,pointerType='pen',pointerId=1){const r=canvas.getBoundingClientRect(),p=app.view.docToScreen(x,y);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType,pointerId,clientX:r.left+p.x,clientY:r.top+p.y,button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1,pressure:.7}));}
function stroke(y:number){pointer('pointerdown',30,y);pointer('pointermove',60,y);pointer('pointermove',95,y);pointer('pointerup',95,y);}
const ink=()=>[...app.drawing.line.getContext('2d')!.getImageData(0,0,128,128).data].some((v,i)=>i%4===3&&v>1);
function sourceHeaderFits(){
  const header=document.querySelector<HTMLElement>('.painting-header')!,name=document.querySelector<HTMLElement>('.asset-editing-name')!,status=document.querySelector<HTMLElement>('.asset-editing-status')!,done=button('Done editing asset');
  const h=header.getBoundingClientRect(),s=stage.getBoundingClientRect(),n=name.getBoundingClientRect(),d=done.getBoundingClientRect();
  return h.left>=s.left&&h.right<=s.right&&h.height<=60&&n.width>=Math.min(88,stage.clientWidth*.25)&&n.height>0&&status.getBoundingClientRect().height>0&&status.scrollWidth<=status.clientWidth+1&&d.width>=43.9&&d.height>=43.9&&done.contains(document.elementFromPoint(d.x+d.width/2,d.y+d.height/2));
}
let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try{
  const shot=app.project.activeComp,layer=app.project.activeLayer;
  click('New asset');const input=document.querySelector<HTMLInputElement>('input[aria-label="New asset name"]')!;
  check('New asset opens a named modal with text focus',document.activeElement===input&&!!document.querySelector('dialog[open]'));
  input.value='Class background';key(input,'Enter');await settle();
  const source=app.project.activeComp,art=app.drawing;
  check('Enter creates an editable Draw source and focuses the keyboard-reachable canvas',source!==shot&&ui.assets.editing&&app.workspace==='draw'&&document.activeElement===canvas&&canvas.tabIndex===0&&!app.playing);
  check('New artwork identifies its source and says Not placed yet',document.querySelector('.asset-editing-name')!.textContent==='Source: Class background'&&document.querySelector('.asset-editing-status')!.textContent==='Not placed yet');
  check('Source name, complete status and Done fit in one compact header',sourceHeaderFits());
  app.setTool('brush');app.fit();app.history.clear();stroke(50);await settle();
  check('Fit keeps the artwork below the source header',app.view.y>=document.querySelector('.painting-header')!.getBoundingClientRect().bottom-stage.getBoundingClientRect().top);
  check('Pen-style drawing produces real source pixels and one Undo step',ink()&&art.rev>0&&app.history.canUndo&&!app.strokeActive&&document.activeElement===canvas);
  app.undo();await settle();check('One Undo removes the stroke',!ink()&&!app.history.canUndo);app.redo();await settle();check('Redo restores source ink',ink());
  click('Done editing asset');
  check('Done returns to the original shot, layer, frame and Draw workspace with canvas focus',app.project.activeComp===shot&&app.project.activeLayer===layer&&app.frame===7&&app.workspace==='draw'&&document.activeElement===canvas);
  click('Assets (1)');click('Place Class background');await settle();
  const placement=app.placedAsset!;
  check('Place enters Animate with the linked locked placement selected and picker focus',app.workspace==='animate'&&placement?.comp===source&&placement.locked&&document.activeElement===document.querySelector('select[aria-label="Placed asset"]'));
  const options=button('Asset options');options.focus();
  const enter=key(options,'Enter');key(options,'Enter','keyup');const space=key(options,'Space');key(options,'Space','keyup');
  check('Enter and Space on a button remain available for native activation without leaving placement or playing',!enter.defaultPrevented&&!space.defaultPrevented&&app.arrangingAssets&&!app.playing);
  click('Asset options');click('Asset timing');
  const range=document.createElement('input');range.type='range';range.setAttribute('aria-label','Workflow range');stage.append(range);range.focus();const frame=app.frame;
  const arrow=key(range,'ArrowRight');key(range,'ArrowRight','keyup');
  check('Range arrow keys do not step the animation',app.frame===frame&&!arrow.defaultPrevented);
  const checkbox=document.querySelector<HTMLInputElement>('.asset-follow input')!;checkbox.focus();key(checkbox,'Space');key(checkbox,'Space','keyup');
  check('Checkbox Space does not start playback',!app.playing&&app.arrangingAssets);range.remove();
  app.focusCanvas();key(canvas,'Space');options.focus();key(options,'Space','keyup');app.focusCanvas();key(canvas,'Space','keyup');
  check('Releasing a canvas-held Space over a control clears it without later playback',!app.playing);
  key(canvas,'Escape','keydown',true);check('An already-handled key does not also exit placement',app.arrangingAssets);
  app.history.clear();const pos=JSON.stringify(placement.transform),rev=art.rev;
  pointer('pointerdown',60,50,'touch',3);pointer('pointermove',70,60,'touch',3);pointer('pointerdown',100,90,'touch',4);pointer('pointermove',110,95,'touch',4);pointer('pointerup',70,60,'touch',3);pointer('pointerup',110,95,'touch',4);await settle();
  check('Switching a touch move to pinch preserves placement, pixels and Undo state',JSON.stringify(app.placedAsset?.transform)===pos&&art.rev===rev&&!app.history.canUndo&&!app.strokeActive);
  ui.resetLayout();
  const edit=button('Edit source'),editBox=edit.getBoundingClientRect();
  check('Edit source stays reachable with Options closed and a full touch target',document.querySelector<HTMLElement>('.asset-placement-details')!.hidden&&editBox.width>=43.9&&editBox.height>=43.9&&edit.contains(document.elementFromPoint(editBox.x+editBox.width/2,editBox.y+editBox.height/2)));
  click('Edit source');await settle();check('Edit source returns to the same layered drawing with canvas focus',app.project.activeComp===source&&app.drawing===art&&document.activeElement===canvas&&!app.arrangingAssets);
  check('Editing placed artwork visibly explains its one linked placement',document.querySelector('.asset-editing-status')!.textContent==='Updates 1 placement'&&sourceHeaderFits());
  const other=newComp(app.project.newId('c'),'Other shot',128,128,24),sourceComp=app.project.comps.get(source)!;
  other.layers.push(compLayer(app.project.newId('L'),'First use',sourceComp,other),compLayer(app.project.newId('L'),'Second use',sourceComp,other));
  app.project.comps.set(other.id,other);ui.update();
  check('Shared status counts linked placements across other shots in the project',document.querySelector('.asset-editing-status')!.textContent==='Updates 3 placements'&&document.querySelector('.asset-context')!.getAttribute('aria-label')!.includes('all 3 linked placements in this project'));
  const longName='Evening sky with clouds and distant mountains for the final class animation scene'.slice(0,80);
  ui.assets.renameSource(source,longName);ui.update();
  check('A long renamed source stays visible and bounded while its complete name remains accessible',sourceHeaderFits()&&document.querySelector('.asset-editing-name')!.textContent===`Source: ${longName}`&&document.querySelector('.asset-context')!.getAttribute('aria-label')!.includes(longName));
  app.undo();await settle();check('One Undo restores the source header name without changing shared counts',document.querySelector('.asset-editing-name')!.textContent==='Source: Class background'&&document.querySelector('.asset-editing-status')!.textContent==='Updates 3 placements'&&!app.history.canUndo);
  app.redo();await settle();check('Redo refreshes the displayed source name',document.querySelector('.asset-editing-name')!.textContent===`Source: ${longName}`);
  app.undo();await settle();app.project.comps.delete(other.id);ui.update();
  app.fit();stroke(80);await settle();check('A source edit still paints after the navigation and touch gesture',art.rev>rev&&ink()&&!app.strokeActive);
  click('Done editing asset');check('Done restores Animate and the previous shot frame without focusing hidden source controls',app.workspace==='animate'&&app.project.activeComp===shot&&app.frame===frame&&document.activeElement===canvas);
  check('Leaving the source clears its status and restores the workspace selector',document.querySelector<HTMLElement>('.asset-context')!.hidden&&document.querySelector('.asset-editing-status')!.textContent===''&&document.querySelector('select[aria-label="Workspace"]')!.getBoundingClientRect().width>0);
  app.setArrangeAssets(true,placement.id);refresh();click('Done arranging assets');check('Placement Done returns focus to the drawing canvas',!app.arrangingAssets&&document.activeElement===canvas);
  button('Assets (1)').focus();pointer('pointerdown',100,100);pointer('pointercancel',100,100);check('Drawing pointer input reclaims canvas focus from toolbar controls',document.activeElement===canvas&&!app.strokeActive);
  key(canvas,'Space');key(canvas,'Space','keyup');check('Canvas Space still starts playback',app.playing);key(canvas,'Space');key(canvas,'Space','keyup');check('Canvas Space still pauses playback',!app.playing);
}catch(e){check(String(e),false);}
finally{keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
