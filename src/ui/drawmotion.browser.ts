/** Motion while drawing: Hold still keeps a moving layer and the shot still; Show the move previews it and strokes still land. */
import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import { drawComp } from '../view/composite';
import { CanvasViewUI } from './canvasview';

const KEYS = ['2dope.drawMotion', '2dope.draw.layers', '2dope.draw.layersAlpha'];
const saved = KEYS.map(k => [k, localStorage.getItem(k)] as const);
const stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, stage);
const viewUI = new CanvasViewUI(app, stage); stage.append(viewUI.button);
const errors: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; }
  document.querySelector('#results')!.append(li);
};
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
/** The colour on screen at a page point (the page never moves with Show the move). */
const onPage = (x: number, y: number) => {
  const s = app.view.base().transformPoint(new DOMPoint(x, y)), k = canvas.width / canvas.getBoundingClientRect().width;
  const d = canvas.getContext('2d')!.getImageData(Math.round(s.x * k), Math.round(s.y * k), 1, 1).data;
  return d[0]! > 200 && d[1]! < 80 && d[2]! < 80 ? 'red' : d[2]! > 200 && d[0]! < 80 ? 'blue' : 'other';
};
const at = async (f: number) => { app.setFrame(f); app.requestRender(); await wait(200); };
const paint = async (d: Drawing, colour: string, x: number, y: number) => { await app.residency.ensure(d); const g = d.line.getContext('2d')!; g.fillStyle = colour; g.fillRect(x, y, 20, 20); d.rev++; };
const stroke = (x0: number, y: number) => {
  const r = canvas.getBoundingClientRect();
  for (const [type, x] of [['pointerdown', x0], ['pointermove', x0 + 10], ['pointerup', x0 + 20]] as const) {
    const s = app.view.base().transformPoint(new DOMPoint(x, y));
    canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 41, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.8, clientX: r.left + s.x, clientY: r.top + s.y }));
  }
};
const inkAt = (d: Drawing, x: number, y: number) => d.line.getContext('2d')!.getImageData(x, y, 1, 1).data[3]! > 0;

// A hero that Motion walks from x 160 to 260 over frames 0–10, over a background with a blue mark
const p = new Project(320, 180); p.comp.duration = 24;
app.loadProject(p); app.setWorkspace('draw'); app.setShowLayers(true, 1); app.setMotionWhileDrawing('hold'); await wait(200);
const hero = p.layer;
await paint(app.drawing, '#ff0000', 150, 80);
app.editor.addLayer('drawings');
const bg = p.comp.layers.find(l => l.id !== hero.id)!;
app.pickLayer(bg.id); await paint(app.drawing, '#0000ff', 20, 20);
app.pickLayer(hero.id); await wait(120);
if (hero.kind === 'drawings') hero.exposures[0]!.length = 24; // on screen for the whole shot
hero.transform.position.keys = [{ f: 0, v: [160, 90], in: { type: 'linear' }, out: { type: 'linear' } }, { f: 10, v: [260, 90], in: { type: 'linear' }, out: { type: 'linear' } }] as never;
const keysBefore = JSON.stringify(hero.transform);
const heroDrawing = app.drawing;

for (const flip of [false, true]) {
  const where = flip ? 'Draw’s Flipbook' : 'Draw';
  await check(`${where}, Hold still: the moving layer and the shot both stay still at frame 10`, async () => {
    document.body.classList.toggle('flipmode', flip); app.setMotionWhileDrawing('hold');
    await at(0); const f0 = [onPage(160, 90), onPage(30, 30)].join();
    await at(10); const f10 = [onPage(160, 90), onPage(30, 30), onPage(260, 90)].join();
    expect(f0 === 'red,blue' && f10 === 'red,blue,other', `frame 0 ${f0}, frame 10 ${f10}`);
  });
  await check(`${where}, Show the move: the layer walks over a still page and shot`, async () => {
    app.setMotionWhileDrawing('show');
    await at(10); const f10 = [onPage(260, 90), onPage(160, 90), onPage(30, 30)].join();
    expect(f10 === 'red,other,blue', `frame 10 ${f10}`);
    await at(0);
    expect(onPage(160, 90) === 'red' && !app.view.extra, 'frame 0 should need no shift');
  });
}
document.body.classList.remove('flipmode');

await check('Show the move: a stroke on the moved layer lands on its drawing, in its own place', async () => {
  app.setMotionWhileDrawing('show'); await at(10);
  stroke(270, 140); await wait(150);
  expect(inkAt(heroDrawing, 175, 140) && !inkAt(heroDrawing, 275, 140), 'the stroke did not land 100 px back, on the drawing');
  app.history.undo(); await wait();
  expect(!inkAt(heroDrawing, 175, 140), 'Undo did not remove the stroke');
});

await check('Drawing in either mode never changes the layer’s Motion keys', () => {
  expect(JSON.stringify(hero.transform) === keysBefore, 'the transform changed');
});

await check('Motion still shows the walk (the setting is for Draw and Animate only)', async () => {
  app.setMotionWhileDrawing('hold'); app.setWorkspace('motion'); await at(10);
  expect(!app.view.extra, 'Motion got a drawing shift');
  await app.residency.ensure(heroDrawing); await app.residency.ensure(p.drawing((bg as { exposures: { drawing: string }[] }).exposures[0]!.drawing));
  const c = document.createElement('canvas'); c.width = 320; c.height = 180;
  drawComp(c.getContext('2d')!, p, p.comp, 10, { export: true, camera: false });
  const px = c.getContext('2d')!.getImageData(260, 90, 1, 1).data;
  const all = c.getContext('2d')!.getImageData(0, 0, 320, 180).data, reds: string[] = [];
  for (let y = 0; y < 180; y += 10) for (let x = 0; x < 320; x += 10) { const i = (y * 320 + x) * 4; if (all[i]! > 200 && all[i + 1]! < 80 && all[i + 3]! > 200) reds.push(`${x},${y}`); }
  expect(px[0]! > 200 && px[1]! < 80, `the export at frame 10 does not show the hero at x 260 (red at ${reds.join(' ') || 'nowhere'}; parked ${!!heroDrawing.parked}, ${heroDrawing.line.width})`);
  app.setWorkspace('draw'); await wait(120);
});

await check('The View options switch it, show which is on, and remember it on this device', async () => {
  app.setMotionWhileDrawing('hold');
  viewUI.button.click(); await wait();
  const q = (m: string) => document.querySelector<HTMLButtonElement>(`[data-motion="${m}"]`)!;
  expect(q('hold').getAttribute('aria-pressed') === 'true' && q('show').getAttribute('aria-pressed') === 'false', 'Hold still not shown as on');
  const before = app.history.peekUndo();
  q('show').click(); await wait();
  expect(app.motionWhileDrawing === 'show' && localStorage.getItem('2dope.drawMotion') === '"show"' && q('show').getAttribute('aria-pressed') === 'true' && document.activeElement === q('show'), 'Show the move not chosen, saved or focused');
  expect(app.history.peekUndo() === before, 'switching went into History');
  for (const b of [q('hold'), q('show')]) expect(b.getBoundingClientRect().height >= 44, `${b.textContent} is under 44 px`);
  q('hold').click(); viewUI.button.click(); await wait();
});

await check('No page errors', () => expect(!errors.length, errors.join('; ')));
for (const [k, v] of saved) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app };
