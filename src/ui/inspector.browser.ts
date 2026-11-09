import { App } from '../app';
import { newEffect } from '../core/effects';
import { Project } from '../core/project';
import { defaultCaption } from '../lettering/spec';
import { MotionPanel } from './motion';

try { localStorage.removeItem('2dope.motion.inspector'); localStorage.removeItem('2dope.motion.inspector.tab'); } catch { /* fine */ }
const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
const errors: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.loadProject(new Project(640, 360)); app.project.comp.duration = 48; app.setWorkspace('motion');
const ed = app.editor;
const wait = (ms = 40) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const panel = () => motion.inspector.root;
const tabs = () => [...panel().querySelectorAll<HTMLButtonElement>('.mi-tab')].map(t => t.textContent ?? '');
const openTab = async (name: string) => { const t = [...panel().querySelectorAll<HTMLButtonElement>('.mi-tab')].find(x => x.textContent === name); if (!t) throw new Error(`No ${name} tab`); t.click(); await wait(); };
const input = (sel: string) => { const i = panel().querySelector<HTMLInputElement>(sel); if (!i) throw new Error(`Missing ${sel}`); return i; };
const change = async (i: HTMLInputElement | HTMLSelectElement, v: string | boolean) => { if (typeof v === 'boolean') (i as HTMLInputElement).checked = v; else i.value = v; i.dispatchEvent(new Event('change')); await wait(); };

let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); }
  document.querySelector('#results')!.append(li);
};

ed.addLayer('drawings');
const id = ed.comp.layers.find(l => l.kind === 'drawings')!.id;
const layer = () => ed.layer(id)!;

await check('The Inspector button opens it on the right; it shows the selected layer', async () => {
  expect(panel().hidden, 'open before asked');
  const b = [...document.querySelectorAll<HTMLButtonElement>('.motion-menus button')].find(x => x.textContent?.includes('Inspector'));
  expect(b, 'no Inspector button'); b!.click(); await wait();
  expect(!panel().hidden && b!.getAttribute('aria-pressed') === 'true', 'did not open');
  ed.select(id); motion.update(); await wait();
  expect(tabs().join() === 'Layer,Timing,Transform,Drawing', `tabs: ${tabs()}`);
  expect(panel().querySelector('.mi-kind')?.textContent === 'Drawing', 'kind not shown');
  expect(panel().querySelector('.mi-title')?.textContent === layer().name, 'not this layer');
});

await check('A typed value is one Undo step; the ◆ keys it; values follow the playhead', async () => {
  await openTab('Transform');
  app.history.clear();
  await change(input('input[data-val="opacity"]'), '40');
  expect(layer().transform.opacity.value === 40, 'opacity not set');
  app.undo(); await wait();
  expect(layer().transform.opacity.value === 100, 'not one undo step');
  app.setFrame(0); await wait();
  input('[data-key="rotation"]').click(); await wait();
  app.setFrame(20); await wait();
  await change(input('input[data-val="rotation"]'), '90');
  expect(layer().transform.rotation.keys.map(k => `${k.f}:${k.v}`).join() === '0:0,20:90', `keys: ${JSON.stringify(layer().transform.rotation.keys)}`);
  expect(input('[data-key="rotation"]').classList.contains('on'), 'key at the playhead not shown');
  app.setFrame(10); motion.update(); await wait();
  const mid = Number(input('input[data-val="rotation"]').value);
  expect(mid > 0 && mid < 90, `value does not follow the playhead (${mid})`);
});

await check('A slider drags live and is one Undo step when let go', async () => {
  app.history.clear();
  const s = input('input[data-slide="opacity"]');
  s.dispatchEvent(new PointerEvent('pointerdown'));
  for (const v of ['80', '60', '30']) { s.value = v; s.dispatchEvent(new Event('input')); }
  s.dispatchEvent(new Event('change')); await wait();
  expect(layer().transform.opacity.value === 30, 'slider not applied');
  app.undo(); await wait();
  expect(layer().transform.opacity.value === 100, 'slider was not one undo step');
});

