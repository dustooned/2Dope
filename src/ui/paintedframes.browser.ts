/**
 * Painted frames: a track whose every frame is a small paint stack (linked paint layers that the
 * rail shows as one track). Make painted, add / rename / reorder / hide inside a frame, one cel per
 * frame on the rail, Paint over copying the whole stack, a flipbook drag keeping the layers in step,
 * double-tap to paint a frame and Done, residency, save and reopen, export, and the Lite cap.
 */
import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import type { DrawingsLayer } from '../core/comp';
import { groupOf, PAINTED_MAX } from '../core/cellink';
import { moveExposure } from '../core/timeline';
import { drawComp } from '../view/composite';
import { captureProject, loadProjectFile } from '../io/projectio';
import { minimumDrawingSchema, validateProjectFile } from '../io/schema';
import { FlipMode } from './flipmode';
import { LayerCards } from './layercards';

// device settings this fixture changes; put back as they were afterwards
const savedSettings = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)!]));
const stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, stage);
const errors: string[] = [];
const notices: string[] = [];
app.onNotice = (m) => notices.push(m);
addEventListener('error', (e) => errors.push(e.message));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
app.loadProject(new Project(160, 120));
app.setWorkspace('draw');
app.setPaintOver(false);
const flip = new FlipMode(app, stage);
const cards = new LayerCards(app);
const refresh = () => { flip.update(); cards.update(); };
app.onFrameChange = refresh;
app.history.onChange = refresh;
app.editor.onChange = refresh;
app.onToolChange = refresh;
app.onWorkspaceChange = refresh;
const wait = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); }
  document.querySelector('#results')!.append(li);
};

const p = () => app.project;
const layer = (id: string) => p().comp.layers.find((l) => l.id === id) as DrawingsLayer;
const group = () => groupOf(p().comp.layers, A);
/** Paint a rectangle straight onto a drawing (what a stroke would leave). */
const paint = (d: Drawing, colour: string, x: number, y: number, w: number, h: number) => {
  const g = d.line.getContext('2d')!; g.fillStyle = colour; g.fillRect(x, y, w, h); d.rev++; app.residency.touch(d); app.residency.updateThumb(d);
};
const rgb = (c: HTMLCanvasElement, x: number, y: number) => { const d = c.getContext('2d')!.getImageData(x, y, 1, 1).data; return d[0]! > 200 && d[1]! < 80 && d[2]! < 80 ? 'red' : d[2]! > 200 && d[0]! < 80 ? 'blue' : d[3]! < 10 ? 'none' : 'other'; };
const same = (a: Drawing, b: Drawing) => { const x = a.line.getContext('2d')!.getImageData(0, 0, 160, 120).data, y = b.line.getContext('2d')!.getImageData(0, 0, 160, 120).data; return x.every((v, i) => v === y[i]); };
const rows = () => [...document.querySelectorAll<HTMLElement>('.flip-track')];
const exposureCounts = () => group().map((m) => m.exposures.map((e) => e.length).join(','));

// one animation track of two frames, a red mark on frame 1
const A = p().activeLayer;
app.appendFrame();
app.setFrame(0);
paint(p().drawing(layer(A).exposures[0]!.drawing), '#ff0000', 10, 10, 60, 60);
app.addFlipTrack(); // a plain track above, to step over
const B = p().activeLayer;
app.pickLayer(A);
app.history.clear();
flip.set(true);
refresh();
await wait(150);

await check('Make painted is one undo step and marks the track', async () => {
  const before = app.history.peekUndo();
  app.setTrackPainted(A, true); await wait();
  expect(layer(A).painted && layer(A).cel === A, 'not painted');
  expect(app.history.peekUndo() !== before, 'no undo step');
  app.history.undo(); await wait();
  expect(!layer(A).painted, 'Undo did not make it plain');
  app.history.redo(); await wait();
  expect(layer(A).painted, 'Redo did not make it painted');
});

let top = '';
await check('Add a layer inside the frame: same frames, its own blank drawings, one undo step', async () => {
  app.addPaintLayer(); await wait();
  top = p().activeLayer;
  const t = layer(top);
  expect(t && t.painted && t.cel === A && group().length === 2, 'the new layer is not in the painted stack');
  expect(t.exposures.length === 2 && t.exposures.every((e, i) => e.drawing !== layer(A).exposures[i]!.drawing), 'frames not matched or drawings shared');
  expect(app.celLayers.map((l) => l.id).join() === [top, A].join(), 'Draw’s layer list is not the frame’s layers');
  app.history.undo(); await wait();
  expect(group().length === 1, 'Undo left the layer');
  app.history.redo(); await wait();
  expect(group().length === 2, 'Redo did not bring it back');
  app.pickLayer(top);
  paint(p().drawing(layer(top).exposures[0]!.drawing), '#0000ff', 40, 40, 20, 20);
});

