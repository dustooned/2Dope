import { App } from '../app';
import { Project } from '../core/project';
import { drawingsLayer, newComp } from '../core/comp';
import { DeviceArtworkStore } from '../io/artworkstore';
import { importVectorDocument } from '../io/vectorimport';
import { readArtwork } from '../io/artwork';
import { drawComp } from '../view/composite';
import { ArtworkAssetsUI } from './artworkassets';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(64, 64)); app.project.comp.duration = 24; app.setWorkspace('motion');
const database = `2dope-catalog-fixture-${crypto.randomUUID()}`, store = new DeviceArtworkStore(database);
const assets = new ArtworkAssetsUI(app, document.querySelector<HTMLElement>('.painting-header')!, store);
const refresh = () => { assets.update(); }; app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.history.onChange = refresh; app.editor.onChange = refresh;
const errors: string[] = []; addEventListener('error', e => errors.push(e.message));
const wait = (ms = 80) => new Promise<void>(r => setTimeout(r, ms));
const until = async (f: () => boolean) => { const end = performance.now() + 12000; while (!f()) { if (performance.now() > end) throw new Error('Timed out'); await wait(); } };
const dialog = () => [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)!;
const button = (name: string, root: ParentNode = dialog() ?? document) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name || b.firstChild?.textContent === name); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string, root?: ParentNode) => { const b = button(name, root); if (b.disabled) throw new Error(`Disabled ${name}`); b.click(); };
const select = (name: string, value: string) => { const s = dialog().querySelector<HTMLSelectElement>(`select[aria-label="${name}"]`)!; s.value = value; s.dispatchEvent(new Event('change')); };
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const paint = (c: HTMLCanvasElement, color: string) => { const g = c.getContext('2d')!; g.clearRect(0, 0, 64, 64); g.fillStyle = color; g.fillRect(0, 0, 64, 64); };
const visible = () => [...document.querySelectorAll<HTMLElement>('.artwork-library .artwork-card')].filter(c => !c.hidden).map(c => c.getAttribute('aria-label'));
let passed = 0, failed = 0, source = '', saved = '', copy = '';
async function check(name: string, run: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await run(); li.textContent = `PASS: ${name}`; passed++; } catch (e) { li.textContent = `FAIL: ${name}: ${e}`; failed++; } document.querySelector('#results')!.append(li); }

