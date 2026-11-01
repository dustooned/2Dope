/** Send to project: a layer or an asset copied into another stored project. MemoryStore only. */
import { App } from '../app';
import { drawingsLayer, newComp } from '../core/comp';
import { planeCanvas } from '../core/project';
import { MemoryStore } from '../io/persist';
import { loadProjectFile } from '../io/projectio';
import { parseProjectFile } from '../io/schema';
import { sendToProject } from '../io/sendto';
import { FileUI } from './files';

const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), store = new MemoryStore(), files = new FileUI(app, store, false);
let passed = 0, failed = 0;
async function check(name: string, test: () => Promise<true | string> | true | string) {
  const row = document.createElement('li');
  let r: true | string;
  try { r = await test(); } catch (e) { r = String(e); }
  if (r === true) { passed++; row.textContent = `PASS: ${name}`; } else { failed++; row.textContent = `FAIL: ${name}: ${r}`; }
  document.querySelector('#results')!.append(row);
}
const settle = () => new Promise((r) => setTimeout(r, 60));
/** A stored project's pixels for one drawing plane (decoded from the library). */
async function stored(projectId: string, drawingId: string, plane: 'line' | 'fill' = 'line') {
  const head = await store.getHead(projectId);
  const file = parseProjectFile(head!.json), key = file.drawings[drawingId]![plane];
  if (!key) return null;
  const bmp = await createImageBitmap(new Blob([(await store.getAsset(key))!.slice()], { type: 'image/png' }));
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}
const loadStored = async (id: string) => loadProjectFile(parseProjectFile((await store.getHead(id))!.json)).project;

// two empty targets (same page, and a square one), then the source: a 2-frame Head layer with Ink and Colour
await files.newProject({ name: 'Same size', width: 200, height: 100, frames: 2 });
const same = files.current!.id;
const stamp = () => { const d = app.drawing; d.line.getContext('2d')!.fillRect(0, 0, 4, 4); d.rev++; app.onDocChanged(); };
stamp(); await settle();
await files.newProject({ name: 'Square', width: 400, height: 400, frames: 2 });
const square = files.current!.id;
stamp(); await settle();
await files.newProject({ name: 'Source', width: 200, height: 100 });
const src = app.project, head = src.editLayer();
head.name = 'Head';
const d1 = src.drawing(head.exposures[0]!.drawing), d2 = src.newDrawing();
d1.line.getContext('2d')!.fillStyle = '#d00'; d1.line.getContext('2d')!.fillRect(20, 20, 40, 30);
planeCanvas(d2, 'fill').getContext('2d')!.fillStyle = '#00c'; planeCanvas(d2, 'fill').getContext('2d')!.fillRect(100, 40, 20, 20);
d1.rev++; d2.rev++;
head.exposures = [{ drawing: d1.id, length: 2 }, { drawing: d2.id, length: 3 }];
// an asset in the source: one drawing layer in its own comp
const ad = src.newDrawing();
ad.line.getContext('2d')!.fillStyle = '#0a0'; ad.line.getContext('2d')!.fillRect(90, 40, 20, 20); ad.rev++;
const asset = newComp('cAsset', 'Hat', 200, 100, src.fps); asset.asset = true;
asset.layers.push(drawingsLayer('LA', 'Hat', [{ drawing: ad.id, length: 1 }], 200, 100));
src.comps.set(asset.id, asset);
app.onDocChanged(); await settle();
const before = JSON.stringify([...src.comps.values()]), undo = app.history.peekUndo();

await check('A layer sent to the start of a same-size project lands on top from frame 1, every frame, pixels identical', async () => {
  const r = await sendToProject(src, { kind: 'layer', layers: [head.id] }, store, same, 'start', app.residency);
  if (r.scaled || r.target !== 'Same size') return JSON.stringify(r);
  const t = await loadStored(same), top = t.comps.get(t.main)!.layers[0]!;
  if (top.kind !== 'drawings' || top.name !== 'Head' || top.start !== 0) return `top layer ${top.name} at ${top.start}`;
  if (top.exposures.map((e) => e.length).join() !== '2,3') return `exposures ${top.exposures.map((e) => e.length)}`;
  const a = await stored(same, top.exposures[0]!.drawing), b = d1.line.getContext('2d')!.getImageData(0, 0, 200, 100);
  if (!a || !a.data.every((v, i) => v === b.data[i])) return 'frame 1 pixels differ';
  const fill = await stored(same, top.exposures[1]!.drawing, 'fill');
  return (!!fill && fill.data[(50 * 200 + 110) * 4 + 3] === 255) || 'frame 2 Colour missing';
});