await check('The rail shows the painted track as one row, one cel per frame, its layers together', async () => {
  flip.update(); await wait();
  const ids = rows().map((r) => r.dataset.id);
  expect(ids.length === 2 && ids.includes(A) && !ids.includes(top) && ids.includes(B), `rows ${ids.join()}`);
  const row = rows().find((r) => r.dataset.id === A)!;
  expect(row.dataset.kind === 'painted' && row.classList.contains('active'), 'not marked painted, or not active while drawing its top layer');
  expect(row.querySelector('.flip-kind')!.textContent!.includes('2'), 'header does not count the layers');
  const cels = row.querySelectorAll('.flip-cel');
  expect(cels.length === 2 && [...cels].every((c) => c.classList.contains('painted')), `${cels.length} cels`);
  expect(!!cels[0]!.querySelector('img'), 'frame 1 shows no composite picture');
  const eye = row.querySelector<HTMLElement>('.flip-eye')!.getBoundingClientRect();
  expect(eye.height >= 44, 'header under 44 px');
});

await check('Rename, reorder and hide a frame layer (Draw’s layer actions), each undoable', async () => {
  app.editor.rename(top, 'Glaze'); await wait();
  expect(layer(top).name === 'Glaze', 'rename');
  app.editor.moveTo(top, p().comp.layers.indexOf(layer(A))); await wait();
  expect(app.celLayers[0]!.id === A, 'reorder');
  app.history.undo(); await wait();
  expect(app.celLayers[0]!.id === top, 'reorder undo');
  app.editor.setFlag(top, 'visible', false); await wait();
  const row = rows().find((r) => r.dataset.id === A)!;
  expect(!row.classList.contains('off'), 'hiding one layer hid the track');
  app.history.undo(); await wait();
  expect(layer(top).visible, 'hide undo');
});

await check('Export matches the preview: the stack composites in order, hidden layers left out', async () => {
  app.setFrame(0); await app.residency.ensure(p().drawing(layer(A).exposures[0]!.drawing)); await app.residency.ensure(p().drawing(layer(top).exposures[0]!.drawing));
  const c = document.createElement('canvas'); c.width = 160; c.height = 120;
  drawComp(c.getContext('2d')!, p(), p().comp, 0, { export: true, camera: false });
  expect(rgb(c, 50, 50) === 'blue' && rgb(c, 15, 15) === 'red', `export ${rgb(c, 50, 50)} / ${rgb(c, 15, 15)}`);
  app.editor.setFlag(top, 'visible', false);
  const h = document.createElement('canvas'); h.width = 160; h.height = 120;
  drawComp(h.getContext('2d')!, p(), p().comp, 0, { export: true, camera: false });
  expect(rgb(h, 50, 50) === 'red', 'a hidden frame layer still exported');
  app.history.undo(); await wait();
});

await check('The track eye hides every layer of the track in one step', async () => {
  const eye = rows().find((r) => r.dataset.id === A)!.querySelector<HTMLElement>('.flip-eye')!;
  eye.click(); await wait();
  expect(group().every((m) => !m.visible), 'not all hidden');
  app.history.undo(); await wait();
  expect(group().every((m) => m.visible), 'one Undo did not show them all');
});

await check('Moving the track keeps its layers together', async () => {
  app.moveTrack(A, -1); await wait();
  const order = p().comp.layers.map((l) => l.id);
  expect(order.indexOf(top) + 1 === order.indexOf(A) && order.indexOf(A) < order.indexOf(B), `order ${order.join()}`);
  app.history.undo(); await wait();
  expect(p().comp.layers.map((l) => l.id).indexOf(B) < p().comp.layers.map((l) => l.id).indexOf(top), 'Undo did not put it back');
});

await check('Paint over copies the whole stack into the new frame; Undo takes it out of every layer', async () => {
  app.setPaintOver(true);
  app.pickLayer(A);
  app.setFrame(0); await wait();
  app.addFrame(); await wait();
  expect(group().every((m) => m.exposures.length === 3), `frames ${exposureCounts().join(' / ')}`);
  const copy = (id: string) => [p().drawing(layer(id).exposures[0]!.drawing), p().drawing(layer(id).exposures[1]!.drawing)] as const;
  for (const id of [A, top]) {
    const [orig, made] = copy(id);
    expect(made !== orig && same(made, orig), `${layer(id).name} was not copied`);
  }
  app.history.undo(); await wait();
  expect(group().every((m) => m.exposures.length === 2), 'Undo left frames');
  app.setPaintOver(false);
});

await check('A flipbook drag or trim moves every layer of the frames, one undo step', async () => {
  app.pickLayer(top);
  const before = layer(top).exposures, aBefore = layer(A).exposures.map((e) => e.drawing);
  const after = moveExposure(before, 0, 1);
  app.previewExposures(after);
  app.commitExposures('Move drawing', before, after);
  expect(layer(A).exposures.map((e) => e.drawing).join() === [...aBefore].reverse().join(), 'the other layer did not follow the move');
  const longer = layer(top).exposures.map((e, i) => ({ ...e, length: i === 0 ? 3 : e.length }));
  app.previewExposures(longer);
  app.commitExposures('Hold', after, longer);
  expect(exposureCounts().every((x) => x === '3,1'), `holds ${exposureCounts().join(' / ')}`);
  app.history.undo(); app.history.undo(); await wait();
  expect(layer(A).exposures.map((e) => e.drawing).join() === aBefore.join() && exposureCounts().every((x) => x === '1,1'), 'Undo did not restore every layer');
});

