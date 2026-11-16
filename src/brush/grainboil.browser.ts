/** Boiling grain: consecutive frames painted with Boil differ in grain, Fixed matches, it repeats, export equals preview. */
import { App } from '../app';
import { cloneBrush, PRESETS, type BrushSettings } from '../core/brush';
import { Project, type Drawing } from '../core/project';
import type { StrokePoint, StrokeRecord } from '../core/stroke';
import { strokeLength } from '../core/stroke';
import { drawComp } from '../view/composite';
import { buildPanel } from '../ui/panel';
import { dabsForStroke } from './dabs';
import { RasterEngine, makeCanvas, ctx2d } from './raster';

// this fixture runs on its own test origin; it still puts back the brush keys it touches
const KEYS = ['2dope.m0.brush', '2dope.brushes.preferences'];
const saved = KEYS.map(k => [k, localStorage.getItem(k)] as const);
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage);
buildPanel(app, document.querySelector<HTMLElement>('#studio')!);
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

/** A grainy brush with no randomness besides the grain: the same pen path paints the same dabs. */
const grainy = (boil?: 1 | 2 | 3): BrushSettings => {
  const b = cloneBrush(PRESETS[0]!);
  Object.assign(b, { name: 'Grain test', size: 40, hardness: 0.9, spacing: 0.2, opacity: 1, flow: 1, scatter: 0, grain: 0.9, grainScale: 1, taperStart: 0, taperEnd: 0, smoothing: 0, stabilize: 0, motionFilter: 0, expression: 0, postSmooth: 0, pulledString: false, followDirection: false, roundness: 1, angle: 0 });
  for (const k of ['sizeDyn', 'opacityDyn', 'flowDyn'] as const) b[k] = { ...b[k], control: 'off', jitter: 0 };
  b.tiltShade = { ...b.tiltShade, enabled: false };
  delete b.hueJitter; delete b.satJitter; delete b.brightJitter; delete b.wetPull; delete b.grainImage; delete b.tipImage; delete b.vectorStyle;
  if (boil) b.grainBoil = boil; else delete b.grainBoil;
  return b;
};
/** How many pixels two images differ in (alpha or red by more than 2). */
const diff = (a: ImageData, b: ImageData) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i + 3]! - b.data[i + 3]!) > 2 || Math.abs(a.data[i]! - b.data[i]!) > 2) n++; return n; };
const ink = (a: ImageData) => { let n = 0; for (let i = 3; i < a.data.length; i += 4) if (a.data[i]! > 0) n++; return n; };

// ---- 1. the engine: one stroke record painted as on different frames
const W = 200, H = 120;
const path: StrokePoint[] = Array.from({ length: 40 }, (_, i) => ({ x: 20 + i * 4, y: 40 + (i % 10) * 4, pressure: 0.8, tiltX: 0, tiltY: 0, t: i * 8 }));
const engines = [new RasterEngine(W, H), new RasterEngine(W, H)];
const paintAt = (boil: 1 | 2 | 3 | undefined, frame: number | undefined, engine = engines[0]!): ImageData => {
  const target = makeCanvas(W, H);
  const rec: StrokeRecord = { id: 'g', tool: 'brush', brush: grainy(boil), color: '#202020', seed: 7, points: path, ...(frame === undefined ? {} : { grainFrame: frame }) };
  engine.bind(target);
  engine.begin(rec, null);
  engine.addDabs(dabsForStroke(rec.brush, rec.seed, rec.points, strokeLength(rec.points)));
  engine.commit();
  return ctx2d(target).getImageData(0, 0, W, H);
};

