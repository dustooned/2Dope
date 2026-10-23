/** Real brush library, toolbars and painting; isolated origin, no project library/autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { cloneBrush, PRESETS } from '../core/brush';
import { Bubbles } from './bubbles';
import { BrushLibrary } from './brushlib';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { showContextMenu } from './contextmenu';

const keys = ['2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.flip.mini','2dope.ui.level','2dope.m0.color','2dope.m0.brush','2dope.brushes.category'];
const saved = keys.map(k => localStorage.getItem(k));
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage);
app.loadProject(new Project(128,128)); app.setWorkspace('draw'); app.color = '#264653';
app.setBrush(cloneBrush(PRESETS[0]!)); app.setPlane('fill');
let studios = 0;
const library = new BrushLibrary(app, () => { studios++; });
const flip = new FlipMode(app, stage);
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh(), () => {});
const bubbles = new Bubbles(app, stage, {brushLibrary:a => library.toggle(a), colorPanel(){}, layers(){}, layerCards(){}, fit:() => app.refit()});
bubbles.setLevel('simple',false);
function refresh(){ painting.update(); bubbles.update(); }
app.onToolChange = refresh; app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.editor.onChange = refresh;
app.onBrushChange = refresh; app.onColorChange = refresh;
const settle = () => new Promise<void>(r => setTimeout(r,120));
const panel = () => document.querySelector<HTMLElement>('.brushlib')!;
const list = () => panel().querySelector<HTMLElement>('.bl-list')!;
const cats = () => panel().querySelector<HTMLElement>('.bl-cats')!;
const button = (name:string, root:ParentNode = document) => {
  const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => !b.disabled && [b.getAttribute('aria-label'),b.textContent?.trim(),b.title].includes(name));
  if(!b) throw new Error(`Missing ${name}`); return b;
};
const done = () => button('Done choosing brush');
const open = () => button('🖌️ Brushes',document.querySelector('.bub-ctx')!).click();
const category = (id:string) => { const b = cats().querySelector<HTMLButtonElement>(`[data-cat="${id}"]`)!; b.focus(); b.click(); };
const card = (name:string) => [...list().querySelectorAll<HTMLButtonElement>('.bl-card')].find(b => b.dataset.name === name)!;
const choose = (name:string) => { card(name).focus(); card(name).click(); };
function escape(target:HTMLElement){const e = new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}); target.dispatchEvent(e); return e;}
function reachable(e:HTMLElement){const r=e.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}
function stroke(){const r=canvas.getBoundingClientRect();for(const [type,x] of [['pointerdown',30],['pointermove',64],['pointermove',96],['pointerup',96]] as const){const p=app.view.docToScreen(x,64);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:1,button:0,buttons:type==='pointerup'?0:1,pressure:.8,clientX:r.left+p.x,clientY:r.top+p.y}));}}
let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try {
  await settle(); app.history.clear(); open(); await settle();
  check('Brushes opens with focused, reachable 44px Done inside the viewport',library.open&&reachable(done())&&document.activeElement===done()&&panel().getBoundingClientRect().bottom<=innerHeight&&panel().getBoundingClientRect().left>=0&&panel().getBoundingClientRect().right<=innerWidth);
  check('The header identifies the current brush, tool and Fill target',panel().querySelector('.bl-current')!.textContent==='Pencil · Brush · Fill');
  check('Library actions and category buttons keep 44px touch targets',[...panel().querySelectorAll<HTMLElement>('.bl-actions button, .bl-cats button')].every(e=>e.getBoundingClientRect().height>=43.9));
  category('ink'); await settle();
  check('Changing collection keeps focus on that collection and adds no document history',(document.activeElement as HTMLElement)?.dataset.cat==='ink'&&!app.history.canUndo);
  list().style.maxHeight='120px'; await settle(); list().scrollTop=list().scrollHeight;
  const scroll=list().scrollTop,top=done().getBoundingClientRect().top;
  choose('Pixel Ink'); await settle();
  check('Choosing a brush retains card focus, list scroll and selected state',document.activeElement===card('Pixel Ink')&&card('Pixel Ink').getAttribute('aria-selected')==='true'&&scroll>0&&Math.abs(list().scrollTop-scroll)<1);
  check('Scrolled brush cards stay at least 44px high while Done stays fixed',reachable(done())&&Math.abs(done().getBoundingClientRect().top-top)<1&&[...list().children].every(e=>e.getBoundingClientRect().height>=43.9));
  done().click();
  check('Done keeps Pixel Ink, Brush, Fill and colour with canvas focus and no history',!library.open&&app.brush.name==='Pixel Ink'&&app.tool==='brush'&&app.plane==='fill'&&app.color==='#264653'&&document.activeElement===canvas&&!app.history.canUndo);
  app.fit();stroke();await settle();
  check('The next real pen-style brush stroke paints Fill without painting Line',app.drawing.fill!.getContext('2d')!.getImageData(64,64,1,1).data[3]!>0&&app.drawing.line.getContext('2d')!.getImageData(64,64,1,1).data[3]===0);
  app.undo();await settle();check('One Undo removes the stroke while keeping the brush selection',!app.history.canUndo&&app.brush.name==='Pixel Ink'&&app.drawing.fill!.getContext('2d')!.getImageData(64,64,1,1).data[3]===0);
  open();choose('Pixel Ink');check('Reopening and choosing the same brush once does not open Studio',library.open&&studios===0);done().click();
  app.setTool('eraser');open();category('paint');choose('Marker');done().click();
  check('Choosing a brush for Eraser preserves Eraser, Fill and colour',app.brush.name==='Marker'&&app.tool==='eraser'&&app.plane==='fill'&&app.color==='#264653');
  app.setTool('pen');open();category('ink');choose('Fine Liner');done().click();
  check('Choosing a brush for Vector preserves Vector on Line',app.brush.name==='Fine Liner'&&app.tool==='pen'&&app.plane==='line');
  app.setSmudging(true);library.toggle(button('Smudge',document.querySelector('.bub-tools')!));category('paint');choose('Soft Airbrush');done().click();
  check('The shared library preserves Smudge rather than selecting Brush',app.smudging&&app.tool==='brush'&&app.plane==='line'&&app.brush.name==='Soft Airbrush');
  app.setSmudging(false);app.setPlane('fill');open();app.setColor('#3a86ff');
  const opener=button('🖌️ Brushes',document.querySelector('.bub-ctx')!);
  opener.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:7}));opener.click();
  check('The rebuilt Brushes opener closes rather than reopening the library',!library.open&&document.activeElement===canvas);
  open();category('ink');const frame=app.frame;const esc=escape(cats().querySelector<HTMLElement>('[data-cat="ink"]')!);
  check('Escape returns to the canvas without changing frame, tool, plane or brush',esc.defaultPrevented&&!library.open&&document.activeElement===canvas&&app.frame===frame&&app.tool==='brush'&&app.plane==='fill'&&app.brush.name==='Soft Airbrush');
  open();button('＋ Save brush',panel()).click();const modal=document.querySelector<HTMLDialogElement>('dialog[open]')!;escape(modal.querySelector('input')!);
  check('Escape belongs to a nested save dialog while Brushes stays open',library.open&&modal.open);button('Cancel',modal).click();await settle();
  showContextMenu(8,8,[{label:'Test brush menu',run(){}}]);await settle();escape(document.querySelector<HTMLElement>('.ctxmenu button')!);
  check('Escape dismisses the context menu without closing Brushes',library.open&&!document.querySelector('.ctxmenu'));
  category('ink');choose('Ink');choose('Ink');
  check('Double-tap still opens Studio with the chosen brush',!library.open&&studios===1&&app.brush.name==='Ink');
  open();button('⚙ Studio',panel()).click();check('The Studio button still opens settings with the selected brush',!library.open&&studios===2&&app.brush.name==='Ink');
  open();category('ink');const c=card('Ink'),r=c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9,clientX:r.left+r.width/2,clientY:r.top+20}));
  list().dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:9,clientX:r.left+r.width/2-40,clientY:r.top+20}));
  const ghost=!!document.querySelector('.bl-ghost');done().click();
  list().dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9}));c.click();
  check('Done cancels a collection drag and ignores a late click on a hidden card',ghost&&!document.querySelector('.bl-ghost')&&!document.querySelector('.bl-cats .drop')&&!library.open&&studios===2&&app.brush.name==='Ink');
  open();const outside=document.createElement('button');outside.textContent='Outside control';document.body.append(outside);
  outside.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:12}));outside.focus();outside.click();
  check('Outside dismissal leaves focus with the control the user chose',!library.open&&document.activeElement===outside);outside.remove();
  open();category('ink');const captureCard=card('Ink'),captureRect=captureCard.getBoundingClientRect();
  captureCard.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:10,clientX:captureRect.left+80,clientY:captureRect.top+20}));
  list().dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:10,clientX:captureRect.left+40,clientY:captureRect.top+20}));
  const captureGhost=!!document.querySelector('.bl-ghost');list().dispatchEvent(new PointerEvent('lostpointercapture',{bubbles:true,pointerId:10}));
  check('Losing drag capture removes its preview without changing the brush or document',captureGhost&&!document.querySelector('.bl-ghost')&&library.open&&app.brush.name==='Ink'&&!app.history.canUndo);done().click();
  list().style.maxHeight='';
  app.setBrush({...cloneBrush(PRESETS[0]!),name:'A very long temporary background brush name '.repeat(3)});open();await settle();
  check('Long brush names retain their full description without pushing Done offscreen',reachable(done())&&panel().querySelector<HTMLElement>('.bl-current')!.title.includes(app.brush.name)&&panel().getBoundingClientRect().right<=innerWidth);
  done().click();
  app.setWorkspace('animate');refresh();app.setPlane('fill');open();category('paint');choose('Marker');done().click();
  check('Animate shares the same choose/Done flow without altering tool, target or history',!library.open&&app.workspace==='animate'&&app.tool==='brush'&&app.plane==='fill'&&app.brush.name==='Marker'&&!app.history.canUndo&&document.activeElement===canvas);
} catch(e) { check(String(e),false); }
finally { library.close(); keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);}); }
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
