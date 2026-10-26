/** Actual UI + disposable IndexedDB artwork library + in-memory project autosave. */
import { App } from '../app';
import { Project, planeCanvas } from '../core/project';
import { compLength, drawingsLayer } from '../core/comp';
import { PRESETS } from '../core/brush';
import { MemoryStore, assetsOf } from '../io/persist';
import { parseProjectFile } from '../io/schema';
import { DeviceArtworkStore, type ArtworkStore } from '../io/artworkstore';
import { readArtwork, packArtwork, libraryArtwork } from '../io/artwork';
import { captureProject } from '../io/projectio';
import { drawComp } from '../view/composite';
import { ArtworkAssetsUI } from './artworkassets';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { FileUI } from './files';

const keys = ['2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view', '2dope.flip.mini', '2dope.m0.brush', '2dope.m0.color'];
const saved = keys.map(k => localStorage.getItem(k)); for (const k of keys) localStorage.removeItem(k);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), flip = new FlipMode(app, stage);
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh());
const dbName = `2dope-artwork-check-${crypto.randomUUID()}`, device = new DeviceArtworkStore(dbName);
let failSave = false, failRemove = false, holdRead: (() => void) | null = null, delayRead = false, reads = 0;
const store: ArtworkStore = { list: () => device.list(), put: async e => { if (failSave) throw new Error('Test storage full'); await device.put(e); },
  rename: (id, name) => device.rename(id, name), remove: async id => { if (failRemove) throw new Error('Test removal failed'); return device.remove(id); },
  get: async id => { reads++; if (delayRead) await new Promise<void>(r => { holdRead = r; }); return device.get(id); } };