await check('Engine, Boil: frames 0, 1 and 2 paint the same stroke with different grain', () => {
  const f = [0, 1, 2].map(n => paintAt(1, n));
  expect(ink(f[0]!) > 2000, `the stroke has little paint (${ink(f[0]!)} px)`);
  for (const [a, b] of [[0, 1], [1, 2], [0, 2]] as const) {
    const d = diff(f[a]!, f[b]!);
    expect(d > ink(f[0]!) * 0.08, `frames ${a} and ${b} differ in only ${d} of ${ink(f[0]!)} px`);
  }
  // same stroke, same coverage: only the texture moved
  const k = ink(f[1]!) / ink(f[0]!);
  expect(k > 0.9 && k < 1.1, `coverage changed by ${k.toFixed(2)}x`);
});
await check('Engine, Fixed: every frame paints identical pixels (and a stroke with no frame too)', () => {
  const a = paintAt(undefined, 0), b = paintAt(undefined, 1), c = paintAt(undefined, 2), old = paintAt(undefined, undefined);
  expect(diff(a, b) === 0 && diff(a, c) === 0 && diff(a, old) === 0, `Fixed differs: ${diff(a, b)}, ${diff(a, c)}, ${diff(a, old)}`);
});
await check('Engine: a boil on its first step matches Fixed exactly', () => {
  expect(diff(paintAt(1, 0), paintAt(undefined, 0)) === 0, 'frame 0 of a boil is not the fixed grain');
});
await check('Engine: repeatable, the same frame repaints the same pixels, on another engine too', () => {
  for (const n of [1, 5, 17]) {
    const a = paintAt(1, n), b = paintAt(1, n), c = paintAt(1, n, engines[1]);
    expect(diff(a, b) === 0 && diff(a, c) === 0, `frame ${n} repainted differently (${diff(a, b)}, ${diff(a, c)})`);
  }
});
await check('Engine: On 2s and On 3s hold the grain for 2 and 3 frames', () => {
  const two = [0, 1, 2, 3].map(n => paintAt(2, n));
  expect(diff(two[0]!, two[1]!) === 0 && diff(two[2]!, two[3]!) === 0, 'On 2s moved within a pair');
  expect(diff(two[1]!, two[2]!) > 300, 'On 2s did not move on frame 2');
  const three = [0, 2, 3, 5, 6].map(n => paintAt(3, n));
  expect(diff(three[0]!, three[1]!) === 0 && diff(three[2]!, three[3]!) === 0, 'On 3s moved within three frames');
  expect(diff(three[1]!, three[2]!) > 300 && diff(three[3]!, three[4]!) > 300, 'On 3s did not move on frames 3 and 6');
});

// ---- 2. the app: real pen strokes on consecutive drawings
/** A project with drawings on frames 0, 1, 2 and one held for frames 3-4. */
const shot = async (): Promise<Project> => {
  const p = new Project(W, H); p.comp.duration = 6;
  if (p.layer.kind === 'drawings') {
    const ds = [p.drawing(p.layer.exposures[0]!.drawing), p.newDrawing(), p.newDrawing(), p.newDrawing()];
    p.layer.exposures = ds.map((d, i) => ({ drawing: d.id, length: i === 3 ? 2 : 1 }));
  }
  app.loadProject(p); app.setWorkspace('draw'); app.setTool('brush'); app.setPlane('line'); await wait(200);
  return p;
};
const pen = async (frame: number): Promise<Drawing> => {
  app.setFrame(frame); app.requestRender(); await wait(120);
  await app.residency.ensure(app.drawing);
  const r = canvas.getBoundingClientRect();
  const pts = path.filter((_, i) => i % 3 === 0);
  const toClient = (q: StrokePoint) => { const s = app.view.matrix().transformPoint(new DOMPoint(q.x, q.y)); return { clientX: r.left + s.x, clientY: r.top + s.y }; };
  pts.forEach((q, i) => canvas.dispatchEvent(new PointerEvent(i === 0 ? 'pointerdown' : 'pointermove', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 51, button: 0, buttons: 1, pressure: 0.8, ...toClient(q) })));
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 51, button: 0, buttons: 0, pressure: 0, ...toClient(pts.at(-1)!) }));
  await wait(120);
  return app.drawing;
};
const pixels = (d: Drawing) => d.line.getContext('2d')!.getImageData(0, 0, W, H);

