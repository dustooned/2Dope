import { App } from '../app';
import { Project } from '../core/project';
import { staticProp } from '../core/anim';
import { cameraLayer, type DrawingsLayer } from '../core/comp';
import { newEffect } from '../core/effects';
import { BUILTIN_PRESETS, readPreset } from '../core/presets';
import { DevicePresetStore } from '../io/presetstore';
import { captureProject, loadProjectFile } from '../io/projectio';
import { validateProjectFile, minimumDrawingSchema } from '../io/schema';
import { captureArtwork, packArtwork, readArtwork } from '../io/artwork';
import { planBlender } from '../io/blender';
import { drawComp } from '../view/composite';
import { PresetLibraryUI } from './presets';
import { TitlesUI } from './titles';
import { MotionPanel } from './motion';
import { LayerCards } from './layercards';
import { LayersPopover } from './layerspop';
import { EffectsPanel } from './effectspanel';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!), cards = new LayerCards(app), popover = new LayersPopover(app);
const effects = new EffectsPanel(app), store = new DevicePresetStore(`2dope-fixture-presets-${crypto.randomUUID()}`), presets = new PresetLibraryUI(app, store), titles = new TitlesUI(app);
app.editTitle = id => titles.show(id); app.convertTitle = id => void titles.convert(id); motion.openPresets = () => presets.show(); effects.onPresets = id => presets.show('effects', id);
const notices: string[] = [], errors: string[] = []; let action: (() => void) | undefined;
app.onNotice = (message, next) => { notices.push(message); action = next?.run; }; addEventListener('error', e => errors.push(e.message));
const refresh = () => { document.body.className = `ui-simple ws-${app.workspace}`; motion.update(); cards.update(); popover.update(); };
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.editor.onChange = refresh; app.history.onChange = refresh;
app.loadProject(new Project(320, 180)); app.project.comp.duration = 72; app.setWorkspace('motion'); app.editor.select(app.project.layer.id); refresh();
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const until = async (test: () => boolean) => { const end = performance.now() + 7000; while (!test()) { if (performance.now() > end) throw new Error('Timed out'); await wait(); } };
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const button = (name: string, root: ParentNode = document) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string, root: ParentNode = document) => { const b = button(name, root); expect(!b.disabled, `Disabled ${name}`); b.click(); };
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => document.querySelector<T>(`[aria-label="${name}"]`)!;
const input = (name: string, value: string) => { const n = field<HTMLInputElement | HTMLTextAreaElement>(name); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); };
const stroke = () => { const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, r = canvas.getBoundingClientRect(); for (const [type, x] of [['pointerdown', 180], ['pointermove', 210], ['pointerup', 230]] as const) { const p = app.view.docToScreen(x, 90); canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 27, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: .8, clientX: r.left + p.x, clientY: r.top + p.y })); } };
const pixels = () => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; drawComp(c.getContext('2d')!, app.project, app.project.comp, app.frame, { export: true, camera: false }); return c.getContext('2d')!.getImageData(0, 0, 320, 180).data; };
let passed = 0, failed = 0, titleId = '';
async function check(name: string, test: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; titles.close(); presets.close(); document.querySelectorAll('dialog.small').forEach(d => d.remove()); } document.querySelector('#results')!.append(li); }
await wait(180);
await check('Title draft and Escape/Cancel do not allocate project drawings or History', async () => {
  const before = JSON.stringify([...app.project.comps]), drawings = app.project.drawings.size; app.history.clear(); titles.show(); input('Text', 'Uncommitted'); await wait(); click('Cancel', document.querySelector('.title-editor')!);
  expect(JSON.stringify([...app.project.comps]) === before && app.project.drawings.size === drawings && !app.history.canUndo, 'draft edited project');
});
await check('Title creation stores editable metadata plus transparent Colour pixels in one Undo', async () => {
  app.setWorkspace('draw'); app.blankPage = true; titles.show(); input('Text', 'Opening\nCredits'); input('Size (pixels)', '32'); await wait(); click('Create title', document.querySelector('.title-editor')!); await until(() => !document.querySelector('.title-editor'));
  expect(!app.blankPage, 'creating a title left Draw on its empty flipbook page'); app.setWorkspace('motion');
  const l = app.editor.primary as DrawingsLayer; titleId = l.id; const d = app.project.drawing(l.exposures[0]!.drawing);
  expect(l.title?.text === 'Opening\nCredits' && l.still && l.play === 'loop' && !!d.fill, 'title not editable'); const p = d.fill!.getContext('2d')!.getImageData(0, 0, 320, 180).data; expect(p.some((v, i) => i % 4 === 3 && v > 0) && p[3] === 0, 'snapshot is empty or opaque');
  const saved = JSON.stringify(l); app.undo(); await wait(150); expect(!app.project.comp.layers.some(l => l.id === titleId) && !app.history.canUndo, 'create took multiple Undo'); app.redo(); await wait(150); expect(JSON.stringify(app.project.comp.layers.find(l => l.id === titleId)) === saved, 'redo changed title'); app.editor.select(titleId);
});
await check('Editing creates a new snapshot; Undo restores exact previous pixels and metadata', async () => {
  const before = pixels(), old = (app.editor.primary as DrawingsLayer).exposures[0]!.drawing; app.history.clear(); titles.show(titleId); input('Text', 'Revised'); await wait(); click('Apply title'); await until(() => !document.querySelector('.title-editor'));
  expect((app.editor.primary as DrawingsLayer).exposures[0]!.drawing !== old, 'edit overwrote old snapshot'); app.undo(); await wait(150); expect((app.project.comp.layers.find(l => l.id === titleId) as DrawingsLayer).title?.text === 'Opening\nCredits' && pixels().every((v, i) => v === before[i]) && !app.history.canUndo, 'undo lost title pixels'); app.redo(); await wait(150); app.editor.select(titleId);
});
await check('Paint and exposure commands require explicit conversion; a brush change keeps title metadata', () => {
  app.setWorkspace('draw'); app.editor.select(titleId); app.history.clear(); const before = pixels(), spec = JSON.stringify(app.project.comp.layers); app.setTool('eraser'); app.clearFrame(); app.fillDrawing(); app.flipDrawing('h'); app.addFrame(); app.deleteFrame();
  expect(JSON.stringify(app.project.comp.layers) === spec && pixels().every((v, i) => v === before[i]) && !app.history.canUndo && !!action, 'paint silently changed an editable title'); app.setTool('brush');
});
await check('Convert to paint keeps pixels, enables painting and reverses with one Undo', async () => {
  const before = pixels(); action?.(); await wait(); click('Convert to paint', document.querySelector('dialog.small')!); await wait(); expect(!(app.project.comp.layers.find(l => l.id === titleId) as DrawingsLayer).title && pixels().every((v, i) => v === before[i]), 'conversion changed pixels');
  app.undo(); await wait(150); expect(!!(app.project.comp.layers.find(l => l.id === titleId) as DrawingsLayer).title && !app.history.canUndo, 'conversion undo failed'); app.editor.select(titleId); app.setWorkspace('motion');
});
await check('Title archives require reader 6, ordinary archives retain their older minimum', async () => {
  const capture = await captureProject(app.project, { mode: 'archive' }).settle(); expect(capture.file.schema === 6 && validateProjectFile(capture.file).schema === 6, 'title not version gated');
  const loaded = loadProjectFile(validateProjectFile(capture.file)).project;
  for (const d of loaded.drawings.values()) for (const ref of [d.parked?.line, d.parked?.fill]) if (ref?.key) ref.bytes = capture.assets.get(ref.key) ?? null;
  const before = pixels(); app.loadProject(loaded); app.setWorkspace('motion'); app.editor.select(titleId); for (const d of loaded.drawings.values()) { await app.residency.pin(d); app.residency.unpin(d); }
  expect(pixels().every((v, i) => v === before[i]) && (app.editor.primary as DrawingsLayer).title?.text === 'Revised', 'reopen reflowed saved text');
  const ordinary = structuredClone(capture.file.comps); for (const c of Object.values(ordinary)) for (const l of c.layers) delete l.title;
  expect(minimumDrawingSchema(capture.file.drawings, ordinary) === 3, 'ordinary archives unnecessarily require reader 6');
  const bad = structuredClone(capture.file); bad.comps[bad.main]!.layers[0]!.title!.font = 'external' as 'system-ui'; expect((() => { try { validateProjectFile(bad); return false; } catch { return true; } })(), 'unsafe title metadata accepted');
});
await check('Portable assets retain title intent and Blender receives the saved image with a clear note', async () => {
  const saved = await captureProject(app.project, { mode: 'archive' }).settle(); app.project.comp.asset = true; const source = await captureArtwork(app.project, app.project.comp.id, async k => saved.assets.get(k) ?? null); delete app.project.comp.asset; const reopened = await readArtwork(packArtwork(source));
  expect(reopened.file.schema === 6 && reopened.file.comps[reopened.file.main]!.layers.some(l => l.title), 'asset dropped title metadata'); const plan = planBlender(app.project, 'fixture'); expect(plan.notes.some(n => n.includes('Title exported as an image')) && plan.drawings.size > 0, 'Blender lost title snapshot');
});
await check('Draw cards, layer popover and Motion agree on Title identity and expose editing', async () => {
  const anchor = document.querySelector<HTMLButtonElement>('.dock')!; app.setWorkspace('draw'); cards.toggle(anchor); await wait(); expect(!!document.querySelector('.lc-card[aria-label*="Title"]'), 'Draw card missing title identity'); click('Close layers'); popover.toggle(anchor); expect(!!document.querySelector('.lp-name[aria-label*="Title"]') && !!button(`Edit title ${app.editor.primary!.name}`), 'popover inconsistent'); popover.close();
  app.setWorkspace('motion'); refresh(); expect(!!document.querySelector('.lname[aria-label*="Title"]') && motion.layerItems(app.editor.primary!).some(i => 'label' in i && i.label === 'Edit title…'), 'Motion inconsistent');
});
await check('Preset preview, playback, seek and closing leave the document and playhead untouched', async () => {
  app.history.clear(); const before = JSON.stringify([...app.project.comps]), frame = app.frame; presets.show(); click('Fade in'); await until(() => !button('Apply preset').disabled); click('Play preview'); await wait(180); click('Pause preview'); const seek = field<HTMLInputElement>('Preset preview frame'); seek.value = '10'; seek.dispatchEvent(new Event('input')); await wait(); presets.close();
  expect(JSON.stringify([...app.project.comps]) === before && app.frame === frame && !app.history.canUndo && !app.playing, 'preview mutated project');
});
await check('Apply uses concrete motion keys in one Undo; existing keys need explicit Replace range', async () => {
  presets.show(); click('Fade in'); await until(() => !button('Apply preset').disabled); click('Apply preset'); const l = app.editor.primary!; expect(l.transform.opacity.keys.length === 2, 'move not baked'); app.undo(); await wait(150); expect(!app.history.canUndo && app.editor.primary!.transform.opacity.keys.length === 0, 'apply took multiple Undo'); app.redo(); await wait(150); app.editor.select(titleId);
  presets.show(); click('Fade out'); await wait(); expect(button('Apply preset').disabled && document.querySelector('.preset-status')!.textContent!.includes('Replace keys'), 'existing keys silently overwritten'); const replace = field<HTMLInputElement>('Replace keys in this range'); replace.checked = true; replace.dispatchEvent(new Event('change')); await until(() => !button('Apply preset').disabled); presets.close();
});
await check('Named motion saves persist through a fresh library read without changing the project', async () => {
  app.history.clear(); presets.show(); input('New preset name', 'My title fade'); click('Save current as preset'); await until(() => !!document.querySelector('.preset-status')?.textContent?.includes('Saved')); const saved = await store.list(); expect(saved.some(p => p.name === 'My title fade' && p.kind === 'motion') && !app.history.canUndo, 'named move was not saved independently'); presets.close(); presets.show(); await until(() => !!document.querySelector('.preset-list')?.textContent?.includes('My title fade')); presets.close();
});
await check('Effect presets replace or append with fresh identities and reject Ink-only looks on titles', async () => {
  const l = app.editor.primary!; l.effects = [newEffect('glow', 'old', 12)]; app.history.clear(); presets.show('effects'); click('Sticker shadow'); await until(() => !button('Apply preset').disabled); click('Apply preset'); expect(app.editor.primary!.effects?.length === 1 && app.editor.primary!.effects[0]!.type === 'shadow' && app.editor.primary!.effects[0]!.id !== 'shadow', 'replace was duplicated or linked'); app.undo(); await wait(150); expect(app.editor.primary!.effects?.[0]?.id === 'old' && !app.history.canUndo, 'look Undo wrong');
  presets.show('effects'); click('Soft glow'); const mode = field<HTMLSelectElement>('Effect preset application'); mode.value = 'append'; mode.dispatchEvent(new Event('change')); await until(() => !button('Apply preset').disabled); click('Apply preset'); expect(app.editor.primary!.effects?.length === 2, 'append unavailable'); app.undo(); await wait(150);
  const ink = readPreset({ ...BUILTIN_PRESETS.find(p => p.id === 'sticker-shadow'), id: 'ink', name: 'Ink look', effects: [{ ...newEffect('shadow', 's', 1), target: 'line' }] }); await store.put(ink); presets.show('effects'); await until(() => !!document.querySelector('.preset-list')?.textContent?.includes('Ink look')); click('Ink look'); await wait(); expect(button('Apply preset').disabled && document.querySelector('.preset-status')!.textContent!.includes('Colour'), 'Ink title target silently accepted'); presets.close();
});
await check('Malformed import is atomic and retains the open draft name', async () => {
  presets.show(); input('New preset name', 'Keep my draft'); let picker: HTMLInputElement | null = null; const original = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function() { if (this.type === 'file') picker = this; else original.call(this); }; click('Import preset'); HTMLInputElement.prototype.click = original;
  const file = new File([JSON.stringify({ ...BUILTIN_PRESETS[0], version: 999 })], 'future.json', { type: 'application/json' }), before = (await store.list()).length;
  Object.defineProperty(picker!, 'files', { value: [file] }); (picker as unknown as HTMLInputElement).dispatchEvent(new Event('change')); await until(() => !!document.querySelector('.preset-status')?.textContent?.includes('unsupported'));
  expect((await store.list()).length === before && field<HTMLInputElement>('New preset name').value === 'Keep my draft', 'failed import changed library or lost draft'); presets.close();
});
await check('IndexedDB refuses name collisions and a removed replacement target', async () => {
  const p = { ...BUILTIN_PRESETS[0]!, id: 'atomic', name: 'Atomic' }; await store.put(p); let rejected = 0;
  try { await store.put({ ...p, id: 'duplicate', name: 'ATOMIC' }); } catch { rejected++; } await store.remove(p.id); try { await store.put(p, true); } catch { rejected++; }
  expect(rejected === 2 && !(await store.list()).some(p => p.id === 'atomic'), 'atomic protection failed');
});
await check('Camera moves refuse artwork targets and preview compatible camera keys without editing', async () => {
  presets.show(); click('Camera push'); await wait(); expect(button('Apply preset').disabled, 'camera move accepted artwork'); presets.close(); const camera = cameraLayer('camera', app.project.comp); app.project.comp.layers.unshift(camera); app.editor.select(camera.id); presets.show(); click('Camera push'); await until(() => !button('Apply preset').disabled); presets.close(); expect(camera.zoom.keys.length === 0, 'camera preview committed'); app.editor.select(titleId);
});
await check('Preset and title dialogs fit the viewport with reachable actions', async () => {
  presets.show(); click('Slide in'); await wait(); let r = document.querySelector('.preset-library')!.getBoundingClientRect(); expect(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, 'preset modal outside viewport'); presets.close(); titles.show(titleId); await wait(); r = document.querySelector('.title-editor')!.getBoundingClientRect(); expect(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, 'title modal outside viewport'); const b = button('Apply title'); b.scrollIntoView(); expect(b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().bottom <= innerHeight, 'Apply title unreachable'); titles.close();
  expect(document.body.scrollWidth <= innerWidth && !errors.length, errors.join('; ') || 'body overflow');
});
await check('Final project still saves valid title metadata and independent applied effects', async () => { const saved = await captureProject(app.project, { mode: 'archive' }).settle(); expect(validateProjectFile(saved.file).comps[saved.file.main]!.layers.some(l => l.title), 'final file invalid'); });
await check('Title masks, whole-layer effects and a grouped composition preserve the same pixels', async () => {
  app.editor.select(titleId); const title = app.editor.primary as DrawingsLayer; title.transform.opacity = staticProp(100); title.effects = [newEffect('shadow', 'title-shadow', 1)];
  app.addMask(); app.setMaskEditing(true); const mask = app.maskDrawing!; mask.line.getContext('2d')!.fillRect(0, 0, 150, 180); mask.rev++; app.setMaskEditing(false);
  const before = pixels(); app.history.clear(); const group = app.editor.group([titleId], 'Title group'); expect(!!group && pixels().every((v, i) => v === before[i]), 'group changed mask/effect application'); app.undo(); await wait(150); app.editor.select(titleId);
  const l = app.editor.primary as DrawingsLayer; expect(!!l.title && !!l.mask, 'undo lost title or mask'); const drawing = app.project.drawing(l.exposures[0]!.drawing), original = drawing.fill!.getContext('2d')!.getImageData(0, 0, 320, 180).data; app.setMaskEditing(true); app.clearFrame(); expect(!!(app.editor.primary as DrawingsLayer).title && drawing.fill!.getContext('2d')!.getImageData(0, 0, 320, 180).data.every((v, i) => v === original[i]) && original.some((v, i) => i % 4 === 3 && v > 0), 'mask-mode command changed title pixels'); app.setMaskEditing(false);
});
await check('Stale title and preset dialogs refuse applying to a changed layer', async () => {
  app.editor.select(titleId); titles.show(titleId); input('Text', 'Stale draft'); await wait(); app.editor.rename(titleId, 'Renamed elsewhere'); click('Apply title'); await wait(); expect(document.querySelector('.title-editor [role=status]')!.textContent!.includes('changed'), 'stale title applied'); titles.close();
  presets.show('effects'); click('Soft glow'); await until(() => !button('Apply preset').disabled); app.editor.rename(titleId, 'Changed again'); click('Apply preset'); await wait(); expect(document.querySelector('.preset-status')!.textContent!.includes('changed'), 'stale preset applied'); presets.close();
});
await check('Preset write failure leaves draft and document intact', async () => {
  const broken = new PresetLibraryUI(app, { list: async () => [], put: async () => { throw new Error('Storage is full'); }, remove: async () => {} });
  app.history.clear(); broken.show('effects'); input('New preset name', 'Unsaved look'); click('Save current as preset'); await until(() => !!document.querySelector('.preset-status')?.textContent?.includes('Storage is full'));
  expect(field<HTMLInputElement>('New preset name').value === 'Unsaved look' && !app.history.canUndo, 'failure discarded draft or edited document'); broken.close();
});
await check('Device preset cap is atomic at forty records per type', async () => {
  const bounded = new DevicePresetStore(`2dope-fixture-presets-cap-${crypto.randomUUID()}`);
  for (let i = 0; i < 40; i++) await bounded.put({ ...BUILTIN_PRESETS[0]!, id: `p${i}`, name: `Move ${i}` }); let refused = false;
  try { await bounded.put({ ...BUILTIN_PRESETS[0]!, id: 'overflow', name: 'Move 41' }); } catch { refused = true; } expect(refused && (await bounded.list()).length === 40, 'cap partially wrote record');
});
await check('Pen input offers conversion on title artwork and paints its mask without changing text pixels', async () => {
  app.setWorkspace('draw'); app.editor.select(titleId); app.setMaskEditing(false); app.setTool('brush'); app.fit(); await wait(); app.history.clear();
  const title = app.editor.primary as DrawingsLayer, drawing = app.project.drawing(title.exposures[0]!.drawing), before = drawing.fill!.getContext('2d')!.getImageData(0, 0, 320, 180).data; stroke(); await wait(); expect(!app.history.canUndo && !!action, 'pen changed editable title');
  app.setMaskEditing(true); const mask = app.maskDrawing!, rev = mask.rev; stroke(); await wait(120); expect(mask.rev > rev && !!(app.editor.primary as DrawingsLayer).title && drawing.fill!.getContext('2d')!.getImageData(0, 0, 320, 180).data.every((v, i) => v === before[i]), 'pen did not edit only the mask'); app.setMaskEditing(false); app.setWorkspace('motion');
});
await check('Advanced effect controls visibly disable Ink for an editable title', async () => {
  effects.show(titleId); document.querySelector<HTMLButtonElement>('.fx-tabs button')!.click(); click('Advanced'); await wait(); const root = document.querySelector('.fxpanel') ?? document;
  const ink = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Ink'); expect(ink?.disabled && ink.title.includes('Colour'), 'Ink control not explained'); effects.close();
});
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, motion, cards, popover, presets, titles, effects, store };
