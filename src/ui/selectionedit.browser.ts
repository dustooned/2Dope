/** Colour selection with a live threshold, Reselect, and Copy/Cut to a new layer: the real App and Bubbles, an in-memory project. */
import { App } from '../app';
import { Project } from '../core/project';
import { Bubbles } from './bubbles';

// device preferences this page changes, put back exactly as they were at the end
const saved = Object.keys(localStorage).filter((k) => k.startsWith('2dope.')).map((k) => [k, localStorage.getItem(k)!] as const);
for (const k of ['2dope.symmetry', '2dope.guide', '2dope.inkpaint', '2dope.quickshape', '2dope.fill.mode', '2dope.select.shape', '2dope.select.threshold', '2dope.ui.level']) localStorage.removeItem(k);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage);
app.loadProject(new Project(128, 128));
app.project.comp.duration = 24;
app.setWorkspace('draw');
app.setFrame(0);
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, layerCards() {}, fit: () => app.refit(), editShape() {} });
bubbles.setLevel('simple', false);
const refresh = () => bubbles.update();
app.onFrameChange = refresh; app.onCompChange = refresh; app.onToolChange = refresh; app.onBrushChange = refresh; app.history.onChange = refresh;
const notices: string[] = [];
app.onNotice = (m) => notices.push(m);
const settle = (ms = 140) => new Promise<void>((r) => setTimeout(r, ms));
const chip = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.bub-ctx button')].find((b) => b.getAttribute('aria-label') === name) ?? null;
function pointer(type: string, x: number, y: number, dx = 0) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, pressure: 1, clientX: r.left + p.x + dx, clientY: r.top + p.y }));
}
const tap = (x: number, y: number) => { pointer('pointerdown', x, y); pointer('pointerup', x, y); };
const sel = (x: number, y: number) => app.spatialSelection?.mask[y * 128 + x] ?? 0;
const alphaOf = (c: HTMLCanvasElement, x: number, y: number) => c.getContext('2d')!.getImageData(x, y, 1, 1).data[3]!;
/** Paint rectangles straight onto the current drawing's Line plane (test setup, not an edit). */
function paint(rects: [string, number, number, number, number][]) {
  const g = app.drawing.line.getContext('2d')!;
  for (const [c, x, y, w, h] of rects) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  app.requestRender();
}
async function fresh() {
  app.clearSpatialSelection();
  for (const c of [app.drawing.line, app.drawing.fill]) c?.getContext('2d')!.clearRect(0, 0, 128, 128);
  app.drawing.vectors = [];
  app.history.clear();
  app.setTool('fill');
  app.setFillMode('lasso');
  app.setSelectOp('new');
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

  // colour selection
  paint([['rgb(200,0,0)', 0, 0, 40, 128], ['rgb(215,0,0)', 40, 0, 24, 128], ['rgb(0,0,255)', 64, 0, 64, 128]]);
  check('Select offers a Colour shape chip', !!chip('Colour'));
  chip('Colour')!.click(); await settle();
  check('Colour sets the selection shape and is pressed', app.selectShape === 'color' && chip('Colour')!.getAttribute('aria-pressed') === 'true');
  app.wandThreshold = 0;
  tap(20, 64); await settle();
  check('A tap at threshold 0 selects only that exact colour', sel(20, 64) === 1 && sel(50, 64) === 0 && sel(100, 64) === 0, [sel(20, 64), sel(50, 64), sel(100, 64)]);
  check('A new colour selection stays a selection (no Transform)', !app.transforming);
  check('A colour selection adds no undo step', !app.history.canUndo);

  // live threshold: drag right while the pen is down
  app.clearSpatialSelection();
  pointer('pointerdown', 20, 64);
  pointer('pointermove', 20, 64, 30); // +15% at 2 px per percent
  const live = sel(50, 64);
  pointer('pointermove', 20, 64, 0); // back to 0%
  const back = sel(50, 64);
  pointer('pointermove', 20, 64, 30);
  pointer('pointerup', 20, 64, 30); await settle();
  check('Dragging sideways raises the threshold live, and dragging back lowers it', live === 1 && back === 0 && sel(50, 64) === 1 && sel(100, 64) === 0, { live, back, at50: sel(50, 64) });
  check('The threshold you finish on is remembered', Math.abs(app.wandThreshold - 0.15) < 1e-9 && localStorage.getItem('2dope.select.threshold') === '0.15', app.wandThreshold);
  check('A live threshold notice names the value', notices.some((n) => n === 'Threshold 15%'));

  // cancel restores what was selected before
  const before = app.spatialSelection;
  pointer('pointerdown', 100, 64);
  pointer('pointercancel', 100, 64); await settle();
  check('Cancelling a colour selection puts the previous selection back', app.spatialSelection === before && sel(20, 64) === 1 && sel(100, 64) === 0);

  // Add combines with the previous selection
  app.setSelectOp('add');
  tap(100, 64); await settle();
  check('Colour + Add keeps the old selection and adds the new colour', sel(20, 64) === 1 && sel(100, 64) === 1);
  app.setSelectOp('subtract');
  tap(100, 64); await settle();
  check('Colour + Subtract takes that colour away again', sel(20, 64) === 1 && sel(100, 64) === 0);
  app.setSelectOp('new');

  // Reselect
  const mask = app.spatialSelection!.mask;
  check('No Reselect while something is selected', !chip('Reselect'));
  chip('Deselect')!.click(); await settle();
  check('After Deselect the Reselect chip appears', !app.spatialSelection && !!chip('Reselect'));
  chip('Reselect')!.click(); await settle();
  check('Reselect brings back the same selection', app.spatialSelection?.mask === mask && !chip('Reselect'));
  app.clearSpatialSelection();
  app.setFrame(1); await settle();
  check('Reselect is not offered on another frame', !app.canReselect && !chip('Reselect'));
  app.setFrame(0); await settle();
  check('Back on the frame it came from, Reselect is offered again', app.canReselect);
  app.reselect(); await settle();

  // Copy to new layer (selection: both reds, x 0..63)
  const src = app.project.activeLayer, srcDrawing = app.drawing, layers0 = app.project.comp.layers.length;
  check('Copy to layer and Cut to layer chips are offered with a selection', !!chip('Copy to layer') && !!chip('Cut to layer'));
  chip('Copy to layer')!.click(); await settle();
  const copyLayer = app.project.activeLayer, copyDrawing = app.drawing;
  check('Copy to layer adds one layer just above and draws on it', app.project.comp.layers.length === layers0 + 1 && copyLayer !== src && app.project.comp.layers.findIndex((l) => l.id === copyLayer) === app.project.comp.layers.findIndex((l) => l.id === src) - 1);
  check('The new layer holds only the selected pixels, in place', alphaOf(copyDrawing.line, 20, 64) === 255 && alphaOf(copyDrawing.line, 50, 64) === 255 && alphaOf(copyDrawing.line, 100, 64) === 0);
  check('Copy leaves the original drawing as it was', alphaOf(srcDrawing.line, 20, 64) === 255 && alphaOf(srcDrawing.line, 100, 64) === 255);
  check('Copy to layer is one undo step', app.history.peekUndo()?.label === 'Copy to new layer');
  app.undo(); await settle();
  check('One Undo removes the new layer', app.project.comp.layers.length === layers0 && !app.project.comp.layers.some((l) => l.id === copyLayer));
  app.redo(); await settle();
  check('Redo brings the new layer back', app.project.comp.layers.some((l) => l.id === copyLayer));
  app.undo(); await settle();

  // Cut to new layer, and timing: the layer shows drawing A for 2 frames, then B for 3
  app.focusLayer(src);
  const l = app.project.layer, other = app.project.newDrawing();
  l.exposures = [{ drawing: srcDrawing.id, length: 2 }, { drawing: other.id, length: 3 }];
  app.onCompChanged(); app.setFrame(0); await settle();
  app.setTool('fill'); app.setFillMode('lasso'); app.setSelectShape('rect');
  pointer('pointerdown', 10, 10); pointer('pointermove', 30, 30); pointer('pointerup', 30, 30); await settle();
  const top = app.history.peekUndo();
  chip('Cut to layer')!.click(); await settle();
  const cutLayer = app.project.layer, cutDrawing = app.drawing;
  check('Cut to layer removes the pixels inside from the original and keeps the rest', alphaOf(srcDrawing.line, 20, 20) === 0 && alphaOf(srcDrawing.line, 20, 64) === 255);
  check('Cut to layer moves them onto the new layer', alphaOf(cutDrawing.line, 20, 20) === 255 && alphaOf(cutDrawing.line, 20, 64) === 0);
  check('The new layer keeps the same timing: the copy on the first 2 frames, nothing on the next 3', cutLayer.exposures.map((e) => e.length).join() === '2,3' && cutLayer.exposures[0]!.drawing === cutDrawing.id && cutLayer.exposures[1]!.drawing !== other.id);
  app.setFrame(3); await settle();
  check('Where the original shows another drawing, the new layer shows nothing', alphaOf(app.drawing.line, 20, 20) === 0 && app.drawing !== cutDrawing);
  app.setFrame(0); await settle();
  check('Cut to layer is one undo step', app.history.peekUndo()?.label === 'Cut to new layer');
  app.undo(); await settle();
  check('One Undo puts the cut pixels back and removes the layer', app.history.peekUndo() === top && alphaOf(srcDrawing.line, 20, 20) === 255 && !app.project.comp.layers.some((x) => x.id === cutLayer.id));

  await fresh();
  paint([['#246', 20, 20, 34, 34]]);
  app.setSelectShape('free');
  tap(16, 16); tap(64, 16);
  pointer('pointerdown', 64, 29); pointer('pointermove', 61, 48); pointer('pointerup', 64, 65);
  tap(16, 65);
  check('Freehand can add a drawn edge to an open tapped polygon', !app.spatialSelection);
  tap(16, 16);
  check('Tapping the start node closes the polygon without an undo entry', sel(35, 35) === 1 && sel(70, 70) === 0 && !app.history.canUndo);

  app.toggleDrawTransform();
  const touch = (type: string, id: number, x: number, y: number) => {
    const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
    canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, clientX: r.left + p.x, clientY: r.top + p.y }));
  };
  const zoom = app.view.zoom;
  touch('pointerdown', 10, 31, 38); touch('pointerdown', 11, 49, 38);
  touch('pointermove', 10, 22, 38); touch('pointermove', 11, 58, 38);
  touch('pointerup', 10, 22, 38); touch('pointerup', 11, 58, 38);
  check('Pinching inside Transform scales the selection around its centre', Math.abs((app.transformParams?.scale ?? 0) - 2) < 0.05 && app.view.zoom === zoom && app.transformParams?.dx === 0);
  touch('pointerdown', 10, 82, 78); touch('pointerdown', 11, 102, 78);
  touch('pointermove', 11, 111, 78);
  touch('pointerup', 10, 82, 78); touch('pointerup', 11, 111, 78);
  check('Pinching outside Transform navigates the canvas', app.view.zoom > zoom && Math.abs((app.transformParams?.scale ?? 0) - 2) < 0.05);
  app.applyTransform(); await settle();
  check('The Transform commits as one Undo', !!app.history.canUndo);
  app.undo(); await settle();
  check('Undo restores the original artwork dimensions', alphaOf(srcDrawing.line, 18, 18) === 0 && alphaOf(srcDrawing.line, 25, 25) === 255);
  app.clearSpatialSelection();
  app.setFingerPaint(false);
  const fingerTap = (x: number, y: number) => { touch('pointerdown', 20, x, y); touch('pointerup', 20, x, y); };
  fingerTap(16, 16); fingerTap(64, 16); fingerTap(64, 64); fingerTap(16, 64); fingerTap(16, 16);
  check('A finger can tap a lasso even with finger painting switched off', sel(35, 35) === 1 && sel(70, 70) === 0 && !app.history.canUndo);
  // Polygon select: tap corners, close on the first dot; Shift adds, Alt subtracts, Backspace takes a corner back
  await fresh();
  app.setSelectShape('poly');
  tap(10, 10); tap(60, 10); tap(60, 60);
  check('Polygon keeps tapped corners until closed', app.selectDraftPoints === 3 && !app.spatialSelection);
  tap(30, 90); await settle();
  app.undoSelectPoint();
  check('Undo corner takes back the last corner', app.selectDraftPoints === 3);
  tap(10, 60); tap(10, 10); await settle();
  check('Tapping the first dot closes the polygon into a selection', app.selectDraftPoints === 0 && sel(30, 30) === 1 && sel(100, 100) === 0);
  const tapWith = (x: number, y: number, mod: { shiftKey?: boolean; altKey?: boolean }) => {
    const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 1, clientX: r.left + p.x, clientY: r.top + p.y, ...mod }));
  };
  tapWith(80, 80, { shiftKey: true }); tapWith(120, 80, {}); tapWith(120, 120, {}); tapWith(80, 120, {}); tapWith(80, 80, {}); await settle();
  check('Shift adds a second polygon to the selection', sel(30, 30) === 1 && sel(100, 100) === 1 && app.selectOp === 'new');
  tapWith(20, 20, { altKey: true }); tapWith(40, 20, {}); tapWith(40, 40, {}); tapWith(20, 40, {}); tapWith(20, 20, {}); await settle();
  check('Alt subtracts a polygon from the selection', sel(30, 30) === 0 && sel(50, 50) === 1 && sel(100, 100) === 1);
  tap(5, 100); tap(30, 100); tap(30, 120);
  pointer('pointermove', 70, 110); await settle();
  check('An open polygon follows the pointer with a rubber-band tip', !!app.polyTip && Math.abs(app.polyTip[0] - 70) < 2);
  app.cancelSelectDraft();
  check('Cancel drops a polygon in progress and keeps the selection', app.selectDraftPoints === 0 && sel(100, 100) === 1);
  app.setSelectShape('free');

  // Ink / Colour convert
  await fresh();
  app.clearSpatialSelection();
  paint([['rgb(0,0,0)', 10, 10, 20, 20]]);
  app.convertPlane('toColour'); await settle();
  check('To Colour moves Ink paint under, onto Colour', alphaOf(app.drawing.line, 15, 15) === 0 && alphaOf(app.drawing.fill!, 15, 15) === 255);
  app.convertPlane('toInk'); await settle();
  check('To Ink moves Colour paint back on top', alphaOf(app.drawing.line, 15, 15) === 255 && alphaOf(app.drawing.fill!, 15, 15) === 0);
  app.convertPlane('swap'); await settle();
  check('Swap trades Ink and Colour', alphaOf(app.drawing.line, 15, 15) === 0 && alphaOf(app.drawing.fill!, 15, 15) === 255);
  app.undo(); await settle();
  check('One Undo puts the paint back', alphaOf(app.drawing.line, 15, 15) === 255 && alphaOf(app.drawing.fill!, 15, 15) === 0);
} catch (e) {
  check(String(e), false);
} finally {
  app.clearSpatialSelection();
  for (const k of Object.keys(localStorage)) if (k.startsWith('2dope.')) localStorage.removeItem(k);
  for (const [k, v] of saved) localStorage.setItem(k, v);
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
