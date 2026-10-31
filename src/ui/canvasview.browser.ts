/** Actual App, PaintingWorkspaceUI and CanvasViewUI: Overscan, safe areas, centre cross and frame overview. */
import { App } from '../app';
import { Project } from '../core/project';
import { CANVAS_VIEW_KEY, readCanvasView } from '../core/canvasview';
import { drawComp } from '../view/composite';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { CanvasViewUI } from './canvasview';

const keys=[CANVAS_VIEW_KEY,'2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.flip.mini'];
const saved=keys.map(k=>localStorage.getItem(k));localStorage.removeItem(CANVAS_VIEW_KEY);
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,stage=document.querySelector<HTMLElement>('#stage')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.setWorkspace('draw');
app.brush={...app.brush,size:6,opacity:1,smoothing:0,postSmooth:0};app.color='#d01010';
const flip=new FlipMode(app,stage);flip.set(false);
const painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh());
const view=new CanvasViewUI(app,stage);painting.addViewButton(view.button);
function refresh(){painting.update();view.update();}
app.onToolChange=refresh;app.onFrameChange=refresh;app.onWorkspaceChange=refresh;app.onThumbs=refresh;app.history.onChange=refresh;
const notices:string[]=[];app.onNotice=m=>notices.push(m);
const settle=(ms=150)=>new Promise<void>(r=>setTimeout(r,ms));
let passed=0,failed=0;function check(name:string,ok:boolean,info?:unknown){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}${ok||info===undefined?'':` ${JSON.stringify(info)}`}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
function pointer(type:string,x:number,y:number){const r=canvas.getBoundingClientRect(),p=app.view.docToScreen(x,y);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:1,clientX:r.left+p.x,clientY:r.top+p.y,button:0,buttons:type==='pointerup'?0:1,pressure:.8}));}
function stroke(pts:[number,number][]){pointer('pointerdown',...pts[0]!);for(const p of pts.slice(1))pointer('pointermove',...p);pointer('pointerup',...pts[pts.length-1]!);}
const line=(x0:number,y0:number,x1:number,y1:number,n=12)=>Array.from({length:n+1},(_,i)=>[x0+(x1-x0)*i/n,y0+(y1-y0)*i/n] as [number,number]);
function colorAt(x:number,y:number):number[]{const p=app.view.docToScreen(x,y),k=canvas.width/stage.clientWidth;return [...canvas.getContext('2d')!.getImageData(Math.round(p.x*k),Math.round(p.y*k),1,1).data];}
const reddish=(c:number[])=>c[0]!-c[1]!>40;
const screenHash=()=>{const d=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let h=0;for(let i=0;i<d.length;i+=97)h=(h*31+d[i]!)|0;return h;};
function exported(){const c=document.createElement('canvas');c.width=app.project.comp.width;c.height=app.project.comp.height;drawComp(c.getContext('2d')!,app.project,app.project.comp,app.frame,{export:true});return c;}
const exportHash=()=>{const c=exported(),d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i++)h=(h*31+d[i]!)|0;return `${c.width}x${c.height}:${h}`;};
const sw=(k:string)=>document.querySelector<HTMLButtonElement>(`.canvas-view-pop [data-view="${k}"]`)!;
const pop=()=>document.querySelector<HTMLElement>('.canvas-view-pop')!;
try{
  app.fit();await settle(250);
  check('Canvas view starts with every option off',JSON.stringify(app.canvasView)===JSON.stringify({overscan:false,safeAreas:false,centre:false,overview:false}));
  check('View sits in the painting footer before Workspace',view.button.parentElement?.classList.contains('painting-views')===true && view.button.nextElementSibling?.getAttribute('aria-label')==='Edit workspace');
  app.setTool('pen');stroke(line(40,64,200,64));await settle();
  const d=app.drawing,undoLabel=app.history.peekUndo()?.label;
  check('A Vector stroke past the page edge keeps all its points',d.vectors.length===1 && d.vectors[0]!.points.some(p=>p.x>150),d.vectors.map(v=>v.points.length));
  check('Without Overscan the pasteboard hides art past the edge',reddish(colorAt(64,64)) && !reddish(colorAt(170,64)),[colorAt(64,64),colorAt(170,64)]);
  const exportBefore=exportHash();
  view.button.click();await settle();
  check('View opens the canvas view switches',!pop().hidden && view.button.getAttribute('aria-expanded')==='true' && document.activeElement===sw('overscan'));
  sw('overscan').click();await settle();
  check('Overscan switch turns on and is remembered on this device',app.canvasView.overscan && sw('overscan').getAttribute('aria-checked')==='true' && readCanvasView(JSON.parse(localStorage.getItem(CANVAS_VIEW_KEY)??'null')).overscan);
  const outside=colorAt(170,64),inside=colorAt(64,64);
  check('Overscan shows art past the edge, dimmed against the page',reddish(outside) && reddish(inside) && outside[0]!<inside[0]!,[outside,inside]);
  check('Toggling view options adds no Undo step',app.history.peekUndo()?.label===undoLabel);
  check('Export keeps the page frame and pixels',exportHash()===exportBefore && exported().width===128);
  // the Eraser cuts the line where it runs past the page
  app.setTool('eraser');app.setPlane('line');stroke(line(180,40,180,90));await settle();
  // (the default Eraser takes a line up to its crossings: this one has none, so all of it goes)
  check('The Eraser reaches vector lines past the page edge (one Undo step)',app.history.peekUndo()?.label==='Erase' && !d.vectors.some(v=>v.points.some(p=>p.x>175 && p.x<185)),d.vectors.map(v=>v.points.map(p=>Math.round(p.x))));
  app.undo();await settle();check('Undo brings the whole line back',d.vectors.length===1 && d.vectors[0]!.points.some(p=>p.x>190));
  app.setTool('pen');stroke(line(150,20,220,20));await settle();
  check('A Vector stroke wholly outside the page is kept',d.vectors.length===2 && d.vectors[1]!.points.every(p=>p.x>140));
  app.setTool('brush');notices.length=0;stroke(line(100,100,180,100));await settle();
  check('Brush paint stops at the page edge, with one notice',d.line.width===128 && notices.length===1 && /page edge/.test(notices[0]!),notices);
  stroke(line(100,110,180,110));await settle();check('The Brush notice is not repeated',notices.length===1);
  let h0=screenHash();sw('safeAreas').click();await settle();
  check('Title and action safe draw on screen',screenHash()!==h0 && app.canvasView.safeAreas);
  h0=screenHash();sw('centre').click();await settle();
  check('Centre cross draws on screen',screenHash()!==h0 && app.canvasView.centre);
  const exportGuides=exportHash();sw('overscan').click();await settle();sw('overscan').click();await settle();
  check('Guides never reach the export',exportGuides===exportHash());
  check('Drawing on the canvas closes the View switches',pop().hidden);
  view.button.click();await settle();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await settle();
  check('Escape closes View and returns focus to it',pop().hidden && document.activeElement===view.button && view.button.getAttribute('aria-expanded')==='false');
  // frame overview: micro thumbnails of neighbouring drawings
  app.addFrame();app.addFrame();app.addFrame();await settle();
  view.button.click();await settle();sw('overview').click();await settle();
  const strip=()=>document.querySelector<HTMLElement>('.canvas-overview')!,thumbs=()=>[...strip().querySelectorAll<HTMLButtonElement>('button')];
  check('Frame overview shows the neighbouring drawings',!strip().hidden && thumbs().length>=3 && thumbs().filter(b=>b.getAttribute('aria-current')==='true').length===1,thumbs().length);
  const r=strip().getBoundingClientRect(),s=stage.getBoundingClientRect();
  check('Overview thumbnails are 44px touch targets inside the stage',thumbs().every(b=>b.offsetHeight>=44 && b.offsetWidth>=44) && r.left>=s.left && r.right<=s.right && r.bottom<=s.bottom);
  const first=thumbs()[0]!,frame=Number(first.getAttribute('aria-label')!.replace(/\D+/g,''))-1;
  first.click();await settle();check('Tapping a thumbnail goes to that drawing',frame>=0 && frame<app.lf+1 && app.lf===frame && strip().querySelector('[aria-current=true]')?.getAttribute('aria-label')===`Go to frame ${frame+1}`,[frame,app.lf]);
  app.setWorkspace('motion');await settle();check('Overview and View stay out of Motion',strip().hidden && pop().hidden);
  app.setWorkspace('animate');await settle();check('Animate shares the same canvas view options',!strip().hidden && app.canvasView.overscan);
  const fresh=readCanvasView(JSON.parse(localStorage.getItem(CANVAS_VIEW_KEY)??'null'));check('A fresh read restores every option',JSON.stringify(fresh)===JSON.stringify(app.canvasView));
}catch(error){check(error instanceof Error?`${error.message}\n${error.stack}`:String(error),false);}
keys.forEach((k,i)=>saved[i]===null?localStorage.removeItem(k):localStorage.setItem(k,saved[i]!));
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
