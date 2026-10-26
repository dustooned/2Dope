/** Actual App/Bubbles/LayerCards, resident pixels and compositor; no library/autosave. */
import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import { drawComp } from '../view/composite';
import { LayerCards } from './layercards';
import { Bubbles } from './bubbles';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';

const keys=['2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.flip.mini','2dope.ui.level'];
const saved=keys.map(k=>localStorage.getItem(k));
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,stage=document.querySelector<HTMLElement>('#stage')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.setWorkspace('draw');app.project.comp.duration=24;
app.brush={...app.brush,size:14,opacity:1,smoothing:0};app.fillMode='tap';app.color='#286ab4';app.showLayers=true;app.otherAlpha=1;
const cards=new LayerCards(app),flip=new FlipMode(app,stage);
const painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh());
const bubbles=new Bubbles(app,stage,{brushLibrary(){},colorPanel(){},layers:anchor=>cards.toggle(anchor),layerCards:anchor=>cards.toggle(anchor),fit:()=>app.refit()});bubbles.setLevel('simple',false);
function refresh(){painting.update();bubbles.update();cards.update();}
app.onToolChange=refresh;app.onFrameChange=refresh;app.onWorkspaceChange=refresh;app.editor.onChange=refresh;app.history.onChange=refresh;
const settle=()=>new Promise<void>(r=>setTimeout(r,120));
const getButton=(name:string,scope:ParentNode=document)=>{const b=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim()].includes(name));if(!b)throw new Error(`Missing ${name}`);return b;};
const click=(name:string,scope:ParentNode=document)=>getButton(name,scope).click();
const tools=()=>document.querySelector('.bub-tools')!,options=()=>document.querySelector('.bub-ctx')!,panel=()=>document.querySelector<HTMLElement>('.layercards')!;
function openOptions(){if(!cards.open)click('Layers',tools());const card=panel().querySelector<HTMLElement>('.lc-card.on')!;const r=card.getBoundingClientRect();for(const type of ['pointerdown','pointerup'])card.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:20,pointerType:'pen',clientX:r.left+90,clientY:r.top+r.height/2,button:0,buttons:type==='pointerup'?0:1}));}
function pointer(type:string,x:number,y:number){const r=canvas.getBoundingClientRect(),p=app.view.docToScreen(x,y);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:1,clientX:r.left+p.x,clientY:r.top+p.y,button:0,buttons:type==='pointerup'?0:1,pressure:.8}));}
function stroke(y:number){pointer('pointerdown',28,y);pointer('pointermove',64,y);pointer('pointermove',100,y);pointer('pointerup',100,y);}
function pixels(d:Drawing,plane:'line'|'fill'){const c=plane==='line'?d.line:d.fill;return c?[...c.getContext('2d')!.getImageData(0,0,128,128).data]:[];}
const painted=(d:Drawing,plane:'line'|'fill')=>pixels(d,plane).some((v,i)=>i%4===3&&v>1);
const stamp=(d:Drawing,plane:'line'|'fill')=>pixels(d,plane);
// Compare visible (premultiplied) colour, not unstable RGB in nearly transparent pixels.
// Rectangular history readback adds up to three colour levels in privacy-protected Chromium;
// unchanged planes use one level, and alpha always stays within one level.
function same(a:number[],b:number[],tolerance=1){if(a.length!==b.length)return false;for(let i=0;i<a.length;i+=4){if(Math.abs(a[i+3]!-b[i+3]!)>1)return false;for(let c=0;c<3;c++)if(Math.abs(a[i+c]!*a[i+3]!/255-b[i+c]!*b[i+3]!/255)>tolerance)return false;}return true;}
function alpha(x:number,y:number){const c=document.createElement('canvas');c.width=c.height=128;drawComp(c.getContext('2d')!,app.project,app.project.comp,app.frame,{export:true,planes:'all'});return c.getContext('2d')!.getImageData(x,y,1,1).data[3]!;}
function value(name:string,n:number){const input=panel().querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;input.value=String(n);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
const hit=(e:HTMLElement)=>{const r=e.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try{
  await settle();click('Layers',tools());click('New layer',panel());click('Background',panel());await settle();
  const background=app.project.layer,drawing=app.drawing;
  check('Layers creates a selected still background behind the drawing layer',background.kind==='drawings'&&background.still===true&&app.project.comp.layers.at(-1)?.id===background.id);
  click('Close layers',panel());check('Close layers returns focus to the canvas',!cards.open&&document.activeElement===canvas);
  app.history.clear();click('Fill',options());
  check('Options Fill selects the Fill plane and keeps Brush',app.plane==='fill'&&app.tool==='brush'&&!app.history.canUndo);
  app.fit();stroke(86);await settle();const originalFill=stamp(drawing,'fill');
  check('A pen-style brush stroke paints real Fill pixels without touching Line',painted(drawing,'fill')&&!painted(drawing,'line')&&app.history.canUndo&&!app.strokeActive);
  app.undo();await settle();check('One Undo removes the Fill stroke without another step',!painted(drawing,'fill')&&!app.history.canUndo);app.redo();await settle();
  check('Redo restores the Fill stroke',same(stamp(drawing,'fill'),originalFill,3));const fill=stamp(drawing,'fill');
  click('Line',options());check('Options Line keeps Brush and selects Line',app.tool==='brush'&&app.plane==='line');
  app.color='#d04030';stroke(36);await settle();const line=stamp(drawing,'line');
  check('Line brushing leaves all Fill pixels unchanged',painted(drawing,'line')&&same(stamp(drawing,'fill'),fill));
  app.history.clear();openOptions();
  const targets=[...panel().querySelectorAll<HTMLElement>('.lc-part-name,.lc-part-eye,.lc-part input,.lc-row input[type=range]')];
  check('Line/Fill buttons, visibility and opacity rows have 44px touch targets',targets.length===7&&targets.every(e=>e.getBoundingClientRect().height>=43.9));
  check('Phone/tablet panel stays within the viewport and its Close control is reachable',panel().getBoundingClientRect().right<=innerWidth&&panel().getBoundingClientRect().bottom<=innerHeight&&hit(getButton('Close layers',panel())));
  click('Fill',panel().querySelector('.lc-part')!.parentElement!);check('Layer options Fill also keeps the raster Brush',app.tool==='brush'&&app.plane==='fill');
  click('Line',panel().querySelector('.lc-part')!.parentElement!);const beforeAlpha=alpha(64,36);
  panel().querySelector<HTMLElement>('.lc-list')!.scrollTop=40;const scroll=panel().querySelector<HTMLElement>('.lc-list')!.scrollTop;
  panel().querySelector<HTMLInputElement>('input[aria-label="Line opacity"]')!.focus({preventScroll:true});value('Line opacity',50);await settle();
  check('Opacity commits preserve input focus and the layer-list scroll position',document.activeElement?.getAttribute('aria-label')==='Line opacity'&&Math.abs(panel().querySelector<HTMLElement>('.lc-list')!.scrollTop-scroll)<=1);
  check('Line opacity changes the actual composite while keeping stored planes unchanged',beforeAlpha>0&&Math.abs(alpha(64,36)/beforeAlpha-.5)<.03&&same(stamp(drawing,'line'),line)&&same(stamp(drawing,'fill'),fill));
  app.undo();await settle();check('One Undo restores Line opacity',Math.abs(alpha(64,36)-beforeAlpha)<=1&&!app.history.canUndo);
  const fillAlpha=alpha(64,86);value('Fill opacity',0);await settle();check('Fill opacity hides colour without hiding the Line',alpha(64,86)<=1&&alpha(64,36)>0);app.undo();await settle();
  check('Undo restores Fill opacity without changing painted pixels',Math.abs(alpha(64,86)-fillAlpha)<=1&&same(stamp(drawing,'fill'),fill));
  click('Hide Line',panel());check('Hide Line leaves Fill visible',alpha(64,36)<=1&&alpha(64,86)>0);app.undo();await settle();
  check('Visibility Undo restores Line with no extra history',alpha(64,36)>0&&!app.history.canUndo);
  value('Layer opacity',50);await settle();check('Layer opacity affects both Line and Fill in the actual composite',Math.abs(alpha(64,36)/beforeAlpha-.5)<.03&&Math.abs(alpha(64,86)/fillAlpha-.5)<.03);app.undo();await settle();
  const blend=panel().querySelector<HTMLSelectElement>('select[aria-label="Blend mode"]')!;blend.focus({preventScroll:true});blend.value='multiply';blend.dispatchEvent(new Event('change',{bubbles:true}));await settle();
  check('Blend commits preserve the focused selector',document.activeElement?.getAttribute('aria-label')==='Blend mode');app.undo();await settle();
  click('Close layers',panel());click('Eraser',tools());click('Fill',options());
  check('Selecting Fill keeps Eraser rather than activating the bucket',app.tool==='eraser'&&app.plane==='fill');stroke(86);await settle();
  check('Fill erasing changes only Fill pixels',!same(stamp(drawing,'fill'),fill)&&same(stamp(drawing,'line'),line));app.undo();await settle();
  check('One Undo restores the erased Fill',same(stamp(drawing,'fill'),fill,3)&&!app.history.canUndo);
  click('Line',options());check('Selecting Line also keeps Eraser',app.tool==='eraser'&&app.plane==='line');stroke(36);await settle();
  check('Line erasing leaves Fill intact',!same(stamp(drawing,'line'),line)&&same(stamp(drawing,'fill'),fill,3));app.undo();await settle();
  check('One Undo restores the erased Line',same(stamp(drawing,'line'),line,3)&&!app.history.canUndo);
  canvas.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'x',code:'KeyX'}));
  check('Keyboard X switches planes without replacing Eraser or editing artwork',app.tool==='eraser'&&app.plane==='fill'&&!app.history.canUndo);
  click('Smudge',tools());click('Line',options());check('Plane selection preserves Smudge',app.smudging&&app.tool==='brush'&&app.plane==='line');
  click('Vector',tools());check('Explicit Vector selects the Line plane',app.tool==='pen'&&app.plane==='line');click('Fill',options());
  check('Painting on Fill from Vector uses Brush instead of drawing vector ink on Line',app.tool==='brush'&&app.plane==='fill'&&!app.smudging);
  click('Fill',tools());check('Explicit Fill tool still activates the bucket on Fill',app.tool==='fill'&&app.plane==='fill');openOptions();
  click('Line',panel().querySelector('.lc-part')!.parentElement!);check('Choosing Line from the bucket returns to Brush on Line',app.tool==='brush'&&app.plane==='line');
  click('Add a layer to Background',panel());await settle();const top=app.project.layer;
  check('The stack plus adds an editable paint layer without retiming the background',top.id!==background.id&&top.kind==='drawings'&&top.still===true&&top.cel===(background.kind==='drawings'?background.cel:undefined)&&app.project.length===1);
  click('Close layers',panel());app.color='#39804c';app.fit();stroke(62);await settle();
  check('Painting the added layer keeps the background Line and Fill intact',painted(app.drawing,'line')&&same(stamp(drawing,'line'),line,3)&&same(stamp(drawing,'fill'),fill,3));
  app.undo();await settle();check('One Undo removes the added layer stroke while preserving its layer',!painted(app.drawing,'line')&&app.project.layer.id===top.id);app.undo();await settle();
  check('A second Undo removes only the added paint layer',!app.project.comp.layers.some(l=>l.id===top.id)&&app.project.comp.layers.some(l=>l.id===background.id));
}catch(e){check(String(e),false);}
finally{keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
