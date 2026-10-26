/** Actual pen input, compositor, History, autosave and portable reload; MemoryStore only. */
import { App } from '../app';
import { planeCanvas, type Drawing } from '../core/project';
import { PRESETS } from '../core/brush';
import { AUTO_PAINT_KEY, autoPaintLimit } from '../fill/autopaint';
import { Bubbles } from './bubbles';
import { Sidebar } from './sidebar';
import { FlipMode } from './flipmode';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FileUI } from './files';
import { MemoryStore } from '../io/persist';
import { captureProject } from '../io/projectio';
import { writeZip } from '../io/zip';
import { stringifyProjectFile, parseProjectFile } from '../io/schema';
import { drawComp } from '../view/composite';
import { encodePng } from '../io/codec';

const keys = [AUTO_PAINT_KEY, '2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view', '2dope.flip.mini', '2dope.m0.brush', '2dope.m0.color', '2dope.ui.level', '2dope.select.shape'];
const saved = keys.map(k => localStorage.getItem(k)); for (const k of keys) localStorage.removeItem(k);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), flip = new FlipMode(app, stage);
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh()), sidebar = new Sidebar(app, document.querySelector<HTMLElement>('#sidebar')!);
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, fit: () => app.fit(), editShape() {} }); bubbles.setLevel('simple', false);
function refresh() { flip.update(); painting.update(); bubbles.update(); sidebar.update(); }
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.onToolChange = refresh; app.history.onChange = refresh; app.onBrushChange = refresh; app.onShapeChange = refresh;
const store = new MemoryStore(), files = new FileUI(app, store, false), notices: string[] = [];
app.onNotice = m => notices.push(m); let changed = 0;
const dirty = app.onDocChanged; app.onDocChanged = () => { changed++; dirty(); };
const settle = () => new Promise<void>(r => setTimeout(r, 100));
async function until(test:()=>boolean){const end=performance.now()+10000;while(!test()){if(performance.now()>end)throw new Error('Timed out waiting for resident ink');await settle();}}
async function park(d:Drawing){const line=await encodePng(d.line),fill=d.fill?await encodePng(d.fill):null;d.parked={rev:d.rev,line:{key:null,bytes:line},fill:fill?{key:null,bytes:fill}:null};d.line.width=d.line.height=0;if(d.fill)d.fill.width=d.fill.height=0;}
const square: [number, number][] = [[20,20],[108,20],[108,108],[20,108],[20,20]];
async function fresh(tool: 'brush' | 'pen' = 'brush', width = 128, height = 128) {
  await files.newProject({ name: `Ink Paint ${tool}`, width, height, frames: 1 }); app.setWorkspace('draw'); flip.set(false);
  app.setMaskEditing(false); app.setTool(tool); app.setPlane('line'); app.quickShape = false; app.pointsAfterHold = false;
  app.setBrush({ ...PRESETS[1]!, size: 6, opacity: 1, flow: 1, smoothing: 0, postSmooth: 0, taperStart: 0, taperEnd: 0 });
  app.setInkPaint(true); app.setInkColor('#18181b'); app.setColor('#e63946'); await settle(); app.fit();
}
function pointer(type: string, x: number, y: number, predicted?: [number, number][]) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, pressure: 1, clientX: r.left + p.x, clientY: r.top + p.y });
  if (predicted) Object.defineProperty(e, 'getPredictedEvents', { value: () => predicted.map(([x,y]) => { const q = app.view.docToScreen(x,y); return new PointerEvent('pointermove', {clientX:r.left+q.x,clientY:r.top+q.y,pressure:1,pointerType:'pen'}); }) });
  canvas.dispatchEvent(e);
}
function stroke(points: [number, number][], end = 'pointerup') {
  const first=points[0]!,last=points.at(-1)!;pointer('pointerdown',...first);
  for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));for(let j=1;j<=steps;j++)pointer('pointermove',a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps);}
  pointer(end,...last);
}
const rgba = (d: Drawing, part: 'line' | 'fill', x: number, y: number) => [...planeCanvas(d, part).getContext('2d')!.getImageData(x,y,1,1).data];
const pixel = (x: number, y: number, part: 'line' | 'fill' = 'fill') => rgba(app.drawing, part, x, y);
const equals = (actual: number[], rgb: number[]) => actual[3] === 255 && rgb.every((v,i) => Math.abs(actual[i]! - v) <= 1);
function seededOpen() { const g = app.drawing.line.getContext('2d')!; g.fillStyle = '#18181b'; g.fillRect(20,20,5,88); g.fillRect(20,103,88,5); g.fillRect(103,20,5,88); app.drawing.rev++; app.residency.touch(app.drawing); }
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if(ok)passed++;else failed++; }
const button = (name: string) => { const b = [...document.querySelectorAll<HTMLButtonElement>('.bub-ctx button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name); if(!b)throw new Error(`Missing ${name}`);return b; };
let passed = 0, failed = 0;
try {
  await fresh(); app.setInkPaint(false); const edit = app.history.peekUndo(); button('Ink & Paint').click();
  check('Options enables Ink & Paint with editable separate ink/paint colours and no document edit', app.inkPaint.enabled && app.plane === 'line' && app.tool === 'brush' && !!document.querySelector('[aria-label="Ink colour"]') && button('Paint colour').title.includes(app.color) && app.history.peekUndo() === edit);
  stroke([[20,20],[20,108],[108,108],[108,20]]); await settle();
  check('An open multi-segment outline leaves its interior and the background transparent', pixel(64,64)[3] === 0 && pixel(4,4)[3] === 0 && pixel(20,64,'line')[3]! > 0);
  await files.autosaver.flush(); const changesBefore = changed; stroke([[20,20],[108,20]]); await settle();
  check('Closing raster ink and automatic paint use separate colours with one document notification', equals(pixel(64,64),[230,57,70]) && equals(pixel(20,64,'line'),[24,24,27]) && pixel(4,4)[3] === 0 && changed === changesBefore + 1 && app.history.peekUndo()?.label === 'Ink & Paint');
  app.undo(); await settle(); check('One Undo removes the closing line and its automatic paint together', pixel(64,64)[3] === 0 && pixel(64,20,'line')[3] === 0 && pixel(20,64,'line')[3]! > 0);
  app.setColor('#3a86ff'); app.setInkPaint(false); app.redo(); await settle();
  check('Redo restores the captured paint and ink without rerunning detection with new preferences', equals(pixel(64,64),[230,57,70]) && pixel(64,20,'line')[3]! > 0);
  app.setInkPaint(true); stroke([[12,12],[12,4]]); await settle();
  check('A later unrelated stroke does not recolour an old closed area', equals(pixel(64,64),[230,57,70]));
  await files.autosaver.flush(); const head = parseProjectFile((await store.getHead(files.current!.id))!.json);
  check('Normal autosave retains independent Line and Fill images', Object.values(head.drawings).some(d => !!d.line && !!d.fill));
  const backup = await captureProject(app.project,{mode:'archive',source:k=>store.getAsset(k)}).settle();
  const bytes = writeZip([{name:'project.json',data:new TextEncoder().encode(stringifyProjectFile(backup.file))},...[...backup.assets].map(([name,data])=>({name,data}))]);
  await files.importFile(new File([bytes as BlobPart],'inkpaint.2dope')); await app.residency.ensure(app.drawing); await settle();
  const out = document.createElement('canvas'); out.width=out.height=128; drawComp(out.getContext('2d')!,app.project,app.project.comp,0,{export:true});
  check('Portable project reload renders the same paint through the shared compositor', equals(pixel(64,64),[230,57,70]) && equals([...out.getContext('2d')!.getImageData(64,64,1,1).data],[230,57,70]) && pixel(20,64,'line')[3]! > 0);
  await fresh('pen'); stroke(square); await settle();
  check('A committed vector outline stays editable and fills on pen-up', app.drawing.vectors.length === 1 && app.drawing.vectors[0]!.color === '#18181b' && equals(pixel(64,64),[230,57,70]) && app.history.peekUndo()?.label === 'Ink & Paint');
  app.undo(); await settle(); const vectorRemoved = app.drawing.vectors.length === 0 && pixel(64,64)[3] === 0; app.redo(); await settle();
  check('Vector and automatic paint share one Undo/Redo', vectorRemoved && app.drawing.vectors.length === 1 && equals(pixel(64,64),[230,57,70]));
  await fresh(); seededOpen(); const fill = planeCanvas(app.drawing,'fill').getContext('2d')!; fill.fillStyle='#2a9d8f';fill.fillRect(45,45,10,10); fill.fillStyle='rgba(10,20,30,.5)';fill.fillRect(65,65,5,5); const semi=pixel(66,66);
  stroke([[20,22],[108,22]]); await settle();
  check('Automatic paint preserves both opaque and translucent existing paint exactly', equals(pixel(48,48),[42,157,143]) && pixel(66,66).every((v,i)=>v===semi[i]) && equals(pixel(80,80),[230,57,70]));
  await fresh(); app.setTool('fill'); app.setFillMode('lasso'); app.selectShape='rect'; app.selectMoves=false; stroke([[64,12],[120,120]]); app.setTool('brush');app.setPlane('line');stroke(square);await settle();
  check('A selection restricts automatic paint without acting as a fake closing wall', !!app.spatialSelection && pixel(40,64)[3] === 0 && equals(pixel(80,64),[230,57,70]));
  await fresh(); const mask=app.project.newDrawing();app.project.layer.mask=mask.id;const mg=mask.line.getContext('2d')!;mg.fillStyle='#000';mg.fillRect(0,0,64,128);mask.rev++;app.residency.touch(mask);stroke(square);await settle();
  check('A layer mask excludes fully hidden pixels from newly applied paint', pixel(40,64)[3] === 0 && equals(pixel(80,64),[230,57,70]));
  await fresh();const queuedMask=app.project.newDrawing();app.project.layer.mask=queuedMask.id;queuedMask.line.getContext('2d')!.fillRect(0,0,64,128);queuedMask.rev++;await park(queuedMask);stroke(square);await until(()=>!app.strokeActive&&app.residency.isReady(queuedMask));
  check('Input waits for a parked layer mask and paints the intended visible region after PNG decode',pixel(40,64)[3]===0&&equals(pixel(80,64),[230,57,70])&&app.history.peekUndo()?.label==='Ink & Paint');
  const parkedDrawing=app.drawing;await park(parkedDrawing);app.undo();await until(()=>app.residency.isReady(parkedDrawing)&&!app.history.canUndo);const undoneParked=pixel(80,64)[3]===0&&pixel(20,64,'line')[3]===0;app.redo();await settle();
  check('Combined Undo/Redo reloads parked drawing canvases before restoring both planes',undoneParked&&equals(pixel(80,64),[230,57,70])&&pixel(40,64)[3]===0);
  await fresh();const m=app.project.newDrawing();app.project.layer.mask=m.id;app.setMaskEditing(true);stroke(square);await settle();
  check('Painting a mask never triggers automatic colour on the artwork or mask Fill', !app.drawing.fill && !m.fill && rgba(m,'line',20,64)[3]! > 0);app.setMaskEditing(false);
  await fresh();app.project.layer.locked=true;stroke(square);await settle();check('A locked layer rejects both ink and automatic paint', !app.history.canUndo && !app.drawing.fill && pixel(20,64,'line')[3]===0);app.project.layer.locked=false;
  app.project.layer.alphaLock=true;stroke(square);await settle();check('Alpha Lock never introduces automatic paint into blank coverage', !app.drawing.fill && pixel(20,64,'line')[3]===0);
  await fresh();seededOpen();stroke([[20,22],[108,22]],'pointercancel');await settle();
  check('Cancelled Pencil input keeps its existing ink policy but never triggers automatic paint', pixel(64,22,'line')[3]! > 0 && !app.drawing.fill && app.history.peekUndo()?.label !== 'Ink & Paint');
  await fresh();seededOpen();pointer('pointerdown',20,22);pointer('pointermove',50,22,[[108,22]]);pointer('pointerup',50,22);await settle();
  check('Predicted points cannot complete an automatic enclosure', !app.drawing.fill && pixel(90,22,'line')[3]===0);
  await fresh();seededOpen();app.setTool('eraser');stroke([[20,22],[108,22]]);await settle();check('Erasing never triggers automatic paint',!app.drawing.fill);
  app.setSmudging(true);stroke(square);await settle();check('Smudging never triggers automatic paint',!app.drawing.fill);
  await fresh();app.setPlane('fill');stroke(square);await settle();check('Direct painting on Fill retains its brush behaviour without filling the enclosed middle',pixel(20,64)[3]! > 0 && pixel(64,64)[3]===0 && pixel(20,64,'line')[3]===0);
  await fresh('pen');app.quickShape=true;pointer('pointerdown',20,20);for(const p of square.slice(1))pointer('pointermove',...p);await new Promise(r=>setTimeout(r,600));pointer('pointerup',20,20);await settle();
  check('A held QuickShape paints its committed enclosure and remains editable',app.shapeEditable&&equals(pixel(64,64),[230,57,70]));
  app.swapShape('ellipse');await settle();const outsideEllipse=pixel(26,26)[3]===0;
  app.undo();await settle();const undone=app.drawing.vectors.length===0&&pixel(64,64)[3]===0;app.redo();await settle();
  check('Edit shape replaces the previous automatic fill and remains a single Undo/Redo',outsideEllipse&&undone&&equals(pixel(64,64),[230,57,70])&&app.drawing.vectors.length===1);
  await fresh('pen',1920,1080);if(app.autoPaintSupported){const t=performance.now();stroke([[40,40],[1880,40],[1880,1040],[40,1040],[40,40]]);const ms=performance.now()-t;check(`Full HD committed ink plus paint finishes (${Math.round(ms)} ms on this desktop)`,equals(pixel(960,540),[230,57,70])&&ms<1500);}
  const lite=app.device.lite;app.setInkPaint(false);app.device.lite=true;app.setInkPaint(true);
  check('Lite refuses automatic paint on a Full HD page before allocating detection buffers',!app.inkPaint.enabled&&notices.some(m=>m.includes('921,600'))&&autoPaintLimit(false)===4194304);app.device.lite=lite;
} catch(e){check(String(e),false);}
finally { if(app.playing)app.togglePlay();await files.autosaver.flush();files.autosaver.stop();keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);}); }
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
