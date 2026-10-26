/** A selection as a painting stencil: the real App and Bubbles, an in-memory project, no library/autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { Bubbles } from './bubbles';

// device preferences this page changes, put back exactly as they were at the end
const saved = Object.keys(localStorage).filter((k) => k.startsWith('2dope.')).map((k) => [k, localStorage.getItem(k)!] as const);
for (const k of ['2dope.symmetry', '2dope.guide', '2dope.guide.assist', '2dope.inkpaint', '2dope.quickshape', '2dope.fill.mode', '2dope.select.shape', '2dope.ui.level']) localStorage.removeItem(k);
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
const settle = (ms = 140) => new Promise<void>((r) => setTimeout(r, ms));
const options = () => document.querySelector<HTMLElement>('.bub-ctx')!;
const chip = (name: string) => [...options().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === name) ?? null;
function pointer(type: string, x: number, y: number) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 1, clientX: r.left + p.x, clientY: r.top + p.y }));
}
/** A straight stroke through the points, with pen-up unless `hold`. */
function stroke(pts: [number, number][], up = true) {
  pointer('pointerdown', pts[0]![0], pts[0]![1]);
  const [x0, y0] = pts[0]!;
  for (const [x1, y1] of pts.slice(1)) for (let k = 1; k <= 8; k++) pointer('pointermove', x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8);
  if (up) pointer('pointerup', pts[pts.length - 1]![0], pts[pts.length - 1]![1]);
}
const across = (y: number): [number, number][] => [[20, y], [108, y]];
const px = (c: HTMLCanvasElement, x: number, y: number) => [...c.getContext('2d')!.getImageData(x, y, 1, 1).data];
const alpha = (x: number, y: number) => px(app.drawing.line, x, y)[3]!;
/** Every pixel of the line plane outside the selected box, in these rows, is still `a`. */
function outsideUnchanged(y0: number, y1: number, x0: number, x1: number, before: Uint8ClampedArray): boolean {
  const d = app.drawing.line.getContext('2d')!.getImageData(0, 0, 128, 128).data;
  for (let y = y0; y < y1; y++) for (let x = 0; x < 128; x++) if (x < x0 || x >= x1) for (let c = 0; c < 4; c++) if (d[(y * 128 + x) * 4 + c] !== before[(y * 128 + x) * 4 + c]) return false;
  return true;
}
const snapshot = () => app.drawing.line.getContext('2d')!.getImageData(0, 0, 128, 128).data;
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
/** Select tool, a rectangle from (x0,y0) to (x1,y1). */
async function selectRect(x0: number, y0: number, x1: number, y1: number) {
  app.setTool('fill');
  app.setFillMode('lasso');
  app.setSelectShape('rect');
  app.setSelectOp('new');
  stroke([[x0, y0], [x1, y1]]);
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

  // 1. a new selection stays a selection
  await selectRect(40, 8, 88, 120);
  check('A new rectangle selection does not enter Transform', !!app.spatialSelection && !app.transforming);
  check('The Transform chip is the first selection action', !!chip('Transform') && !!chip('Deselect'));

  // 2. explicit shape and operation chips
  const shapeNames = ['Freehand', 'Rectangle', 'Ellipse', 'Automatic'], opNames = ['New', 'Add', 'Subtract'];
  check('Every shape and operation has its own chip', [...shapeNames, ...opNames].every((n) => chip(n)));
  chip('Ellipse')!.click(); await settle();
  check('Ellipse sets the shape directly and is the only pressed shape', app.selectShape === 'ellipse' && shapeNames.every((n) => chip(n)!.getAttribute('aria-pressed') === String(n === 'Ellipse')));
  chip('Subtract')!.click(); await settle();
  check('Subtract sets the operation directly and is the only pressed operation', app.selectOp === 'subtract' && opNames.every((n) => chip(n)!.getAttribute('aria-pressed') === String(n === 'Subtract')));
  chip('New')!.click(); chip('Rectangle')!.click(); await settle();
  check('Transform still starts from its chip', (() => { chip('Transform')!.click(); const on = app.transforming; app.cancelTransform(); return on; })());

  // 3. Brush across the boundary
  brush();
  const before3 = snapshot(), step0 = app.history.peekUndo();
  stroke(across(64)); await settle();
  check('Brush across the selection paints only inside it', alpha(30, 64) === 0 && alpha(64, 64) > 0 && alpha(100, 64) === 0, [alpha(30, 64), alpha(64, 64), alpha(100, 64)]);
  check('Pixels at the boundary are hard: nothing at x 39, paint at x 40 and 87, nothing at x 88', alpha(39, 64) === 0 && alpha(40, 64) === 255 && alpha(87, 64) === 255 && alpha(88, 64) === 0, [alpha(39, 64), alpha(40, 64), alpha(87, 64), alpha(88, 64)]);
  check('The clipped stroke is one undo step', app.history.peekUndo() !== step0 && app.history.peekUndo()?.label === 'Brush stroke');

  // 4. one Undo
  app.undo(); await settle();
  check('One Undo removes exactly that stroke', snapshot().every((v, i) => v === before3[i]) && app.history.peekUndo() === step0);

  // 5. a stroke entirely outside
  const canUndo5 = app.history.canUndo, top5 = app.history.peekUndo(), before5 = snapshot();
  stroke([[4, 30], [24, 30]]); await settle();
  check('A stroke outside the selection changes no pixels', snapshot().every((v, i) => v === before5[i]));
  check('A stroke outside the selection adds no undo step', app.history.canUndo === canUndo5 && app.history.peekUndo() === top5);

  // 7. the live preview is clipped while the pen is down
  stroke(across(80), false);
  const live = app.raster.displaySource();
  check('The live preview shows nothing outside the selection while drawing', px(live, 30, 80)[3] === 0 && px(live, 64, 80)[3]! > 0 && px(live, 100, 80)[3] === 0, [px(live, 30, 80)[3], px(live, 64, 80)[3], px(live, 100, 80)[3]]);
  pointer('pointerup', 108, 80); await settle();

  // 6. Eraser across the boundary
  await fresh();
  stroke(across(64)); await settle();
  await selectRect(40, 8, 88, 120);
  brush('eraser');
  stroke(across(64)); await settle();
  check('Eraser across the selection removes paint only inside', alpha(30, 64) > 0 && alpha(64, 64) === 0 && alpha(100, 64) > 0, [alpha(30, 64), alpha(64, 64), alpha(100, 64)]);
  const top6 = app.history.peekUndo();
  stroke([[4, 64], [30, 64]]); await settle();
  check('Erasing outside the selection does nothing and adds no undo step', alpha(20, 64) > 0 && app.history.peekUndo() === top6);

  // 8. Deselect, then a change of frame
  brush();
  app.clearSpatialSelection(); await settle();
  stroke(across(100)); await settle();
  check('After Deselect the same stroke paints on both sides', alpha(30, 100) > 0 && alpha(64, 100) > 0 && alpha(100, 100) > 0);
  await selectRect(40, 8, 88, 120);
  const frame = app.frame;
  app.setFrame(frame + 1); await settle();
  check('Changing frame drops the selection', !app.spatialSelection);
  brush();
  stroke(across(64)); await settle();
  check('After a frame change painting is unrestricted', alpha(30, 64) > 0 && alpha(100, 64) > 0);
  app.setFrame(frame); await settle();

  // 9. Alpha Lock with a selection
  await fresh();
  stroke(across(64)); await settle(); // red paint on both sides
  await selectRect(40, 8, 88, 120);
  brush();
  app.setColor('#0000ff');
  app.project.layer.alphaLock = true;
  stroke(across(64)); stroke(across(30)); await settle();
  const outRed = px(app.drawing.line, 30, 64), inBlue = px(app.drawing.line, 64, 64);
  check('Alpha Lock + selection recolours only inside', outRed[0]! > 200 && outRed[2]! < 50 && inBlue[2]! > 200 && inBlue[0]! < 50, { outRed, inBlue });
  check('Alpha Lock + selection keeps coverage (empty pixels inside stay empty)', alpha(64, 30) === 0 && alpha(30, 30) === 0);

  // 10. symmetry: mirrored dabs are clipped too (selection on the right only)
  await fresh();
  await selectRect(64, 8, 120, 120);
  brush();
  app.setSymmetry('vertical');
  stroke([[72, 40], [96, 40]]); await settle();
  check('Symmetry + selection: the stroke inside paints, its mirror outside does not', alpha(84, 40) > 0 && alpha(44, 40) === 0, [alpha(84, 40), alpha(44, 40)]);
  app.clearSpatialSelection();
  stroke([[72, 50], [96, 50]]); await settle();
  check('Without the selection the mirror paints (the check above is meaningful)', alpha(84, 50) > 0 && alpha(44, 50) > 0);

  // 11. Vector is not clipped (documented limitation)
  await fresh();
  await selectRect(40, 8, 88, 120);
  brush('pen');
  stroke(across(64)); await settle();
  const v = app.drawing.vectors[app.drawing.vectors.length - 1];
  check('A vector stroke in a selection is kept whole (not clipped)', !!v && Math.min(...v.points.map((p) => p.x)) < 40 && Math.max(...v.points.map((p) => p.x)) > 88);

  // 12. QuickShape and Edit shape keep the clip
  await fresh();
  await selectRect(40, 8, 88, 120);
  brush();
  app.quickShape = true;
  const before12 = snapshot(), step12 = app.history.peekUndo();
  stroke(across(64), false); await settle(560); pointer('pointerup', 108, 64); await settle();
  check('A QuickShape snapped inside a selection stays inside', !!app.lastShape && alpha(30, 64) === 0 && alpha(64, 64) > 0 && alpha(100, 64) === 0, { shape: !!app.lastShape, a: [alpha(30, 64), alpha(64, 64), alpha(100, 64)] });
  app.swapShape('stroke'); await settle();
  check('Edit shape → Keep my stroke stays inside the selection', app.lastShape?.choice === 'stroke' && outsideUnchanged(0, 128, 40, 88, before12) && alpha(64, 64) > 0);
  app.undo(); await settle();
  check('One Undo removes the kept stroke', snapshot().every((x, i) => x === before12[i]) && app.history.peekUndo() === step12);

  // stretch: Smudge
  await fresh();
  app.clearSpatialSelection();
  for (let y = 80; y <= 100; y += 4) stroke(across(y));
  await settle();
  await selectRect(40, 8, 88, 120);
  brush();
  Object.assign(app.brush, { size: 16 });
  app.setSmudging(true);
  const before13 = snapshot(), top13 = app.history.peekUndo();
  stroke([[30, 92], [30, 124]]); await settle();
  check('Smudge outside the selection changes nothing and adds no undo step', snapshot().every((x, i) => x === before13[i]) && app.history.peekUndo() === top13);
  stroke([[24, 92], [70, 124]]); await settle();
  let inside = 0;
  for (let y = 104; y < 128; y++) for (let x = 40; x < 88; x++) if (alpha(x, y) > 0) inside++;
  check('Smudge across the edge moves paint only inside the selection, with a hard edge', outsideUnchanged(0, 128, 40, 88, before13) && inside > 0, { inside });
  app.setSmudging(false);

  // mask editing is never clipped by the artwork selection
  await fresh();
  app.addMask(); await settle();
  app.setMaskEditing(false); // Add mask starts editing it; select on the artwork first
  await selectRect(40, 8, 88, 120);
  app.setMaskEditing(true);
  brush();
  const mask = app.maskDrawing!, selected = !!app.spatialSelection;
  stroke(across(64)); await settle();
  const ma = (x: number) => px(mask.line, x, 64)[3]!;
  check('Painting a layer mask ignores the selection', app.editingMask && selected && ma(30) > 0 && ma(64) > 0 && ma(100) > 0, { editing: app.editingMask, selected, a: [ma(30), ma(64), ma(100)] });
  app.setMaskEditing(false);
} catch (e) {
  check(String(e), false);
} finally {
  app.clearSpatialSelection();
  for (const k of Object.keys(localStorage)) if (k.startsWith('2dope.')) localStorage.removeItem(k);
  for (const [k, v] of saved) localStorage.setItem(k, v);
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
