/** Shape handles: drag the points of a snapped brush shape. The real App, an in-memory project, no library/autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { Bubbles } from './bubbles';
import { shapeHandles } from '../core/quickshape';

// device preferences this page changes, put back exactly as they were at the end
const saved = Object.keys(localStorage).filter((k) => k.startsWith('2dope.')).map((k) => [k, localStorage.getItem(k)!] as const);
for (const k of ['2dope.symmetry', '2dope.guide', '2dope.guide.assist', '2dope.inkpaint', '2dope.quickshape', '2dope.shape.handles', '2dope.fill.mode', '2dope.select.shape', '2dope.ui.level', '2dope.eraser.vector']) localStorage.removeItem(k);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage);
app.loadProject(new Project(128, 128));
app.project.comp.duration = 24;
app.setWorkspace('draw');
app.setFrame(0);
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, layerCards() {}, fit: () => app.refit(), editShape() {} });
bubbles.setLevel('simple', false);
const refresh = () => bubbles.update();
app.onFrameChange = refresh; app.onCompChange = refresh; app.onToolChange = refresh; app.onBrushChange = refresh; app.onShapeChange = refresh; app.history.onChange = refresh;
const notices: string[] = [];
app.onNotice = (m) => notices.push(m);
const settle = (ms = 140) => new Promise<void>((r) => setTimeout(r, ms));
function pointer(type: string, x: number, y: number) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 1, clientX: r.left + p.x, clientY: r.top + p.y }));
}
/** A straight stroke through the points, with pen-up unless `hold`. */
function stroke(pts: [number, number][], up = true) {
  pointer('pointerdown', pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    for (let k = 1; k <= 8; k++) pointer('pointermove', x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8);
  }
  if (up) pointer('pointerup', pts[pts.length - 1]![0], pts[pts.length - 1]![1]);
}
const px = (c: HTMLCanvasElement, x: number, y: number) => [...c.getContext('2d')!.getImageData(x, y, 1, 1).data];
const alpha = (x: number, y: number) => px(app.drawing.line, x, y)[3]!;
function brush(tool: 'brush' | 'eraser' | 'pen' = 'brush') {
  app.setSmudging(false);
  app.setTool(tool);
  app.setPlane('line');
  app.setColor('#ff0000');
  Object.assign(app.brush, { size: 8, opacity: 1, smoothing: 0, stabilize: 0, motionFilter: 0, taperStart: 0, taperEnd: 0, postSmooth: 0, grain: 0 });
}
/** Clear the page and every temporary state between checks. */
async function fresh() {
  app.clearSpatialSelection();
  app.setSymmetry('off');
  app.project.layer.alphaLock = false;
  app.quickShape = false;
  for (const c of [app.drawing.line, app.drawing.fill]) c?.getContext('2d')!.clearRect(0, 0, 128, 128);
  app.drawing.vectors = [];
  app.history.clear();
  brush();
  await settle();
}
let passed = 0, failed = 0;
function check(name: string, ok: boolean, info?: unknown) {
  const li = document.createElement('li');
  li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}${ok || info === undefined ? '' : ' ' + JSON.stringify(info)}`;
  document.querySelector('#results')!.append(li);
  if (ok) passed++; else failed++;
}

try {
  app.fit();
  await settle();
  await fresh();
  const handle = (id: string) => shapeHandles(app.lastShape!.shape!, 28 / app.view.zoom).find((h) => h.id === id)!;
  const drag = async (id: string, dx: number, dy: number) => {
    const h = handle(id);
    pointer('pointerdown', h.x, h.y);
    for (let k = 1; k <= 6; k++) pointer('pointermove', h.x + (dx * k) / 6, h.y + (dy * k) / 6);
    pointer('pointerup', h.x + dx, h.y + dy);
    await settle(120);
  };
  app.quickShape = true;

  // a held rectangle
  const step0 = app.history.peekUndo();
  stroke([[30, 30], [98, 30], [98, 80], [30, 80], [30, 30]], false); await settle(560); pointer('pointerup', 30, 30); await settle();
  // however it was recognised, Edit shape → Rectangle gives a box with handles (tests the swap path too)
  const snapKind = app.lastShape?.shape?.kind;
  app.swapShape('rect'); await settle();
  const kind = app.lastShape?.shape?.kind;
  check('A held box can be a rectangle with handles', kind === 'rect' && app.shapeEditable && !!app.lastShape?.profile.length, { snapKind, kind });
  const stepRect = app.history.peekUndo();
  const w0 = app.lastShape!.shape!.kind === 'rect' ? app.lastShape!.shape!.w : 0;
  const edge = handle('1,0');
  const midY = Math.round(edge.y), edgeX = Math.round(edge.x);
  check('The right side is painted at its handle and nothing is 20 px further right', alpha(edgeX, midY) > 0 && alpha(edgeX + 20, midY) === 0, { edgeX, midY });

  await drag('1,0', 14, 0);
  const sh = app.lastShape!.shape!;
  check('Dragging the right edge handle stretches the box to the right', sh.kind === 'rect' && sh.w > w0 + 5, sh);
  check('The right side is repainted further right and gone from where it was', alpha(edgeX + 14, midY) > 0 && alpha(edgeX, midY) === 0);
  check('The drag is one undo step that replaced the snap', app.history.peekUndo() !== stepRect && app.history.peekUndo() === app.lastShape!.cmd);
  app.undo(); await settle();
  check('One Undo removes the shape entirely', app.history.peekUndo() === step0 && alpha(edgeX, midY) === 0 && alpha(edgeX + 14, midY) === 0);

  // a held line, then an end dragged with Shift held? (no Shift here) – the end follows the pen
  await fresh(); app.quickShape = true;
  stroke([[20, 100], [100, 100]], false); await settle(560); pointer('pointerup', 100, 100); await settle();
  check('A held line snaps and offers handles', app.lastShape?.shape?.kind === 'line');
  await drag('b', 0, -50);
  const ln = app.lastShape!.shape!;
  check('Dragging the line end moves only that end', ln.kind === 'line' && Math.abs(ln.a.x - 20) < 1.5 && Math.abs(ln.b.y - 50) < 3, ln);
  check('The line is repainted toward the new end and left the old one', alpha(60, 75) > 0 && alpha(100, 100) === 0);

  // an ellipse turns with the rotate handle
  await fresh(); app.quickShape = true;
  const ring: [number, number][] = Array.from({ length: 41 }, (_, i) => [64 + Math.cos((i / 40) * Math.PI * 2) * 40, 64 + Math.sin((i / 40) * Math.PI * 2) * 22] as [number, number]);
  stroke(ring, false); await settle(560); pointer('pointerup', ring[40]![0], ring[40]![1]); await settle();
  const snapped = app.lastShape?.shape?.kind;
  if (snapped !== 'ellipse') { app.swapShape('ellipse'); await settle(); }
  const ek = app.lastShape?.shape?.kind;
  check('A held oval becomes an ellipse with handles', ek === 'ellipse', { snapped, ek });
  if (ek === 'ellipse') {
    const rotH = handle('rot');
    await drag('rot', 70 - rotH.x, 64 - rotH.y);
    const e2 = app.lastShape!.shape!;
    check('The turn handle turns the oval', e2.kind === 'ellipse' && Math.abs(e2.rot) > 0.5, e2);
  }

  // the switch turns the handles off: the same press paints instead
  await fresh(); app.quickShape = true;
  stroke([[20, 100], [100, 100]], false); await settle(560); pointer('pointerup', 100, 100); await settle();
  app.setShapeHandles(false);
  const before = app.history.peekUndo();
  stroke([[100, 100], [100, 60]]); await settle();
  check('With Shape handles off, pressing on an end draws a new stroke instead', app.history.peekUndo() !== before && app.lastShape?.shape?.kind !== 'line');
  app.setShapeHandles(true);
} catch (e) {
  check(String(e), false);
} finally {
  app.clearSpatialSelection();
  for (const k of Object.keys(localStorage)) if (k.startsWith('2dope.')) localStorage.removeItem(k);
  for (const [k, v] of saved) localStorage.setItem(k, v);
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
