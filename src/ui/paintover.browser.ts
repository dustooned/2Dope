import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import { openOnionSettings } from './onionpop';

// Device settings this fixture changes; put back as they were afterwards.
const KEYS = ['2dope.paintOver', '2dope.m1.onion', '2dope.flipbook'];
const saved = KEYS.map((k) => [k, localStorage.getItem(k)] as const);

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const errors: string[] = [];
app.onNotice = () => {}; addEventListener('error', (e) => errors.push(e.message));
app.loadProject(new Project(320, 180)); app.setWorkspace('draw'); app.setFlipbook(true); app.setPaintOver(false);
const wait = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const stroke = (x0: number, y = 90) => {
  const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, r = canvas.getBoundingClientRect();
  for (const [type, x] of [['pointerdown', x0], ['pointermove', x0 + 30], ['pointerup', x0 + 50]] as const) {
    const p = app.view.docToScreen(x, y);
    canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 31, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.8, clientX: r.left + p.x, clientY: r.top + p.y }));
  }
};
const pixels = (d: Drawing) => d.line.getContext('2d')!.getImageData(0, 0, 320, 180).data;
const ink = (d: Drawing) => { const data = pixels(d); let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++; return n; };
const inkAt = (d: Drawing, x: number, y: number) => d.line.getContext('2d')!.getImageData(x, y, 1, 1).data[3]! > 0;
const same = (a: Drawing, b: Drawing) => { const x = pixels(a), y = pixels(b); return x.every((v, i) => v === y[i]); };
let passed = 0, failed = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) {
  const li = document.createElement('li');
  try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; }
  document.querySelector('#results')!.append(li);
}
await wait(180);

let first!: Drawing;
await check('A first stroke draws on frame 1', async () => {
  stroke(40); await wait(120); first = app.drawing; expect(ink(first) > 0, 'no ink on frame 1');
});
await check('Paint over off: + Frame starts blank', async () => {
  app.addFrame(); await wait();
  expect(app.project.exposures.length === 2 && app.drawing !== first && ink(app.drawing) === 0, 'the new frame was not blank');
  app.history.undo(); await wait(); expect(app.project.exposures.length === 1 && app.drawing === first, 'Undo did not remove the frame');
});
await check('Switching Paint over on is a device setting, not an undo step', () => {
  const before = app.history.peekUndo(); app.setPaintOver(true);
  expect(app.paintOver && localStorage.getItem('2dope.paintOver') === 'true' && app.history.peekUndo() === before, 'not saved, or it went into History');
});
await check('Paint over on: + Frame starts as a copy, and painting it leaves the original alone', async () => {
  app.addFrame(); await wait();
  const copy = app.drawing;
  expect(app.project.exposures.length === 2 && copy !== first && same(copy, first), 'the new frame is not a copy');
  stroke(200, 140); await wait(120);
  expect(inkAt(copy, 220, 140) && !inkAt(first, 220, 140), 'painting the copy changed the original');
  app.history.undo(); app.history.undo(); await wait();
  expect(app.project.exposures.length === 1, 'Undo twice did not remove the stroke and then the frame');
});
await check('Paint over on: Flip add frame starts as a copy too', async () => {
  app.flipAddFrame(true); await wait();
  expect(app.project.exposures.length === 2 && app.drawing !== first && same(app.drawing, first), 'Flip add frame did not copy');
  app.history.undo(); await wait();
});
await check('Paint over on: the blank page shows the frame to paint over, and the first stroke paints a copy', async () => {
  app.goBlankPage(); await wait();
  expect(app.blankPage, 'no blank page');
  const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!; app.requestRender(); await wait(120);
  const p = app.view.docToScreen(60, 90), r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
  const shown = canvas.getContext('2d')!.getImageData(Math.round(p.x * k), Math.round(p.y * k), 1, 1).data;
  const bg = canvas.getContext('2d')!.getImageData(Math.round(app.view.docToScreen(300, 10).x * k), Math.round(app.view.docToScreen(300, 10).y * k), 1, 1).data;
  expect(shown.some((v, i) => i < 3 && Math.abs(v - bg[i]!) > 40), 'the blank page did not show the drawing it will start from');
  stroke(200, 40); await wait(120);
  const d = app.drawing;
  expect(!app.blankPage && app.project.exposures.length === 2 && d !== first && inkAt(d, 60, 90) && inkAt(d, 220, 40) && !inkAt(first, 220, 40), 'the first stroke did not paint on a copy');
  app.history.undo(); app.history.undo(); await wait();
});
await check('Paint over on: the eraser on the blank page erases a copy, not the original', async () => {
  app.goBlankPage(); await wait(); app.setTool('eraser');
  stroke(40); await wait(120);
  const d = app.drawing;
  expect(app.project.exposures.length === 2 && d !== first && ink(d) < ink(first), 'the eraser did not erase a copy');
  app.setTool('brush'); app.history.undo(); app.history.undo(); await wait();
});
await check('Paint over off again: the blank page stays blank and the eraser does nothing there', async () => {
  app.setPaintOver(false); app.goBlankPage(); await wait(); app.setTool('eraser'); stroke(40); await wait(120);
  expect(app.blankPage && app.project.exposures.length === 1, 'the eraser made a frame on a blank page');
  app.setTool('brush'); stroke(200, 140); await wait(120);
  expect(app.project.exposures.length === 2 && !inkAt(app.drawing, 60, 90) && inkAt(app.drawing, 220, 140), 'the new frame was not blank');
  app.history.undo(); app.history.undo(); await wait();
});
await check('Onion settings: Tinted and Lightbox styles, and the Paint over switch', async () => {
  const anchor = document.createElement('button'); anchor.textContent = 'Onion'; document.body.append(anchor);
  app.onion.tint = true; openOnionSettings(app, anchor); await wait();
  const pop = document.querySelector<HTMLElement>('.onion-pop')!, q = (k: string) => pop.querySelector<HTMLButtonElement>(`[data-onion="${k}"]`)!;
  expect(q('tinted').getAttribute('aria-pressed') === 'true' && q('lightbox').getAttribute('aria-pressed') === 'false', 'Tinted not shown as chosen');
  q('lightbox').click(); await wait();
  expect(!app.onion.tint && q('lightbox').getAttribute('aria-pressed') === 'true' && JSON.parse(localStorage.getItem('2dope.m1.onion') ?? '{}').tint === false, 'Lightbox not chosen or not saved');
  expect(q('paintover').getAttribute('aria-checked') === 'false', 'Paint over switch shows the wrong state');
  q('paintover').click(); await wait();
  expect(app.paintOver && q('paintover').getAttribute('aria-checked') === 'true' && document.activeElement === q('paintover'), 'Paint over switch did not turn it on, or lost focus');
  q('tinted').click(); q('paintover').click(); await wait();
  expect(app.onion.tint && !app.paintOver, 'switching back failed');
  for (const b of pop.querySelectorAll<HTMLElement>('button')) expect(b.getBoundingClientRect().height >= 44, `${b.textContent} is under 44 px`);
  q('tinted').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(pop.hidden, 'Escape did not close the settings'); anchor.remove();
});
await check('No page errors', () => expect(!errors.length, errors.join('; ')));

for (const [k, v] of saved) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app };