await check('Double-tap a painted frame in Animate: paint it in Draw with onion; Done goes back to the frame', async () => {
  if (app.onion.enabled) app.toggleOnion();
  app.setWorkspace('animate'); flip.update(); await wait();
  const cel = rows().find((r) => r.dataset.id === A)!.querySelectorAll<HTMLElement>('.flip-cel')[1]!;
  const r = cel.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let k = 0; k < 2; k++) cel.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  await wait();
  expect(app.workspace === 'draw' && app.frame === 1 && app.onion.enabled, `workspace ${app.workspace}, frame ${app.frame}, onion ${app.onion.enabled}`);
  expect(group().some((m) => m.id === p().activeLayer), 'not drawing on the painted track');
  const done = document.querySelector<HTMLButtonElement>('.paint-frame-done')!;
  expect(!done.hidden && done.getBoundingClientRect().height >= 44, 'Done not shown, or under 44 px');
  done.click(); await wait();
  expect(app.workspace === 'animate' && app.frame === 1 && !app.onion.enabled && done.hidden, `after Done: ${app.workspace}, frame ${app.frame}, onion ${app.onion.enabled}`);
  app.setWorkspace('draw'); flip.set(true); await wait();
});

await check('Onion skin shows every layer of the frames around, and residency parks the rest', async () => {
  app.pickLayer(A); app.setFrame(1);
  if (!app.onion.enabled) app.toggleOnion();
  await wait(150);
  const neighbours = group().map((m) => p().drawing(m.exposures[0]!.drawing));
  const budget = app.residency.budget;
  app.residency.budget = 1;
  app.requestRender(); await wait(120); app.residency.schedule(); await app.residency.settle();
  expect(neighbours.every((d) => !d.parked), 'an onion neighbour’s layer was parked');
  app.toggleOnion(); app.requestRender(); await wait(120); app.residency.schedule(); await app.residency.settle();
  expect(neighbours.every((d) => !!d.parked), 'frame layers off screen were not parked');
  app.residency.budget = budget;
  app.setFrame(0); app.requestRender(); await wait(120);
  for (const d of neighbours) await app.residency.ensure(d);
  expect(neighbours.every((d) => !d.parked && d.line.width === 160) && rgb(neighbours[0]!.line, 50, 50) === 'blue' && rgb(neighbours[1]!.line, 15, 15) === 'red', 'a parked frame layer did not come back with its paint');
});

await check('Save and reopen: the painted track and its layers come back; old readers are not required', async () => {
  const saved = await captureProject(p(), { mode: 'archive' }).settle();
  const back = loadProjectFile(validateProjectFile(saved.file)).project;
  const g = groupOf(back.comp.layers, A);
  expect(g.length === 2 && g.every((m) => m.painted && m.cel === A && m.exposures.length === 2), 'the stack did not survive');
  expect(saved.file.schema === minimumDrawingSchema(saved.file.drawings, saved.file.comps) && saved.file.schema < 12, `schema ${saved.file.schema}`);
  const top0 = g.find((m) => m.id === top)!.exposures[0]!.drawing;
  expect(!!saved.file.drawings[top0]!.line, 'the frame layer’s picture was not saved');
});

await check('Lite caps a painted frame at 3 layers and warns when the last one goes in', async () => {
  const real = app.device;
  (app as unknown as { device: typeof real }).device = { ...real, lite: true };
  try {
    notices.length = 0;
    app.pickLayer(A);
    app.addPaintLayer(); await wait();
    expect(group().length === 3 && notices.some((n) => n.includes('last layer')), `3rd layer: ${group().length}, notices ${notices.join(' | ')}`);
    notices.length = 0;
    app.addPaintLayer(); await wait();
    expect(group().length === PAINTED_MAX.lite && notices.some((n) => n.includes('up to 3')), `4th layer allowed or no notice: ${notices.join(' | ')}`);
    app.history.undo(); await wait();
  } finally { (app as unknown as { device: typeof real }).device = real; }
});

await check('Making it plain again keeps every layer as linked art; the rail shows each', async () => {
  app.setTrackPainted(A, false); await wait(); flip.update();
  expect(group().every((m) => !m.painted && m.cel === A) && rows().length === 3, `${rows().length} rows`);
  app.history.undo(); await wait(); flip.update();
  expect(rows().length === 2, 'Undo did not fold it again');
});

await check('No errors', () => expect(!errors.length, errors.join(' | ')));

for (const k of Object.keys(localStorage)) if (!(k in savedSettings)) localStorage.removeItem(k);
for (const [k, v] of Object.entries(savedSettings)) localStorage.setItem(k, v);
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
export { app };
