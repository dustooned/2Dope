/** Real Sidebar/App/toolbars and drawing pixels, without project library/autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { cloneBrush, PRESETS } from '../core/brush';
import { Sidebar, sizeToT, tToSize } from './sidebar';
import { Bubbles } from './bubbles';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';

const keys=['2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.flip.mini','2dope.ui.level','2dope.m0.brush'];
const saved=keys.map(k=>localStorage.getItem(k));
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,stage=document.querySelector<HTMLElement>('#stage')!,root=document.querySelector<HTMLElement>('#sidebar')!;
const size=root.querySelector<HTMLElement>('[data-slider="size"]')!,opacity=root.querySelector<HTMLElement>('[data-slider="opacity"]')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.setWorkspace('draw');app.project.comp.duration=24;
app.setBrush({...cloneBrush(PRESETS.find(b=>b.name==='Pixel Ink')!),size:16,opacity:1,smoothing:0});app.setPlane('fill');app.color='#264653';
const sidebar=new Sidebar(app,root),flip=new FlipMode(app,stage);
const painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh(),()=>{});
const bubbles=new Bubbles(app,stage,{brushLibrary(){},colorPanel(){},layers(){},layerCards(){},fit:()=>app.refit()});bubbles.setLevel('simple',false);
function refresh(){painting.update();bubbles.update();sidebar.update();root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled=!app.history.canUndo;root.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled=!app.history.canRedo;}
app.onBrushChange=refresh;app.onToolChange=refresh;app.onFrameChange=refresh;app.onWorkspaceChange=refresh;app.editor.onChange=refresh;app.history.onChange=refresh;
root.querySelector('[data-action="undo"]')!.addEventListener('click',()=>app.undo());root.querySelector('[data-action="redo"]')!.addEventListener('click',()=>app.redo());
const settle=()=>new Promise<void>(r=>setTimeout(r,120));
function key(target:HTMLElement,k:string,shift=false){const e=new KeyboardEvent('keydown',{key:k,code:k===' '?'Space':k,bubbles:true,cancelable:true,shiftKey:shift});target.dispatchEvent(e);return e;}
function pointer(target:HTMLElement,type:string,t:number,id=1,dx=0,button=0){const r=target.getBoundingClientRect();target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:id,button,buttons:type==='pointerup'?0:1,clientX:r.left+r.width/2+dx,clientY:r.top+(1-t)*r.height}));}
function tap(target:HTMLElement,t:number){pointer(target,'pointerdown',t);pointer(target,'pointerup',t);}
function stroke(y:number){const r=canvas.getBoundingClientRect();for(const [type,x] of [['pointerdown',30],['pointermove',64],['pointermove',96],['pointerup',96]] as const){const p=app.view.docToScreen(x,y);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:8,button:0,buttons:type==='pointerup'?0:1,pressure:1,clientX:r.left+p.x,clientY:r.top+p.y}));}}
const alpha=(y:number)=>app.drawing.fill!.getContext('2d')!.getImageData(64,y,1,1).data[3]!;
const controlButton=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.getAttribute('aria-label')===name)!;
let passed=0,failed=0;function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try{
  await settle();app.history.clear();refresh();
  check('Sliders visibly label Size and Opacity with pixel/percent values',size.querySelector('.vlabel')!.textContent==='Size'&&opacity.querySelector('.vlabel')!.textContent==='Opacity'&&size.querySelector('.vval')!.textContent==='16 px'&&opacity.querySelector('.vval')!.textContent==='100%');
  check('Accessible values are numeric with units separate and vertical ranges',size.getAttribute('aria-valuenow')==='16'&&size.getAttribute('aria-valuetext')==='16 px'&&size.getAttribute('aria-valuemax')==='500'&&opacity.getAttribute('aria-valuenow')==='100'&&opacity.getAttribute('aria-valuemin')==='0'&&opacity.getAttribute('aria-valuemax')==='100'&&opacity.getAttribute('aria-orientation')==='vertical');
  check('Both sliders and sidebar buttons have at least 44px targets',[size,opacity,...root.querySelectorAll<HTMLElement>('button')].every(e=>{const r=e.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9;}));
  const frame=app.frame;tap(opacity,.5);
  check('A tap chooses 50% and focuses opacity without changing the frame or document',app.brush.opacity===.5&&document.activeElement===opacity&&app.frame===frame&&!app.history.canUndo&&!app.strokeActive);
  key(opacity,'ArrowLeft');key(opacity,'ArrowLeft');
  check('Repeated arrows adjust opacity by one percent and retain focus',app.brush.opacity===.48&&document.activeElement===opacity&&app.frame===frame);
  key(opacity,'ArrowRight',true);check('Shift-arrow changes opacity by ten percent',app.brush.opacity===.58);
  key(opacity,'Home');key(opacity,'ArrowDown');check('Opacity Home and lower bound reach exactly zero',app.brush.opacity===0&&opacity.getAttribute('aria-valuenow')==='0');
  key(opacity,'End');key(opacity,'ArrowUp');check('Opacity End and upper bound reach exactly 100%',app.brush.opacity===1&&opacity.getAttribute('aria-valuenow')==='100');
  size.focus();key(size,'ArrowRight');key(size,'ArrowUp',true);check('Size arrows use one pixel and Shift uses ten pixels without frame navigation',app.brush.size===27&&app.frame===frame&&document.activeElement===size);
  key(size,'Home');key(size,'ArrowLeft');check('Size Home clamps to one pixel',app.brush.size===1&&size.getAttribute('aria-valuenow')==='1');
  key(size,'End');key(size,'ArrowRight');check('Size End clamps to 500 pixels and fills the track',app.brush.size===500&&size.querySelector<HTMLElement>('.vfill')!.style.height==='100%');
  tap(size,.5);check('A size tap uses the squared mapping across the supported range',app.brush.size===tToSize(.5)&&tToSize(sizeToT(8))===8);
  app.brush.opacity=.5;app.brushChanged();pointer(opacity,'pointerdown',.5,2);pointer(opacity,'pointermove',.5,2,30);pointer(opacity,'pointermove',.7,2,30);pointer(opacity,'pointerup',.7,2,30);
  check('Sideways-first dragging retains quarter-speed fine adjustment',app.brush.opacity===.55);
  pointer(opacity,'pointerdown',.5,3);pointer(opacity,'pointermove',.8,3);const cancelled=app.brush.opacity;pointer(opacity,'pointercancel',.8,3);pointer(opacity,'pointermove',.1,3);pointer(opacity,'pointerup',.1,3);
  check('Pointer cancellation retains the last value and ignores late input',app.brush.opacity===cancelled&&!opacity.classList.contains('active'));
  pointer(size,'pointerdown',.5,4);pointer(size,'pointermove',.6,4);const captured=app.brush.size;size.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:4}));pointer(size,'pointermove',.9,4);pointer(size,'pointerup',.9,4);
  check('Lost capture stops the size drag without a late jump',app.brush.size===captured&&!size.classList.contains('active'));
  pointer(opacity,'pointerdown',.5,5);const prior=app.brush.opacity;key(opacity,'Escape');pointer(opacity,'pointerup',.1,5);
  check('Escape stops an unfinished slider gesture and returns to the canvas',document.activeElement===canvas&&app.brush.opacity===prior&&!opacity.classList.contains('active')&&app.frame===frame);
  size.focus();key(size,'Enter');check('Enter returns to drawing without starting playback',document.activeElement===canvas&&!app.playing);
  opacity.focus();key(opacity,' ');opacity.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}));
  check('Space on a focused slider does not start canvas playback',!app.playing&&app.frame===frame);
  app.setTool('eraser');app.setPlane('line');tap(size,.3);key(size,'ArrowRight');tap(opacity,.4);
  check('Adjusting size and opacity preserves Eraser and Line with no Undo entry',app.tool==='eraser'&&app.plane==='line'&&app.brush.opacity===.4&&!app.history.canUndo);
  app.setTool('brush');app.setPlane('fill');app.setBrush({...cloneBrush(PRESETS.find(b=>b.name==='Pixel Ink')!),size:12,opacity:1,smoothing:0});
  check('Choosing a different brush refreshes both labeled values',size.querySelector('.vval')!.textContent==='12 px'&&opacity.querySelector('.vval')!.textContent==='100%');
  tap(opacity,.5);key(opacity,'Enter');app.fit();stroke(40);await settle();const half=alpha(40);tap(opacity,1);key(opacity,'Enter');stroke(88);await settle();const full=alpha(88);
  check('New strokes use the adjusted opacity on Fill without painting Line',half>=120&&half<=132&&full>245&&app.drawing.line.getContext('2d')!.getImageData(64,40,1,1).data[3]===0);
  controlButton('Undo').click();await settle();check('One Undo removes the last stroke rather than the brush adjustment',alpha(88)===0&&alpha(40)>0&&app.brush.opacity===1);
  controlButton('Redo').click();await settle();check('Redo restores the stroke with its original opacity',alpha(88)>245);
  controlButton('Toggle brush controls').click();await settle();const folded=root.offsetParent===null;controlButton('Toggle brush controls').click();await settle();
  check('Brush controls fold and recover without changing brush, tool or target',folded&&root.offsetParent!==null&&app.brush.size===12&&app.brush.opacity===1&&app.tool==='brush'&&app.plane==='fill');
  app.setWorkspace('animate');refresh();tap(opacity,.63);key(opacity,'ArrowLeft');key(opacity,'Enter');
  check('Animate uses the same controls and returns focus with the chosen values',app.workspace==='animate'&&app.brush.opacity===.62&&document.activeElement===canvas&&app.tool==='brush'&&app.plane==='fill');
  // Force a short usable canvas without changing the browser viewport or saving a view preference.
  stage.style.height='300px';stage.style.flex='0 0 300px';await settle();await settle();
  const visible=(e:HTMLElement)=>{const r=e.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
  check('A short usable canvas switches to a compact row with reachable controls',root.classList.contains('compact')&&[size,opacity,...root.querySelectorAll<HTMLElement>('button')].every(visible)&&root.getBoundingClientRect().right<=innerWidth&&visible(controlButton('Toggle brush controls')));
}catch(e){check(String(e),false);}
finally{keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