let boilShot: Project | null = null;
await check('App, Boil: pen strokes on frames 0, 1 and 2 have different grain', async () => {
  boilShot = await shot();
  app.setBrush(grainy(1), false);
  const f: ImageData[] = [];
  for (const n of [0, 1, 2]) f.push(pixels(await pen(n)));
  expect(ink(f[0]!) > 1000, `little paint landed (${ink(f[0]!)} px)`);
  expect(diff(f[0]!, f[1]!) > ink(f[0]!) * 0.08 && diff(f[1]!, f[2]!) > ink(f[0]!) * 0.08, `frames barely differ (${diff(f[0]!, f[1]!)}, ${diff(f[1]!, f[2]!)} of ${ink(f[0]!)})`);
});
await check('App: a held drawing takes the grain of its first frame wherever in the hold you paint', () => {
  app.setFrame(3); expect(app.grainFrame === 3, `frame 3 gives ${app.grainFrame}`);
  app.setFrame(4); expect(app.grainFrame === 3, `frame 4 (inside the hold) gives ${app.grainFrame}`);
  app.setFrame(1); expect(app.grainFrame === 1, `frame 1 gives ${app.grainFrame}`);
});
await check('App, Boil: repeatable, painting the shot again gives the same pixels frame for frame', async () => {
  const before = [0, 1, 2].map(n => pixels(boilShot!.drawingAtFrame(n)));
  await shot();
  app.setBrush(grainy(1), false);
  for (const n of [0, 1, 2]) { const d = diff(pixels(await pen(n)), before[n]!); expect(d === 0, `frame ${n} differs by ${d} px`); }
});
await check('Export equals preview on every frame, and the exported grain boils', () => {
  const p = app.project;
  const render = (f: number, exp: boolean) => { const c = makeCanvas(W, H), g = ctx2d(c); drawComp(g, p, p.comp, f, exp ? { backgrounds: true, export: true } : { backgrounds: true }); return g.getImageData(0, 0, W, H); };
  const out = [0, 1, 2].map(f => render(f, true));
  for (const f of [0, 1, 2]) {
    const d = diff(out[f]!, render(f, false));
    expect(d === 0, `frame ${f}: export and preview differ by ${d} px`);
    expect(diff(out[f]!, render(f, true)) === 0, `frame ${f}: a second export differs`);
  }
  expect(diff(out[0]!, out[1]!) > 300 && diff(out[1]!, out[2]!) > 300, 'the exported frames do not boil');
});
await check('App, Fixed: the same pen strokes on frames 0, 1 and 2 match', async () => {
  await shot();
  app.setBrush(grainy(), false);
  const f: ImageData[] = [];
  for (const n of [0, 1, 2]) f.push(pixels(await pen(n)));
  expect(ink(f[0]!) > 1000, `little paint landed (${ink(f[0]!)} px)`);
  expect(diff(f[0]!, f[1]!) === 0 && diff(f[1]!, f[2]!) === 0, `Fixed frames differ (${diff(f[0]!, f[1]!)}, ${diff(f[1]!, f[2]!)})`);
});

await check('Studio: Grain on each frame has four 44 px buttons, one pressed, and saves with the brush', async () => {
  app.setBrush(grainy(1), false); await wait(60);
  const btns = [...document.querySelectorAll<HTMLButtonElement>('.grain-boil-seg button')];
  expect(btns.length === 4, `${btns.length} buttons`);
  for (const b of btns) { const r = b.getBoundingClientRect(); expect(r.height >= 44 && r.width >= 44, `${b.textContent} is ${r.width.toFixed(0)}x${r.height.toFixed(0)}`); }
  const pressed = () => btns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent).join();
  expect(pressed() === 'Boil', `pressed: ${pressed()}`);
  btns.find(b => b.textContent === 'On 3s')!.click(); await wait(60);
  expect(app.brush.grainBoil === 3 && pressed() === 'On 3s', `after On 3s: ${app.brush.grainBoil} / ${pressed()}`);
  expect(JSON.parse(localStorage.getItem('2dope.m0.brush') ?? '{}').grainBoil === 3, 'not saved with the brush');
  btns.find(b => b.textContent === 'Fixed')!.click(); await wait(60);
  expect(!('grainBoil' in app.brush) && pressed() === 'Fixed', 'Fixed did not clear the setting');
  app.setTool('pen'); await wait(60);
  expect((document.querySelector('.grain-boil') as HTMLElement).hidden, 'shown for vector lines (they have no paper grain)');
  app.setTool('brush');
});

await check('No errors', () => expect(!errors.length, errors.join(' | ')));

for (const [k, v] of saved) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
