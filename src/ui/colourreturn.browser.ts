/** Real colour panel/toolbars/pixels; no project library or autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { Bubbles } from './bubbles';
import { ColorPanel } from './colorpanel';
import { LayerCards } from './layercards';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { askText } from './dialogs';
const keys=['2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.flip.mini','2dope.ui.level','2dope.m0.color','2dope.color.recent','2dope.color.mode','2dope.color.palette','2dope.color.palettes','2dope.color.paletteAt','2dope.color.harmony'];
const saved=keys.map(k=>localStorage.getItem(k));
// Deterministic starter palette on this test origin; all preferences are restored below.
for(const k of keys.filter(k=>k.startsWith('2dope.color.')))localStorage.removeItem(k);
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,stage=document.querySelector<HTMLElement>('#stage')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.setWorkspace('draw');app.color='#1d1d24';app.brush={...app.brush,size:14,opacity:1,smoothing:0};app.setPlane('fill');
const picker=document.createElement('input');picker.type='color';picker.hidden=true;document.body.append(picker);
const colours=new ColorPanel(app,picker),cards=new LayerCards(app),flip=new FlipMode(app,stage);
const painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh());
const bubbles=new Bubbles(app,stage,{brushLibrary(){},colorPanel:a=>colours.toggle(a),layers:a=>cards.toggle(a),layerCards:a=>cards.toggle(a),fit:()=>app.refit()});bubbles.setLevel('simple',false);
function refresh(){painting.update();bubbles.update();cards.update();}
app.onColorChange=()=>{colours.sync();bubbles.update();};app.onToolChange=refresh;app.onFrameChange=refresh;app.onWorkspaceChange=refresh;app.editor.onChange=refresh;
const settle=()=>new Promise<void>(r=>setTimeout(r,120));
const button=(name:string,root:ParentNode=document)=>{const b=[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim(),b.title].includes(name));if(!b)throw new Error(`Missing ${name}`);return b;};
const click=(name:string,root:ParentNode=document)=>button(name,root).click();
const panel=()=>document.querySelector<HTMLElement>('.colorpop')!,body=()=>panel().querySelector<HTMLElement>('.cp-body')!,done=()=>button('Done choosing colour');
const open=()=>click('Colour',document.querySelector('.bub-tools')!);
function escape(target:HTMLElement){const e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});target.dispatchEvent(e);return e;}
function reachable(e:HTMLElement){const r=e.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}
function stroke(){const r=canvas.getBoundingClientRect();for(const [type,x] of [['pointerdown',30],['pointermove',64],['pointermove',96],['pointerup',96]] as const){const p=app.view.docToScreen(x,64);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:1,button:0,buttons:type==='pointerup'?0:1,pressure:.8,clientX:r.left+p.x,clientY:r.top+p.y}));}}
let passed=0,failed=0;function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try{
  await settle();app.history.clear();open();
  check('Colour opens with a reachable 44px Done button and keyboard focus',colours.open&&reachable(done())&&document.activeElement===done());
  check('Colour stays inside the viewport',panel().getBoundingClientRect().left>=0&&panel().getBoundingClientRect().right<=innerWidth&&panel().getBoundingClientRect().bottom<=innerHeight);
  const top=done().getBoundingClientRect().top;body().scrollTop=body().scrollHeight;
  check('Scrolling colour controls leaves Done fixed and reachable',reachable(done())&&Math.abs(done().getBoundingClientRect().top-top)<1);body().scrollTop=0;
  click('Palette colour #3a86ff');check('Picking a colour keeps Brush on Fill and adds no document history',app.color==='#3a86ff'&&app.tool==='brush'&&app.plane==='fill'&&!app.history.canUndo);
  const current=button('Colour',document.querySelector('.bub-tools')!);
  current.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:7}));current.click();
  check('The rebuilt Colour toolbar button closes the existing panel instead of reopening it',!colours.open&&document.activeElement===canvas&&app.color==='#3a86ff');
  open();click('Palette colour #264653');click('Done choosing colour');
  check('Done keeps the chosen colour and tool and returns focus to the canvas',!colours.open&&app.color==='#264653'&&app.tool==='brush'&&app.plane==='fill'&&document.activeElement===canvas);
  app.fit();stroke();await settle();const pixel=app.drawing.fill!.getContext('2d')!.getImageData(64,64,1,1).data;
  check('The next pen-style stroke paints the selected colour on Fill',pixel[3]!>0&&Math.abs(pixel[0]!-38)<=3&&Math.abs(pixel[1]!-70)<=3&&Math.abs(pixel[2]!-83)<=3&&!app.drawing.line.getContext('2d')!.getImageData(64,64,1,1).data[3]);
  app.undo();await settle();check('One Undo removes that stroke without undoing the colour choice',!app.history.canUndo&&app.color==='#264653'&&app.drawing.fill!.getContext('2d')!.getImageData(64,64,1,1).data[3]===0);
  app.setTool('eraser');open();click('Palette colour #ff5a8a');click('Done choosing colour');
  check('Choosing colour and Done preserves Eraser and its plane',app.tool==='eraser'&&app.plane==='fill'&&app.color==='#ff5a8a'&&!app.history.canUndo);
  app.setTool('brush');app.setPlane('line');open();click('Values');
  const hex=panel().querySelector<HTMLInputElement>('input[aria-label="Hex colour"]')!;hex.focus();hex.value='#3a86ff';hex.dispatchEvent(new Event('change',{bubbles:true}));const frame=app.frame;
  const esc=escape(hex);check('Escape from Hex colour closes only Colour and returns to drawing',esc.defaultPrevented&&!colours.open&&document.activeElement===canvas&&app.color==='#3a86ff'&&app.tool==='brush'&&app.plane==='line'&&app.frame===frame);
  open();click('Values');hex.value='bad!';hex.dispatchEvent(new Event('change',{bubbles:true}));click('Done choosing colour');check('Invalid hex entry keeps the last valid colour when finishing',app.color==='#3a86ff'&&hex.value==='#3a86ff');
  open();click('Values');await settle();click('Disc');await settle();
  check('Switching from Values to Disc repositions the expanded panel inside the viewport',panel().getBoundingClientRect().top>=0&&panel().getBoundingClientRect().bottom<=innerHeight&&reachable(done()));click('Done choosing colour');
  open();const answer=askText('Test palette name','Class');const modal=document.querySelector<HTMLDialogElement>('dialog[open]')!;escape(modal.querySelector('input')!);
  check('Colour yields Escape to a nested palette dialog',colours.open&&modal.open);button('Cancel',modal).click();await answer;click('Done choosing colour');
  open();click('Disc');body().scrollTop=0;const disc=panel().querySelector<HTMLCanvasElement>('.cp-disc')!,r=disc.getBoundingClientRect();
  disc.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'pen',pointerId:9,clientX:r.left+r.width*.95,clientY:r.top+r.height*.5}));
  const picked=app.color;click('Done choosing colour');disc.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'pen',pointerId:9,clientX:r.left+r.width*.5,clientY:r.top+r.height*.05}));disc.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9}));
  check('Done ends disc dragging so late pointer events cannot change the chosen colour',app.color===picked&&!colours.open&&!app.strokeActive&&!app.history.canUndo);
  click('Layers',document.querySelector('.bub-tools')!);check('Layers is available immediately after closing Colour without changing tool or colour',cards.open&&app.color===picked&&app.tool==='brush'&&app.plane==='line');click('Close layers');
  open();const beforeColour=app.color;click('Palette colour #ffffff');click('The colour before: tap to go back to it');click('Done choosing colour');check('The before swatch and Done retain the original colour',app.color===beforeColour&&!colours.open&&!app.history.canUndo);
}catch(e){check(String(e),false);}
finally{colours.close();keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