await check('Tabs appear as they apply: Parenting, Path, Trail, Effects, Caption', async () => {
  ed.addLayer('null');
  const parent = ed.comp.layers.find(l => l.kind === 'null')!.id;
  ed.select(id); await wait();
  await openTab('Layer');
  await change(panel().querySelector<HTMLSelectElement>('select[aria-label="Parent layer"]')!, parent);
  expect(layer().parent === parent, 'parent not set from the drop-down');
  expect(tabs().includes('Parenting'), 'no Parenting tab');
  app.setFrame(0); ed.toggleKey(id, 'position'); app.setFrame(24); ed.setValue(id, 'position', [200, 100]); await wait();
  expect(tabs().includes('Path'), 'no Path tab');
  await openTab('Path');
  const even = [...panel().querySelectorAll('.mi-field')].find(f => f.textContent?.includes('Even'))!.querySelector('input')!;
  await change(even, true);
  expect(layer().transform.position.even === true, 'even speed not set');
  ed.edit('fx', c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') x.effects = [newEffect('echo', 'e1', 1), newEffect('shadow', 'e2', 2)]; }); await wait();
  expect(tabs().includes('Trail') && tabs().includes('Effects'), `tabs: ${tabs()}`);
  await openTab('Trail');
  expect(panel().querySelector('[data-val="fx:e1:amount"]') && !panel().querySelector('[data-val="fx:e2:amount"]'), 'Trail shows the wrong effects');
  await openTab('Effects');
  await change(input('input[data-val="fx:e2:amount"]'), '30');
  await change(input('input.mi-color'), '#ff0000');
  const l = layer();
  const sh = l.kind === 'drawings' ? l.effects?.[1] : undefined;
  expect(sh?.amount === 30 && sh.params?.color === '#ff0000', 'effect settings not set');
  input('[data-key="fx:e2:amount"]').click(); await wait();
  expect(ed.rowsOf(layer()).includes('fx:e2:amount'), 'effect key did not reach the timeline');
  ed.edit('cap', c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') x.caption = { ...defaultCaption(200, 100), text: 'Hello' }; }); await wait();
  expect(tabs().includes('Caption'), 'no Caption tab');
  await openTab('Caption');
  await change(input('input[data-val="cap:shake"]'), '50');
  expect(ed.valueNow(layer(), 'cap:shake') === 50, 'caption setting not set');
});

await check('Each kind of layer has its own tab: Drawing parts, Timing, Caption words and font, Camera, Clip', async () => {
  ed.addLayer('drawings');
  const plain = ed.comp.layers.find(l => l.kind === 'drawings' && l.id !== id && !l.caption)!.id;
  const pl = () => ed.layer(plain)!;
  ed.select(plain); await wait();
  await openTab('Drawing');
  const recolour = [...panel().querySelectorAll('.mi-field')].find(f => f.textContent?.startsWith('Recolour'))!.querySelector('input')!;
  await change(recolour, true);
  const l0 = pl();
  expect(l0.kind === 'drawings' && l0.parts?.line?.tint, 'recolour did not reach the Ink part');
  await openTab('Timing');
  await change(panel().querySelector<HTMLSelectElement>('select[aria-label="Plays"]')!, 'loop');
  await change(input('input[aria-label="Speed"]'), '0.5');
  const l1 = pl();
  expect(l1.kind === 'drawings' && l1.play === 'loop' && l1.speed === 0.5, 'playback not set');
  expect(panel().querySelector('[data-val="remap"]'), 'no Show frame row in Timing');
  await change(input('input[aria-label="Shows from frame"]'), '5');
  expect(pl().in === 4, `in point: ${pl().in}`);
  await openTab('Layer');
  await change(panel().querySelector<HTMLSelectElement>('select[aria-label="Colour label"]')!, '3');
  expect(pl().label === 3, 'label colour not set');
  ed.select(id); await wait();
  // a caption: words, font and balloon colours from the Caption tab
  await openTab('Caption');
  const words = panel().querySelector<HTMLTextAreaElement>('textarea.mi-words')!;
  words.value = 'Hi there'; words.dispatchEvent(new Event('change')); await wait();
  await change(panel().querySelector<HTMLSelectElement>('select[aria-label="Font"]')!, 'bangers');
  await change(panel().querySelector<HTMLSelectElement>('select[aria-label="Style"]')!, 'shout');
  const c = layer();
  expect(c.kind === 'drawings' && c.caption?.text === 'Hi there' && c.caption.font === 'bangers' && c.caption.style === 'shout', 'caption settings not set');
  expect(panel().querySelector('[data-val="cap:writeOn"]'), 'no Write on row');
  // a camera
  ed.addLayer('camera'); const cam = ed.comp.layers.find(l => l.kind === 'camera')!.id; ed.select(cam); await wait();
  expect(tabs().includes('Camera') && !tabs().includes('Drawing'), `camera tabs: ${tabs()}`);
  await openTab('Camera');
  expect([...panel().querySelectorAll('.mi-field')].some(f => f.textContent?.includes('Look through')), 'no camera options');
  // an anchor has no tab of its own
  const nul = ed.comp.layers.find(l => l.kind === 'null')!.id; ed.select(nul); await wait();
  expect(tabs().join() === 'Layer,Timing,Transform,Parenting', `anchor tabs: ${tabs()}`);
  // a clip
  ed.addLayer('drawings'); const loose = ed.comp.layers.find(l => l.kind === 'drawings' && l.id !== id && l.id !== plain)!.id;
  const clip = ed.group([loose], 'Walk'); ed.select(clip!); await wait();
  expect(tabs().includes('Clip'), `clip tabs: ${tabs()}`);
  await openTab('Clip');
  expect(panel().textContent?.includes('Walk') && [...panel().querySelectorAll('.mi-btn')].some(b => b.textContent === 'Go inside'), 'clip tab incomplete');
  ed.select(id); await wait();
});

await check('Typing keeps its place; it hides outside Motion and closes with ✕', async () => {
  await openTab('Layer');
  const name = input('input.mi-text'); name.focus();
  await change(name, 'Hero');
  expect(layer().name === 'Hero' && (document.activeElement as HTMLElement | null)?.dataset.focus === 'name', 'focus lost after an edit');
  app.setWorkspace('draw'); motion.update(); await wait();
  expect(getComputedStyle(panel()).display === 'none', 'shows outside Motion');
  app.setWorkspace('motion'); motion.update(); await wait();
  panel().querySelector<HTMLButtonElement>('.mi-close')!.click(); await wait();
  expect(panel().hidden, 'did not close');
});

await check('No page errors', () => { expect(!errors.length, errors.join(' | ')); });
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