const assets = new ArtworkAssetsUI(app, document.querySelector<HTMLElement>('.painting-header')!, store);
const projects = new MemoryStore(), files = new FileUI(app, projects, false); assets.library.openProject = f => files.importFile(f);
const notices: string[] = []; app.onNotice = m => { notices.push(m); };
function refresh() { painting.update(); assets.update(); }
app.onFrameChange = () => { flip.update(); refresh(); }; app.onCompChange = refresh; app.onWorkspaceChange = () => { flip.update(); refresh(); }; app.editor.onChange = refresh; app.history.onChange = refresh; flip.onChange = refresh;
const settle = async () => { await new Promise<void>(r => setTimeout(r, 100)); await new Promise(requestAnimationFrame); };
async function until(predicate: () => boolean) { const end = performance.now() + 10000; while (!predicate()) { if (performance.now() > end) throw new Error('Timed out waiting for UI'); await settle(); } }
const button = (name: string, scope: ParentNode = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document) => { const b = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.offsetParent && [b.getAttribute('aria-label'), b.textContent?.trim()].includes(name)); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string) => { const b = button(name); if (b.disabled) throw new Error(`Disabled ${name}`); b.click(); };
function paint(c: HTMLCanvasElement, colour: string, x = 0) { const g = c.getContext('2d')!; g.fillStyle = colour; g.fillRect(x, 0, c.width - x, c.height); }
function pixel(p: Project, comp: string, frame: number, x: number) { const c = document.createElement('canvas'); c.width = c.height = 16; drawComp(c.getContext('2d')!, p, p.comps.get(comp)!, frame, { export: true }); return [...c.getContext('2d')!.getImageData(x, 8, 1, 1).data]; }
const colour = (pixel: number[], rgb: number[]) => rgb.every((v, i) => Math.abs(pixel[i]! - v) <= 1) && pixel[3]! > 250;
const hit = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9 && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); };
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
try {
  await files.newProject({ name: 'First project', width: 16, height: 16, fps: 12, frames: 24 }); app.setWorkspace('draw'); app.setFrame(5); await settle();
  const originalProject = app.project, originalCard = files.current!.id;
  assets.assets.create('Library landscape');
  const source = app.project.comp, ink = app.drawing, next = app.project.newDrawing(), background = app.project.newDrawing(), mask = app.project.newDrawing();
  paint(planeCanvas(ink, 'fill'), '#ff0000', 8); paint(planeCanvas(next, 'fill'), '#00ff00', 8); paint(planeCanvas(background, 'fill'), '#0000ff');
  ink.vectors = [{ id: 'test-vector', tool: 'pen', brush: { ...PRESETS[0]!, size: 1 }, color: '#000000', seed: 1, points: [{ x: 1, y: 1, pressure: 1, tiltX: 0, tiltY: 0, t: 0 }, { x: 3, y: 1, pressure: 1, tiltX: 0, tiltY: 0, t: 10 }] }];
  app.project.layer.exposures = [{ drawing: ink.id, length: 2 }, { drawing: next.id, length: 2 }]; app.project.layer.mask = mask.id;
  const bg = drawingsLayer(app.project.newId('L'), 'Background', [{ drawing: background.id, length: 1 }], 16, 16); bg.still = true; bg.play = 'loop'; source.layers.push(bg); source.fps = 6;
  for (const d of [ink, next, background]) { d.rev++; app.residency.updateThumb(d); } app.setFrame(2); app.onDocChanged(); await files.autosaver.flush();
  const before = app.history.peekUndo(); click('Assets (1)'); click('Save Library landscape to My Assets');
  await until(() => !!document.querySelector('.artwork-library article') && !assets.library.busy);
  const cards = await new DeviceArtworkStore(dbName).list(), entry = (await device.get(cards[0]!.id))!, stored = await readArtwork(entry.archive);
  check('Save creates a durable library card without changing source position or document history', cards.length === 1 && app.project.activeComp === source.id && app.frame === 2 && app.history.peekUndo() === before);
  check('A fresh store connection reads the same complete layered four-frame snapshot', stored.file.canvas.width === 16 && stored.file.comps[stored.file.main]!.layers.length === 2 && stored.file.comps[stored.file.main]!.fps === 6 && compLength(source, originalProject.comps) === 4 && Object.keys(stored.file.drawings).length === 4);
  check('The saved source keeps separate Fill, vectors and mask references', Object.values(stored.file.drawings).some(d => d.fill && d.vectors.length === 1) && !!stored.file.comps[stored.file.main]!.layers[0]!.mask);
  button('Add copy of Library landscape').scrollIntoView({ block: 'nearest' }); await settle();
  check('My Assets keeps fixed navigation and 44px actions reachable after body scrolling', hit(button('Close My Assets')) && hit(button('In this project')) && hit(button('Import artwork file')) && hit(button('Add copy of Library landscape')));
  click('Close My Assets'); paint(planeCanvas(ink, 'fill'), '#ffffff'); ink.rev++; app.residency.updateThumb(ink); app.onDocChanged();
  check('Editing the original source does not alter the saved library package', [...(await device.get(entry.card.id))!.archive].every((v, i) => v === entry.archive[i]));
  await files.newProject({ name: 'Second project', width: 16, height: 16, fps: 24, frames: 24 }); app.setFrame(7); await settle();
  // Simulate a fresh device's project image pool. My Assets retains its standalone bytes.
  await projects.deleteProject(originalCard); projects.assets.clear();
  const target = app.project, shot = target.main; app.history.clear();
  click('Assets (0)'); click('My Assets'); await until(() => !!document.querySelector('.artwork-library article')); click('Add copy of Library landscape');
  await until(() => assets.assets.list().length === 1 && !!document.querySelector('.artwork-shelf:not(.artwork-library)'));
  const copied = assets.assets.list()[0]!, draw = copied.layers[0]!; if (draw.kind !== 'drawings') throw new Error('Expected drawing track');
  check('Add copy imports editable source layers into a different project without moving its playhead', target !== originalProject && target.activeComp === shot && app.frame === 7 && copied.layers.length === 2 && draw.exposures.length === 2 && draw.exposures[0]!.drawing !== target.layer.exposures[0]!.drawing);
  check('A newly imported source can immediately be saved again from the project shelf', !assets.library.busy && !button(`Save ${copied.name} to My Assets`).disabled);
  check('One Undo removes the imported graph and Redo restores it', app.history.peekUndo()?.label === 'Add artwork from My Assets');
  click('Close assets'); app.undo(); await settle(); const removed = !target.comps.has(copied.id); app.redo(); await settle();
  check('Undo/Redo retains source vectors, mask and frame holds', removed && target.comps.has(copied.id) && !!draw.mask && target.drawing(draw.exposures[0]!.drawing).vectors.length === 1 && draw.exposures.map(e => e.length).join(',') === '2,2');
  for (const id of new Set(copied.layers.flatMap(l => l.kind === 'drawings' ? [...l.exposures.map(e => e.drawing), ...(l.mask ? [l.mask] : [])] : []))) await app.residency.pin(target.drawing(id));
  check('Copied frames render the saved red/green paint over blue rather than later original edits', colour(pixel(target, copied.id, 0, 12), [255, 0, 0]) && colour(pixel(target, copied.id, 2, 12), [0, 255, 0]) && colour(pixel(target, copied.id, 0, 4), [0, 0, 255]));
  click('Assets (1)'); click(`Place ${copied.name}`); await settle();
  check('The library copy places in Animate using the existing linked source workflow', app.workspace === 'animate' && app.placedAsset?.comp === copied.id && colour(pixel(target, shot, 8, 12), [0, 255, 0]));
  click('Edit source'); await settle(); click('Done editing asset'); await settle();
  check('Editing and Done return from the reused source to the same shot frame', app.project === target && target.activeComp === shot && app.frame === 7 && app.workspace === 'animate' && document.activeElement === canvas);
  await files.autosaver.flush(); await projects.deleteProject(originalCard);
  const head = parseProjectFile((await projects.getHead(files.current!.id))!.json);
  check('First autosave stores imported image bytes even after previews decoded them', [...assetsOf(head)].every(path => projects.assets.has(path)));
  const durable = await readArtwork((await new DeviceArtworkStore(dbName).get(entry.card.id))!.archive);
  check('Deleting the original project leaves the independent library package and its images readable', !projects.projects.has(originalCard) && durable.assets.size > 0 && durable.file.comps[durable.file.main]!.layers.length === 2);
  const backup = await captureProject(target, { mode: 'archive', source: key => projects.getAsset(key) }).settle();
  check('Ordinary standalone project capture includes the imported layers and every image', !!backup.file.comps[copied.id]?.asset && [...Object.values(backup.file.drawings)].every(d => (!d.line || backup.assets.has(d.line)) && (!d.fill || backup.assets.has(d.fill))));
  await files.newProject({ name: 'Different size', width: 32, height: 16, frames: 24 }); app.setWorkspace('draw'); await settle();
  click('Assets (0)'); click('My Assets'); await until(() => !!document.querySelector('.artwork-library article'));
  check('A different canvas disables Add copy and explains native-size project opening', button('Add copy of Library landscape').disabled && !!document.querySelector('.artwork-size-note') && !button('Open Library landscape as project').disabled);
  click('Open Library landscape as project'); await until(() => app.project.width === 16 && app.project.comp.name === 'Library landscape'); await settle();
  check('Open as project uses actual file import and preserves its original size, layers and timing', app.project.width === 16 && app.project.height === 16 && app.project.comp.layers.length === 2 && app.project.fps === 6 && files.current?.name === 'Library landscape' && !assets.assets.editing);
  click('Assets (0)'); failSave = true; click('Save current artwork'); await until(() => !assets.library.busy);
  check('A storage error leaves the project intact and reports failure without a success card', notices.some(m => m.includes('Test storage full')) && (await device.list()).length === 1 && app.project.width === 16);
  failSave = false; click('Save current artwork'); await until(() => !!document.querySelector('.artwork-library article') && !assets.library.busy);
  check('A native artwork project can save an edited snapshot back to My Assets', (await device.list()).length === 2 && !assets.assets.editing);
  const countBeforeImport = (await device.list()).length;
  await assets.library.importFile(new File([packArtwork(stored) as BlobPart], 'shared.2dope')); await until(() => !assets.library.busy);
  check('Import artwork file adds a portable shared package to the device library', (await device.list()).length === countBeforeImport + 1);
  await assets.library.importFile(new File([new Uint8Array([1, 2])], 'bad.2dope'));
  check('Invalid artwork reports an error and adds no library entry', !!document.querySelector('.artwork-library-status') && (await device.list()).length === countBeforeImport + 1);
  click('Close My Assets'); await files.newProject({ name: 'Stale target', width: 16, height: 16 }); app.setWorkspace('draw'); await settle();
  click('Assets (0)'); click('My Assets'); await until(() => !!document.querySelector('.artwork-library article')); delayRead = true; click('Add copy of Library landscape'); await until(() => holdRead !== null);
  assets.library.close(); await files.newProject({ name: 'New target', width: 16, height: 16 }); holdRead!(); delayRead = false; await until(() => !assets.library.busy);
  check('Closing or changing projects during library read cannot import into a new target', assets.assets.list().length === 0 && !app.history.canUndo && files.current?.name === 'New target');

  click('Assets (0)'); click('My Assets'); await until(() => document.querySelectorAll('.artwork-library article').length === 3);
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search My Assets"]')!, readsBefore = reads;
  const find = (text: string) => { search.value = text; search.dispatchEvent(new Event('input', { bubbles: true })); };
  const visible = () => [...document.querySelectorAll<HTMLElement>('.artwork-library article')].filter(a => !a.hidden);
  find('  LIBRARY    landScape  ');
  check('Search matches name words without reading artwork packages or changing document history', visible().length === 3 && reads === readsBefore && !app.history.canUndo && document.querySelector('.artwork-library-count')?.textContent === '3 of 3 assets');
  find('nothing like this'); await settle();
  check('No-match search explains recovery and keeps search and clear targets reachable', visible().length === 0 && document.querySelector('.artwork-empty')?.textContent?.includes('No matching') === true && hit(search) && hit(button('Clear asset search')));
  click('Clear asset search'); check('Clear search restores the shelf and input focus', visible().length === 3 && document.activeElement === search);
  const manageOriginal = () => { const article = document.querySelector<HTMLElement>(`[data-asset-id="${entry.card.id}"]`)!; article.querySelector<HTMLDetailsElement>('details')!.open = true; return article; };
  button('Rename saved Library landscape', manageOriginal()).click(); await settle(); click('Cancel'); await until(() => !assets.library.busy);
  check('Cancelling a saved-artwork rename leaves its card and project history unchanged', (await device.get(entry.card.id))!.card.name === 'Library landscape' && !app.history.canUndo);
  button('Rename saved Library landscape', manageOriginal()).click(); await settle();
  const field = document.querySelector<HTMLInputElement>('dialog[open] input[aria-label="Rename saved artwork"]')!;
  field.value = 'Evening sky'; click('Rename'); await until(() => !assets.library.busy && !!document.querySelector('[aria-label="Saved Evening sky"]'));
  const renamed = (await new DeviceArtworkStore(dbName).get(entry.card.id))!, named = await libraryArtwork(renamed), portable = await readArtwork(packArtwork(named));
  check('Rename survives a fresh connection and portable readback without rewriting immutable image bytes', renamed.card.name === 'Evening sky' && portable.file.name === 'Evening sky' && portable.file.comps[portable.file.main]!.name === 'Evening sky' && renamed.archive.every((v, i) => v === entry.archive[i]) && !app.history.canUndo);
  find('evening'); const removalHistory = app.history.peekUndo();
  const removalCard = manageOriginal(); button('Remove saved Evening sky', removalCard).scrollIntoView({ block: 'nearest' }); await settle();
  check('Manage actions retain 44px targets in the scrolling shelf', hit(button('Rename saved Evening sky', removalCard)) && hit(button('Remove saved Evening sky', removalCard)));
  failRemove = true; button('Remove saved Evening sky', removalCard).click(); await until(() => !assets.library.busy);
  check('Failed removal preserves the saved package and reports an error', !!await device.get(entry.card.id) && document.querySelector('.artwork-library-status')?.textContent === 'Test removal failed');
  failRemove = false; button('Remove saved Evening sky', removalCard).click(); await until(() => !assets.library.busy && !!document.querySelector('[aria-label="Undo last asset removal"]'));
  check('Removal deletes both durable records, keeps project history and offers an accessible Undo', !await device.get(entry.card.id) && !(await new DeviceArtworkStore(dbName).list()).some(c => c.id === entry.card.id) && app.history.peekUndo() === removalHistory && visible().length === 0 && hit(button('Undo last asset removal')) && document.activeElement === button('Undo last asset removal'));
  failSave = true; click('Undo last asset removal'); await until(() => !assets.library.busy);
  check('Failed restoration keeps the removal Undo available for retry', !await device.get(entry.card.id) && !!document.querySelector('[aria-label="Undo last asset removal"]') && document.querySelector('.artwork-library-status')?.textContent === 'Test storage full');
  failSave = false; click('Close My Assets'); click('Assets (0)'); click('My Assets'); await until(() => document.querySelectorAll('.artwork-library article').length === 2);
  click('Undo last asset removal'); await until(() => !assets.library.busy && !!document.querySelector('[aria-label="Saved Evening sky"]'));
  check('Undo survives closing the shelf and restores exact artwork with its renamed label', (await device.get(entry.card.id))!.archive.every((v, i) => v === entry.archive[i]) && visible().length === 3 && !document.querySelector('[aria-label="Undo last asset removal"]') && app.history.peekUndo() === removalHistory);
  click('Add copy of Evening sky'); await until(() => !assets.library.busy && assets.assets.list().length === 1);
  check('Reusing renamed artwork names its independent editable source and remains one document Undo', assets.assets.list()[0]!.name === 'Evening sky' && app.history.peekUndo()?.label === 'Add artwork from My Assets' && originalProject.comps.get(source.id)!.name === 'Library landscape');

  click('Close assets'); click('Assets (1)'); click('My Assets'); await until(() => document.querySelectorAll('.artwork-library article').length === 3);
  button('Rename saved Evening sky', manageOriginal()).click(); await settle();
  const staleName = document.querySelector<HTMLInputElement>('dialog[open] input[aria-label="Rename saved artwork"]')!; staleName.value = 'Stale rename';
  assets.library.close(); await files.newProject({ name: 'Changed during rename', width: 16, height: 16 }); click('Rename'); await until(() => !assets.library.busy);
  check('A rename dialog from a closed library cannot alter its saved entry in another project', (await device.get(entry.card.id))!.card.name === 'Evening sky' && files.current?.name === 'Changed during rename' && !app.history.canUndo);
} catch (e) { check(String(e), false); }
finally {
  assets.library.close(); await files.autosaver.flush(); files.autosaver.stop();
  keys.forEach((k, i) => { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); });
  // Only this fixture's uniquely named disposable artwork database is removed.
  await new Promise<void>(resolve => { const r = indexedDB.deleteDatabase(dbName); r.onsuccess = r.onerror = () => resolve(); r.onblocked = () => resolve(); });
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