await check('Sent to a different page size, the drawing is scaled to fit and centred', async () => {
  const r = await sendToProject(src, { kind: 'layer', layers: [head.id] }, store, square, 'start', app.residency);
  if (!r.scaled) return 'not scaled';
  const t = await loadStored(square), top = t.comps.get(t.main)!.layers[0]!;
  if (top.kind !== 'drawings') return 'no drawing layer';
  const img = await stored(square, top.exposures[0]!.drawing);
  // 200×100 → 400×400: scale 2, 100 px down. The red box (20,20)-(60,50) lands at (40,140)-(120,200)
  const at = (x: number, y: number) => img!.data[(y * 400 + x) * 4 + 3]!;
  if (img!.width !== 400 || at(80, 170) !== 255 || at(80, 120) !== 0 || at(30, 170) !== 0) return `alpha ${at(80, 170)}, ${at(80, 120)}, ${at(30, 170)}`;
  return (top.transform.position.value[0] === 200 && top.transform.position.value[1] === 200) || `position ${top.transform.position.value}`;
});

await check('Sent to the asset library, a layer becomes an unplaced asset named after it', async () => {
  const layersBefore = (await loadStored(same)).comps.get((await loadStored(same)).main)!.layers.length;
  await sendToProject(src, { kind: 'layer', layers: [head.id] }, store, same, 'library', app.residency);
  const t = await loadStored(same), assets = [...t.comps.values()].filter((c) => c.asset);
  if (!assets.some((c) => c.name.startsWith('Head') && c.layers.length === 1)) return assets.map((c) => c.name).join();
  return t.comps.get(t.main)!.layers.length === layersBefore || 'something was placed';
});

await check('An asset sent to the start is added and placed at frame 1; to the library it stays unplaced', async () => {
  await sendToProject(src, { kind: 'asset', comp: asset.id }, store, same, 'start', app.residency);
  let t = await loadStored(same);
  const placed = t.comps.get(t.main)!.layers[0]!;
  if (placed.kind !== 'comp' || !t.comps.get(placed.comp)?.asset || placed.start !== 0 || !placed.locked) return `top ${placed.kind} ${placed.name}`;
  const hat = t.comps.get(placed.comp)!.layers[0]!;
  if (hat.kind !== 'drawings') return 'asset layer missing';
  const img = await stored(same, hat.exposures[0]!.drawing);
  if ((img?.data[(50 * 200 + 100) * 4 + 1] ?? 0) < 150) return 'asset pixels missing';
  const count = [...t.comps.values()].filter((c) => c.asset).length;
  await sendToProject(src, { kind: 'asset', comp: asset.id }, store, square, 'library', app.residency);
  t = await loadStored(square);
  return ([...t.comps.values()].some((c) => c.asset && c.name.startsWith('Hat')) && !t.comps.get(t.main)!.layers.some((l) => l.kind === 'comp') && count >= 2) || 'library send placed it or lost it';
});

await check('The open project is not changed and gets no undo step', () =>
  (JSON.stringify([...src.comps.values()]) === before && app.history.peekUndo() === undo && files.current?.name === 'Source') || 'source changed');

await check('The targets still open (their old drawings kept)', async () => {
  for (const id of [same, square]) if (!(await files.openProject(id, true))) return `could not open ${id}`;
  const p = app.project, old = p.comps.get(p.main)!.layers.at(-1)!;
  if (old.kind !== 'drawings') return 'old layer missing';
  await app.residency.pin(p.drawing(old.exposures[0]!.drawing));
  const px = p.drawing(old.exposures[0]!.drawing).line.getContext('2d')!.getImageData(1, 1, 1, 1).data[3];
  return px === 255 || `old drawing pixel ${px}`;
});
await settle();
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
