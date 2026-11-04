import { App } from '../app';
import { Project } from '../core/project';
import { setKey, staticProp } from '../core/anim';
import { frameContent } from '../core/comp';
import { MemoryArtworkStore } from '../io/artworkstore';
import { readArtwork } from '../io/artwork';
import { importVectorDocument } from '../io/vectorimport';
import { drawComp } from '../view/composite';
import { ArtworkAssetsUI } from './artworkassets';
import { MotionPanel } from './motion';
import { Bubbles } from './bubbles';
import { closeContextMenu } from './contextmenu';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage), motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
const store = new MemoryArtworkStore(), assets = new ArtworkAssetsUI(app, document.querySelector<HTMLElement>('.painting-header')!, store);
motion.openAssets = opener => assets.showAssets(opener); motion.createAsset = () => void assets.createFromSelection();
const bubbles = new Bubbles(app, stage, { fit: () => app.fit(), brushLibrary() {}, colorPanel() {}, layers() {}, motion: { group: () => motion.group(), split: () => motion.split(), controlsInPanel: true } });
bubbles.setLevel('simple', false);
const errors: string[] = [], notices: string[] = []; addEventListener('error', e => errors.push(e.message)); app.onNotice = text => notices.push(text);
const refresh = () => { document.body.classList.remove('ws-motion', 'ws-draw', 'ws-animate'); document.body.classList.add(`ws-${app.workspace}`); motion.update(); assets.update(); bubbles.update(); };
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.history.onChange = refresh; app.editor.onChange = refresh;
app.loadProject(new Project(64, 64)); app.project.comp.duration = 24; app.setWorkspace('motion'); refresh();
const wait = (ms = 80) => new Promise<void>(r => setTimeout(r, ms));
const until = async (test: () => boolean) => { const end = performance.now() + 10000; while (!test()) { if (performance.now() > end) throw new Error('Timed out'); await wait(); } };
const button = (name: string, root: ParentNode = document) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim().replace(/^✓ /, '') === name); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string, root: ParentNode = document) => { const b = button(name, root); if (b.disabled) throw new Error(`Disabled ${name}`); b.click(); };
const expect = (ok: unknown, why: string) => { if (!ok) throw new Error(why); };
const menu = () => document.querySelector<HTMLElement>('.ctxmenu')!;
const shelf = () => document.querySelector<HTMLElement>('.artwork-shelf:not(.artwork-library)')!;
const files = () => shelf().querySelector<HTMLElement>('.artwork-source-files summary')!.click();
const render = (f: number) => { const c = document.createElement('canvas'); c.width = c.height = 64; drawComp(c.getContext('2d')!, app.project, app.project.comp, f, { export: true, camera: false }); return [...c.getContext('2d')!.getImageData(0, 0, 64, 64).data]; };
let passed = 0, failed = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; } document.querySelector('#results')!.append(li); }
let source = '', placement = '', beforePictures: number[][] = [];
await wait(180);
await check('Motion keeps transport, task menus and auto-key visible at Simple and Full levels', () => {
  for (const level of ['simple', 'full'] as const) {
    bubbles.setLevel(level, false); refresh();
    expect(!!document.querySelector('.motion-transport')?.getClientRects().length && !document.querySelector<HTMLElement>('.bub-ctx')?.textContent, 'transport missing or duplicated settings');
    for (const name of ['New Motion layer', 'Motion assets', 'Layer actions', 'Motion tools', 'Motion view options']) expect(button(name).getClientRects().length, `${name} hidden`);
    expect(button('● Auto-key').getClientRects().length, 'auto-key folded');
  }
  bubbles.setLevel('simple', false); refresh();
});
await check('Animation assistants explain unavailable key actions through disabled entries', () => {
  app.editor.keys.clear(); click('Motion tools'); expect(button('Wiggle…', menu()).disabled && button('Delete selected keys', menu()).disabled, 'empty selection can modify keys'); closeContextMenu();
});
await check('Layer row actions use the same categorized menu and blending remains one Undo', async () => {
  const l = app.project.comp.layers[0]!; app.editor.select(l.id); refresh(); app.history.clear();
  click(`More for ${l.name}`); click('Blending and masks…', menu());
  expect(!!button('Back to layer actions', menu()), 'submenu has no recovery');
  click('Blend mode… (Normal)', menu()); await wait();
  click('Multiply', document.querySelector('dialog.small')!); await wait();
  expect(app.project.comp.layers.find(x => x.id === l.id)?.blend === 'multiply' && app.history.canUndo, 'blend action did not commit');
  app.undo(); await wait(); expect(app.project.comp.layers.find(x => x.id === l.id)?.blend === 'normal' && !app.history.canUndo, 'blend action took multiple Undo steps');
});
await check('PNG-style alpha and SVG objects precompose into a reusable asset with unchanged animated pixels', async () => {
  const picture = document.createElement('canvas'); picture.width = picture.height = 64;
  const g = picture.getContext('2d')!; g.fillStyle = '#0099ff80'; g.fillRect(10, 10, 40, 40); app.importPicture('Blue glass.png', picture, 64, 64);
  const png = app.project.comp.layers.find(l => l.name === 'Blue glass')!;
  app.importVectors('Badge.svg', importVectorDocument('<svg viewBox="0 0 64 64"><path d="M20 20H40V40H20Z" fill="#ff2255"/></svg>'));
  const svg = app.project.comp.layers.find(l => l.name === 'Badge')!;
  svg.transform.position = setKey(setKey(staticProp([32, 32]), 0, [22, 32]), 10, [42, 32]);
  app.editor.select(png.id); app.editor.select(svg.id, true); app.setFrame(7); refresh();
  beforePictures = [0, 7, 10].map(render); app.history.clear();
  click('Layer actions'); click('Create asset from selection…', menu()); await wait();
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Create asset from selection"]')!; input.value = 'Animated badge'; click('Create asset', document.querySelector('dialog.small')!);
  await until(() => !!shelf()); source = assets.assets.list()[0]!.id; placement = app.editor.primary!.id;
  expect(app.workspace === 'motion' && app.frame === 7 && app.history.peekUndo()?.label === 'Create asset from selection', 'clock or history changed');
  expect([0, 7, 10].every((f, i) => JSON.stringify(render(f)) === JSON.stringify(beforePictures[i])), 'precompose changed the picture');
  expect(app.project.comps.get(source)?.layers.some(l => l.kind === 'drawings' && app.project.drawing(l.exposures[0]!.drawing).vectors[0]?.shape), 'vector became pixels');
});
await check('One Undo restores the complete original stack, and Redo restores asset identity', async () => {
  click('Close assets'); app.undo(); await wait(); expect(!app.project.comps.has(source) && !app.history.canUndo && JSON.stringify(render(7)) === JSON.stringify(beforePictures[1]), 'Undo lost source data');
  app.redo(); await wait(); expect(app.project.comps.get(source)?.asset && app.project.comp.layers.some(l => l.id === placement), 'Redo lost the source or placement');
});
await check('Project assets filter by name and animation type without document history', () => {
  click('Motion assets'); const before = app.history.peekUndo();
  const search = shelf().querySelector<HTMLInputElement>('input[aria-label="Find project assets"]')!, kind = shelf().querySelector<HTMLSelectElement>('select')!;
  search.value = 'missing'; search.dispatchEvent(new Event('input')); expect(shelf().querySelector<HTMLElement>('.artwork-card')!.hidden, 'unmatched card visible');
  search.value = 'BADGE'; search.dispatchEvent(new Event('input')); kind.value = 'still'; kind.dispatchEvent(new Event('change')); expect(shelf().querySelector<HTMLElement>('.artwork-card')!.hidden, 'animated item shown as a still');
  kind.value = 'animated'; kind.dispatchEvent(new Event('change')); expect(!shelf().querySelector<HTMLElement>('.artwork-card')!.hidden && app.history.peekUndo() === before, 'filter changed the document');
});
await check('Direct asset download is a complete standalone file without saving a library card or a history edit', async () => {
  files(); const before = app.history.peekUndo(), create = URL.createObjectURL, anchor = HTMLAnchorElement.prototype.click;
  const download: { blob?: Blob; filename?: string } = {};
  URL.createObjectURL = value => { if (value instanceof Blob) download.blob = value; return create(value); };
  HTMLAnchorElement.prototype.click = function () { download.filename = this.download; };
  try { click('Download Animated badge asset file'); await until(() => !assets.library.busy); } finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = anchor; }
  expect(download.blob && download.filename === 'Animated-badge.2dope', 'download missing');
  const bundle = await readArtwork(new Uint8Array(await download.blob!.arrayBuffer()));
  expect(bundle.file.comps[bundle.file.main]?.asset && bundle.assets.size > 0 && Object.values(bundle.file.drawings).some(d => d.vectors.some(v => v.shape)), 'incomplete archive');
  expect(!(await store.list()).length && app.history.peekUndo() === before, 'download wrote library/history');
});
await check('Save to My Assets and Add copy preserve independent source files in Motion', async () => {
  const before = app.history.peekUndo(); click('Save Animated badge to My Assets'); await until(() => !!document.querySelector('.artwork-library article') && !assets.library.busy);
  expect(app.history.peekUndo() === before && app.workspace === 'motion', 'saving changed the shot');
  click('Add copy of Animated badge'); await until(() => assets.assets.list().length === 2 && !!shelf());
  expect(app.workspace === 'motion' && app.frame === 7 && assets.assets.list().some(c => c.id !== source && c.layers[0]?.id !== app.project.comps.get(source)?.layers[0]?.id), 'reused source shares its identity');
});
await check('Placing from Motion stays in Motion with editable, linked placement and durable Undo/Redo', async () => {
  const scope = shelf().querySelector<HTMLElement>(`article[aria-label="Animated badge"]`)!; click('Place Animated badge', scope); await wait();
  const l = app.editor.primary!; expect(l.kind === 'comp' && !l.locked && app.workspace === 'motion' && app.frame === 7, 'placement changed mode/clock or is locked');
  app.undo(); await wait(); expect(!app.project.comp.layers.some(x => x.id === l.id), 'Undo retained placement');
  app.redo(); await wait(); expect(app.project.comp.layers.find(x => x.id === l.id)?.locked === false, 'Redo locked placement');
});
await check('Editing the source and Done return to the same Motion shot and frame', async () => {
  const shot = app.project.activeComp; click('Motion assets'); click('Edit Animated badge', shelf()); await wait();
  expect(app.workspace === 'draw' && assets.assets.editing, 'source editing did not open Draw');
  click('Done editing asset'); await wait(); expect(app.workspace === 'motion' && app.project.activeComp === shot && app.frame === 7, 'source return lost Motion context');
});
await check('View controls stay view-only and Collapse restores the Animated filter', () => {
  const before = app.history.peekUndo(); click('Animated'); click('Motion view options'); click('Collapse all properties', menu());
  expect(button('Animated').getAttribute('aria-pressed') === 'false', 'Animated stayed enabled');
  const transparency = app.canvasView.transparency;
  click('Motion view options'); click('Transparency grid', menu()); expect(app.canvasView.transparency !== transparency && app.history.peekUndo() === before, 'view wrote document history');
});
await check('Motion and asset dialogs fit the viewport with 44px command targets and a scrollable timeline', async () => {
  refresh(); await wait();
  expect(stage.getBoundingClientRect().height >= 70 && document.querySelector<HTMLElement>('.mscroll')!.getBoundingClientRect().height >= 48, 'canvas or timeline collapsed');
  expect(document.documentElement.scrollWidth <= innerWidth + 1, 'body overflows');
  const mode = document.querySelector<HTMLElement>('.bub-modes [data-ws="motion"]')!.getBoundingClientRect(), modes = document.querySelector<HTMLElement>('.bub-modes')!.getBoundingClientRect();
  expect(mode.left >= modes.left && mode.right <= modes.right + 1, 'active Motion mode scrolled out of view');
  expect(!document.querySelector('.bub-tools [data-tool-key="addlayer"]') && !!document.querySelector('.bub-tools [data-tool-key="safeareas"]'), 'default canvas bar repeats menu actions');
  for (const b of document.querySelectorAll<HTMLElement>('.motion-heading button,.motion-menus button')) if (b.getClientRects().length) expect(b.getBoundingClientRect().height >= 44, `small command target: ${b.outerHTML.slice(0, 100)}`);
  click('Motion assets'); const r = shelf().getBoundingClientRect(); expect(r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, 'asset dialog outside viewport');
  click('Close assets'); expect(document.activeElement === button('Motion assets'), 'dialog did not return focus');
});
await check('All rendered asset drawings remain reachable and no uncaught errors occurred', () => {
  expect([...frameContent(app.project.comps, app.project.comp, 7).drawings].every(id => app.project.drawings.has(id)) && !errors.length, errors.join('; '));
});
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, motion, assets, bubbles };
