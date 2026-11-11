/** Flipbook trim handles: every drawing on every track has one, wherever the playhead is. */
import { App } from '../app';
import { Project } from '../core/project';
import { FlipMode } from './flipmode';

// this fixture switches the Flipbook on; put every saved setting back when it ends (later fixtures share them)
const savedSettings = Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)!]));
const stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, stage);
const errors: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.loadProject(new Project(128, 128)); app.project.comp.duration = 24; app.setWorkspace('draw');
const flip = new FlipMode(app, stage);
app.onFrameChange = () => flip.update(); app.history.onChange = () => flip.update(); app.editor.onChange = () => flip.update();
const wait = (ms = 80) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); }
  document.querySelector('#results')!.append(li);
};

// two tracks: the one you draw on with three drawings, and another with one
const first = app.project.activeLayer;
for (let i = 0; i < 2; i++) app.appendFrame();
app.editor.addLayer('drawings');
const other = app.project.comp.layers.find(l => l.kind === 'drawings' && l.id !== first)!.id;
app.pickLayer(first); app.setFrame(0);
flip.set(true); flip.update(); await wait(200);

const cels = (track: string) => [...document.querySelectorAll<HTMLElement>(`.flip-track[data-id="${track}"] .flip-cel`)];
const lengths = () => app.project.comp.layers.find(l => l.id === first)!.kind === 'drawings' ? (app.project.comp.layers.find(l => l.id === first) as { exposures: { length: number }[] }).exposures.map(e => e.length).join() : '';
const drag = async (h: HTMLElement, cells: number) => {
  const b = h.getBoundingClientRect(), cell = cels(first)[0]!.getBoundingClientRect().width + 3;
  const ev = (t: string, x: number) => h.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 5, clientX: x, clientY: b.top + 4, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
  ev('pointerdown', b.left + 3); ev('pointermove', b.left + 3 + cell * cells + cell * 0.2); ev('pointerup', b.left + 3 + cell * cells + cell * 0.2);
  await wait(120);
};

await check('Every drawing has a trim handle, not only the one under the playhead', () => {
  const mine = cels(first), theirs = cels(other);
  expect(mine.length === 3 && mine.every(c => c.querySelector('.flip-trim')), `handles on ${mine.filter(c => c.querySelector('.flip-trim')).length} of ${mine.length}`);
  expect(theirs.every(c => c.querySelector('.flip-trim')), 'no handles on the other track');
  expect(!mine[0]!.querySelector('.flip-trim.quiet') && mine[2]!.querySelector('.flip-trim.quiet'), 'the current one is not marked');
});

await check('Dragging the handle of a drawing away from the playhead holds that drawing longer (one Undo step)', async () => {
  app.history.clear();
  await drag(cels(first)[2]!.querySelector<HTMLElement>('.flip-trim')!, 2);
  expect(lengths() === '1,1,3', `holds: ${lengths()}`);
  expect(app.frame === 0, 'the playhead moved');
  app.undo(); await wait();
  expect(lengths() === '1,1,1', `undo: ${lengths()}`);
});

await check('A handle on another track works too: it picks that track first', async () => {
  const was = app.project.comp.layers.find(x => x.id === other)!, len0 = was.kind === 'drawings' ? was.exposures[0]!.length : 0;
  await drag(cels(other)[0]!.querySelector<HTMLElement>('.flip-trim')!, 3);
  const l = app.project.comp.layers.find(x => x.id === other)!;
  expect(app.project.activeLayer === other && l.kind === 'drawings' && l.exposures[0]!.length === len0 + 3, `other track: ${l.kind === 'drawings' ? l.exposures.map(e => e.length) : ''}`);
});

await check('No page errors', () => { expect(!errors.length, errors.join(' | ')); });
flip.set(false);
localStorage.clear(); for (const [k, v] of Object.entries(savedSettings)) localStorage.setItem(k, v);
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