await check('A fresh durable library stores drawing, vector and animated-clip metadata', async () => {
  source = assets.assets.create('Walk')!; const p = app.project, c = p.comps.get(source)!, layer = c.layers[0]!;
  if (layer.kind !== 'drawings') throw new Error('No paint layer');
  const red = p.drawing(layer.exposures[0]!.drawing), green = p.newDrawing(); paint(red.line, '#ff0000'); paint(green.line, '#00ff00'); red.rev++; green.rev++;
  layer.exposures = [{ drawing: red.id, length: 2 }, { drawing: green.id, length: 2 }]; c.fps = 6;
  saved = (await assets.library.saveSource(source)).id; assets.assets.done(); app.setWorkspace('motion'); app.setFrame(7);
  for (const [name, vector] of [['Badge', true], ['Backdrop', false]] as const) {
    const comp = newComp(p.newId('c'), name, 64, 64, 12), d = p.newDrawing(); comp.asset = true;
    if (vector) d.vectors = importVectorDocument('<svg viewBox="0 0 64 64"><path d="M8 8H56V56H8Z" fill="#ff9900"/></svg>').strokes;
    else { paint(d.line, '#2040ff'); d.rev++; }
    comp.layers.push(drawingsLayer(p.newId('L'), 'Artwork', [{ drawing: d.id, length: 1 }], 64, 64)); p.comps.set(comp.id, comp);
    await assets.library.saveSource(comp.id);
  }
  const cards = await new DeviceArtworkStore(database).list();
  expect(cards.length === 3 && cards.find(c => c.name === 'Walk')?.kind === 'clip' && cards.find(c => c.name === 'Badge')?.kind === 'vector' && cards.find(c => c.name === 'Backdrop')?.kind === 'drawing', 'catalog types were lost');
});
await check('Collections can be created by moving artwork, and survive a fresh store connection', async () => {
  assets.library.show(); await until(() => !!document.querySelector('.artwork-library article'));
  document.querySelector<HTMLElement>(`article[data-asset-id="${saved}"] summary`)!.click(); click('Move saved Walk to collection'); click('New collection…');
  await wait(); dialog().querySelector<HTMLInputElement>('input')!.value = 'Characters'; click('Create and move');
  await until(() => !assets.library.busy);
  expect((await new DeviceArtworkStore(database).get(saved))?.card.collection === 'Characters', 'collection not persisted');
  select('Asset collection', 'Characters'); expect(visible().join() === 'Saved Walk', 'collection filter wrong');
});
await check('Library filters and sorting use metadata without changing project history or the shared clock', () => {
  const history = app.history.peekUndo(), frame = app.frame;
  select('Asset collection', '*'); select('Asset type', 'vector'); expect(visible().join() === 'Saved Badge', 'vector filter wrong');
  select('Asset type', 'drawing'); expect(visible().join() === 'Saved Backdrop', 'drawing filter wrong');
  select('Asset type', 'all'); select('Sort assets', 'name'); expect(visible().join() === 'Saved Backdrop,Saved Badge,Saved Walk', 'name order wrong');
  select('Sort assets', 'duration'); expect(visible()[0] === 'Saved Walk' && app.frame === frame && app.history.peekUndo() === history, 'duration or view-only behavior wrong');
});
await check('A saved clip previews its later drawing and plays on an isolated clock', async () => {
  const frame = app.frame, history = app.history.peekUndo(); click('Preview saved Walk'); await until(() => !!document.querySelector('.asset-preview-dialog'));
  const preview = dialog(), seek = preview.querySelector<HTMLInputElement>('input')!; seek.value = '2'; seek.dispatchEvent(new Event('input'));
  await until(() => preview.querySelector('output')?.textContent === '3 / 4');
  const pixel = preview.querySelector('canvas')!.getContext('2d')!.getImageData(320, 180, 1, 1).data;
  expect(pixel[1]! > 245 && pixel[0]! < 5, 'scrub did not render the stored green frame');
  click('Play', preview); await wait(360); click('Pause', preview);
  expect(app.frame === frame && app.history.peekUndo() === history && !app.playing, 'preview changed the editor clock or document');
  click('Close asset preview', preview); expect(document.activeElement === button('Preview saved Walk'), 'preview focus did not return');
});
await check('Add & place creates an independent project source and linked Motion placement in one Undo', async () => {
  app.history.clear(); click('Add and place Walk'); await until(() => !assets.library.busy && !document.querySelector('.artwork-library'));
  const placement = app.editor.primary!; if (placement.kind !== 'comp') throw new Error('No placed comp'); copy = placement.comp;
  expect(copy !== source && !placement.locked && app.workspace === 'motion' && app.frame === 7 && app.history.peekUndo()?.label === 'Add and place library asset', 'placement identity/mode/history wrong');
  app.undo(); await wait(); expect(!app.project.comps.has(copy) && !app.project.comp.layers.some(l => l.id === placement.id) && !app.history.canUndo, 'one Undo did not remove both');
  app.redo(); await wait(); expect(app.project.comps.has(copy) && app.project.comp.layers.some(l => l.id === placement.id), 'Redo did not restore both');
});
await check('Update existing replaces one chosen library snapshot without changing placed project copies', async () => {
  const before = (await store.get(saved))!, c = app.project.comps.get(source)!, l = c.layers[0]!;
  if (l.kind !== 'drawings') throw new Error('No source layer'); const d = app.project.drawing(l.exposures[0]!.drawing); paint(d.line, '#0000ff'); d.rev++;
  const history = app.history.peekUndo(); assets.showAssets();
  const card = document.querySelector<HTMLElement>('article[aria-label="Walk"]')!; card.querySelector<HTMLElement>('summary')!.click(); click('Update saved asset from Walk', card);
  await until(() => dialog()?.querySelector('h2')?.textContent === 'Update an existing saved asset'); click('Walk');
  await until(() => !assets.library.busy && !!document.querySelector('.artwork-library'));
  const after = (await new DeviceArtworkStore(database).get(saved))!;
  expect((await store.list()).length === 3 && after.card.id === before.card.id && after.card.collection === 'Characters' && after.card.created === before.card.created && after.card.updated! >= before.card.created && app.history.peekUndo() === history, 'update duplicated or renamed the saved item or wrote document history');
  expect(!after.archive.every((v, i) => v === before.archive[i]) && (await readArtwork(after.archive)).file.comps[(await readArtwork(after.archive)).file.main]!.asset, 'updated archive incomplete');
  const copied = app.project.comps.get(copy)!, layer = copied.layers[0]!; if (layer.kind !== 'drawings') throw new Error('No copied drawing');
  await app.residency.pin(app.project.drawing(layer.exposures[0]!.drawing));
  try { const c = document.createElement('canvas'); c.width = c.height = 64; drawComp(c.getContext('2d')!, app.project, copied, 0, { export: true }); const pixel = c.getContext('2d')!.getImageData(32, 32, 1, 1).data; expect(pixel[0]! > 245 && pixel[2]! < 5, 'library update changed the placed red copy'); }
  finally { app.residency.unpin(app.project.drawing(layer.exposures[0]!.drawing)); }
});
await check('A removed update target is refused instead of silently recreated', async () => {
  const entry = (await store.remove(saved))!; let refused = false;
  try { await assets.library.saveSource(source, saved); } catch { refused = true; }
  expect(refused && !await store.get(saved), 'removed update target was resurrected'); await store.put(entry);
});
await check('Library and preview fit the screen and close cleanly after rapid seeks', async () => {
  assets.library.close(); assets.library.show(); await until(() => !!document.querySelector('.artwork-library article'));
  const r = dialog().getBoundingClientRect(); expect(r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, 'library outside viewport');
  click('Preview saved Walk'); await until(() => !!document.querySelector('.asset-preview-dialog')); const preview = dialog(), seek = preview.querySelector<HTMLInputElement>('input')!;
  for (const f of [0, 3, 1, 2]) { seek.value = String(f); seek.dispatchEvent(new Event('input')); }
  click('Close asset preview', preview); await wait(); expect(!document.querySelector('.asset-preview-dialog') && !errors.length, errors.join('; '));
});
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, assets, store };
