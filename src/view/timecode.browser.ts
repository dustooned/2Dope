/**
 * The Timecode effect in the real App: the layer Story and Motion add, its settings (format,
 * start, label, colour, opacity, place, move and scale), the same pixels in the canvas preview and
 * in every export (PNG sequence, GIF, video), the project file (format 12) and its controls.
 */
import { App } from '../app';
import { param, type LayerEffect } from '../core/effects';
import { Project } from '../core/project';
import { captureProject, loadProjectFile } from '../io/projectio';
import { SCHEMA, validateProjectFile } from '../io/schema';
import { exportGif, planGif } from '../io/exportgif';
import { decodeGif } from '../io/gifdecode';
import { exportSequence } from '../io/exportseq';
import { DEFAULT_EXPORT } from '../io/exportplan';
import { exportVideo } from '../io/exportvideo';
import { readZip } from '../io/zip';
import { EffectsPanel } from '../ui/effectspanel';
import { MotionPanel } from '../ui/motion';
import { drawComp, releaseScratch } from './composite';
import { setFxPreview } from './effects';
import type { DrawingsLayer } from '../core/comp';

const W = 160, H = 90, FPS = 12, LEN = 36;
// the Effects card remembers its mode, tab and place per device: start from the defaults (restored at the end)
const FX_KEYS = ['2dope.fx.mode', '2dope.fx.tab', '2dope.fx.pos', '2dope.fx.preview'];
const fxSaved = FX_KEYS.map((k) => { try { return localStorage.getItem(k); } catch { return null; } });
for (const k of FX_KEYS) try { localStorage.removeItem(k); } catch { /* private window */ }
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage), motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!), effects = new EffectsPanel(app);
app.openEffects = (id) => effects.show(id);
const changed = app.editor.onChange; app.editor.onChange = () => { changed(); effects.follow(); };
const errors: string[] = [];
addEventListener('error', (e) => errors.push(e.message));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
const wait = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));
const expect = (ok: unknown, why: string) => { if (!ok) throw new Error(why); };
let passed = 0, failed = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) {
  const li = document.createElement('li');
  try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; }
  document.querySelector('#results')!.append(li); releaseScratch();
}
const hold = { pin: async () => {}, unpin: () => {} };

/** A frame of the shot as exports draw it (white paper), or as the canvas previews it. */
function render(frame: number, exporting = true, p: Project = app.project): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  drawComp(g, p, p.comp, frame, exporting ? { backgrounds: true, export: true } : { backgrounds: true });
  return c;
}
const pixels = (c: HTMLCanvasElement | ImageBitmap | OffscreenCanvas) => {
  const t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d')!; g.drawImage(c as CanvasImageSource, 0, 0, W, H); return g.getImageData(0, 0, W, H).data;
};
/** Where a picture differs from the shot without the timecode (the box and its text). */
const mask = (px: Uint8ClampedArray, base: Uint8ClampedArray, tol = 48) => { const m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) { const k = i * 4; if (Math.abs(px[k]! - base[k]!) > tol || Math.abs(px[k + 1]! - base[k + 1]!) > tol || Math.abs(px[k + 2]! - base[k + 2]!) > tol) m[i] = 1; } return m; };
/** The bright letters (inside the dark box). */
const letters = (px: Uint8ClampedArray, box: Uint8Array) => { const m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) if (box[i] && px[i * 4]! > 170 && px[i * 4 + 1]! > 170 && px[i * 4 + 2]! > 170) m[i] = 1; return m; };
const count = (m: Uint8Array) => m.reduce((n, v) => n + v, 0);
const iou = (a: Uint8Array, b: Uint8Array) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 1; };
const bbox = (m: Uint8Array) => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
/** JSON with object keys sorted (stored params come back in the effect's own order). */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
/** Mean luminance difference inside a mask. */
const lumDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray, m: Uint8Array) => { let s = 0, n = 0; const y = (p: Uint8ClampedArray, k: number) => 0.299 * p[k]! + 0.587 * p[k + 1]! + 0.114 * p[k + 2]!; for (let i = 0; i < m.length; i++) if (m[i]) { s += Math.abs(y(a, i * 4) - y(b, i * 4)); n++; } return n ? s / n : 0; };
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
const show = (label: string, c: HTMLCanvasElement) => { const f = document.createElement('figure'); f.style.margin = '0'; f.append(c, Object.assign(document.createElement('figcaption'), { textContent: label })); document.querySelector('#looks')!.append(f); };

const tcLayer = () => app.project.comp.layers.find((l) => l.effects?.some((e) => e.type === 'timecode')) as DrawingsLayer | undefined;
const tcEffect = () => tcLayer()!.effects!.find((e) => e.type === 'timecode')!;
/** Change the effect's settings the way the panel does: one undo step. */
function setTc(patch: Partial<LayerEffect> & { params?: LayerEffect['params'] }, label = 'Timecode settings'): void {
  const l = tcLayer()!;
  app.editor.edit(label, (c) => { const x = c.layers.find((y) => y.id === l.id)!; x.effects = x.effects!.map((e) => e.type === 'timecode' ? { ...e, ...patch, params: { ...e.params, ...patch.params } } : e); });
}

app.loadProject(new Project(W, H));
app.project.comp.fps = FPS; app.project.comp.duration = LEN;
app.project.layer.exposures[0]!.length = LEN;
{ const d = app.drawing; const g = d.line.getContext('2d')!; g.fillStyle = '#3a8f5c'; g.fillRect(20, 20, 120, 50); d.rev++; }
app.setWorkspace('motion'); setFxPreview('full'); motion.update();
await wait(100);
let baseline = pixels(render(13));

await check('Motion → New layer → Timecode adds one layer on top for the whole shot, one Undo step', async () => {
  const before = app.project.comp.layers.length, undo = app.history.peekUndo();
  const add = [...document.querySelectorAll<HTMLButtonElement>('#motion button')].find((b) => b.getAttribute('aria-label') === 'New Motion layer');
  expect(add, 'no New layer menu'); add!.click(); await wait();
  const item = [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button')].find((b) => b.textContent?.trim() === 'Timecode');
  expect(item, 'New layer menu has no Timecode'); item!.click(); await wait(120);
  const l = tcLayer();
  expect(l && app.project.comp.layers[0] === l && app.project.comp.layers.length === before + 1, 'not one new top layer');
  expect(l!.start === 0 && l!.exposures.reduce((n, e) => n + e.length, 0) === app.compEnd, `does not span the shot (${l!.start}, ${app.compEnd})`);
  expect(app.history.peekUndo() !== undo && app.history.peekUndo()?.label === 'Add timecode layer', `undo label ${app.history.peekUndo()?.label}`);
  app.undo(); await wait(); expect(!tcLayer() && app.project.comp.layers.length === before, 'Undo left the layer');
  app.redo(); await wait(); expect(tcLayer(), 'Redo lost the layer');
  setTc({ amount: 16 }, 'Timecode size');
});

await check('The default SMPTE label draws at the bottom centre and changes every frame', () => {
  const a = pixels(render(0)), b = pixels(render(13)), box = mask(b, baseline);
  const r = bbox(box);
  expect(count(box) > 200, `nothing drawn (${count(box)})`);
  expect(r.y1 > H * 0.75 && Math.abs((r.x0 + r.x1) / 2 - W / 2) < 6, `not bottom centre ${JSON.stringify(r)}`);
  expect(!same(a, b), 'frames 0 and 13 look the same');
  expect(count(letters(b, box)) > 20, 'no white letters inside the box');
  show('frame 13', render(13));
});

await check('Canvas preview and export draw the same pixels', () => {
  for (const f of [0, 7, 13, 35]) expect(same(pixels(render(f, false)), pixels(render(f, true))), `frame ${f} differs`);
});

await check('Formats, start offset and label change the text, not its place', () => {
  const smpte = pixels(render(13));
  setTc({ params: { format: 'frames' } }); const frames = pixels(render(13));
  setTc({ params: { format: 'secFrames' } }); const sec = pixels(render(13));
  expect(!same(smpte, frames) && !same(frames, sec) && !same(sec, smpte), 'formats look the same');
  // frames: frame 13 with start 0 is the same label as frame 3 with start 10
  setTc({ params: { format: 'frames', start: 10 } }); const offset = pixels(render(3));
  setTc({ params: { start: 0 } }); expect(same(offset, pixels(render(13))), 'start offset is not added');
  setTc({ params: { prefix: 'SC 1' } }); const labelled = mask(pixels(render(13)), baseline);
  expect(bbox(labelled).w > bbox(mask(frames, baseline)).w + 10, 'label did not widen the box');
  setTc({ params: { prefix: '', format: 'timecode' } });
});

await check('Count from the layer or the shot: a later layer keeps shot time unless asked', () => {
  const shot13 = pixels(render(13)), shot7 = pixels(render(7));
  tcLayer()!.start = 6;
  expect(same(pixels(render(13)), shot13), 'shot time changed when the layer moved');
  setTc({ params: { from: 'layer' } });
  const layer13 = pixels(render(13)), m = mask(layer13, baseline), m7 = mask(shot7, baseline);
  expect(iou(letters(layer13, m), letters(shot7, m7)) > 0.98, 'layer time at shot frame 13 is not frame 7');
  setTc({ params: { from: 'shot' } }); tcLayer()!.start = 0;
});

await check('Colour, opacity and backing box', () => {
  const full = pixels(render(13));
  setTc({ size: 0 }); expect(same(pixels(render(13)), baseline), 'opacity 0 still draws');
  setTc({ size: 50 }); const half = pixels(render(13));
  const strength = (px: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += Math.abs(px[i]! - baseline[i]!); return s; };
  expect(strength(half) < strength(full) * 0.8 && strength(half) > 0, 'opacity 50 is not fainter');
  setTc({ size: 100, params: { color: '#ff0000' } }); const red = pixels(render(13)), rm = mask(red, baseline);
  let reds = 0; for (let i = 0; i < W * H; i++) if (rm[i] && red[i * 4]! > 170 && red[i * 4 + 1]! < 90) reds++;
  expect(reds > 20, 'colour not used');
  setTc({ params: { color: '#ffffff', box: false } }); const nobox = mask(pixels(render(13)), baseline);
  expect(count(nobox) < count(mask(full, baseline)) * 0.6, 'box still drawn');
  setTc({ params: { box: true } });
});

await check('Place presets, Move across / down and Scale', () => {
  const at = (anchor: string) => { setTc({ params: { anchor } }); return bbox(mask(pixels(render(13)), baseline)); };
  const tl = at('tl'), br = at('br'), mc = at('mc');
  expect(tl.x0 < 12 && tl.y0 < 12, `top left ${JSON.stringify(tl)}`);
  expect(br.x1 > W - 12 && br.y1 > H - 12, `bottom right ${JSON.stringify(br)}`);
  expect(Math.abs((mc.y0 + mc.y1) / 2 - H / 2) < 4 && Math.abs((mc.x0 + mc.x1) / 2 - W / 2) < 4, `centre ${JSON.stringify(mc)}`);
  setTc({ params: { anchor: 'tl', x: 25 } }); const moved = bbox(mask(pixels(render(13)), baseline));
  expect(Math.abs(moved.x0 - tl.x0 - W / 4) <= 2, `move across ${moved.x0} vs ${tl.x0}`);
  setTc({ params: { x: 0, scale: 150 } }); const big = bbox(mask(pixels(render(13)), baseline));
  expect(big.w > tl.w * 1.35 && big.h > tl.h * 1.35, `scale ${big.w}×${big.h} vs ${tl.w}×${tl.h}`);
  setTc({ params: { scale: 100, anchor: 'bc' } });
});

await check('Saved in the project (format 12) and read back the same; newer formats refused', async () => {
  setTc({ params: { prefix: 'TC', start: 24, format: 'timecode' } });
  const cap = await captureProject(app.project, { mode: 'archive' }).settle();
  expect(cap.file.schema === 12, `schema ${cap.file.schema}`);
  const stored = Object.values(cap.file.comps).flatMap((c) => c.layers).flatMap((l) => l.effects ?? []).find((e) => e.type === 'timecode')!;
  expect(stored && stored.params?.prefix === 'TC' && stored.params?.start === 24 && stored.amount === 16, `stored ${JSON.stringify(stored)}`);
  const json = JSON.parse(JSON.stringify(cap.file));
  const loaded = loadProjectFile(validateProjectFile(json)).project;
  const back = loaded.comps.get(loaded.main)!.layers.find((l) => l.effects?.some((x) => x.type === 'timecode'));
  expect(back && canon(back.effects) === canon(tcLayer()!.effects) && back.start === tcLayer()!.start && back.kind === 'drawings' && back.exposures.reduce((n, x) => n + x.length, 0) === LEN, `loaded effect or layer differs: ${canon(back?.effects)} vs ${canon(tcLayer()!.effects)}`);
  // the loaded shot draws the same label. Its drawings are parked until residency brings them back
  // (the app and exports pin them); give them the original pages here, as residency would
  for (const d of loaded.drawings.values()) if (d.parked) { d.parked = null; d.line.width = W; d.line.height = H; const src = app.project.drawings.get(d.id); if (src?.line.width) d.line.getContext('2d')!.drawImage(src.line, 0, 0); d.rev += 1000; }
  const off = (p: Project) => { const c = render(13, true, p).getContext('2d')!; return c.getImageData(0, 0, W, H).data; };
  expect(same(off(loaded), off(app.project)), 'loaded project draws another picture');
  let refused = false; try { validateProjectFile({ ...json, schema: SCHEMA + 1 }); } catch { refused = true; }
  expect(refused, 'newer format was not refused');
  setTc({ params: { prefix: '', start: 0 } });
});

baseline = pixels(render(13));
{ const l = tcLayer()!; l.effects = l.effects!.map((e) => ({ ...e, on: false })); baseline = pixels(render(13)); l.effects = l.effects!.map((e) => ({ ...e, on: true })); }

await check('PNG sequence export has the same pixels as the canvas', async () => {
  const out = await exportSequence(app.project, { ...DEFAULT_EXPORT, background: 'white' }, [], () => {});
  const files = await readZip(out.zip), pngs = [...files.keys()].filter((k) => k.endsWith('.png')).sort();
  expect(pngs.length === LEN, `${pngs.length} PNGs`);
  for (const f of [0, 13]) {
    const bmp = await createImageBitmap(new Blob([files.get(pngs[f]!)! as BlobPart], { type: 'image/png' }));
    expect(same(pixels(bmp), pixels(render(f))), `PNG frame ${f} differs`);
  }
});

await check('GIF export shows the same timecode', async () => {
  const plan = planGif(app.project, false);
  const blob = await exportGif(app.project, false, new AbortController().signal, hold, () => {});
  const gif = decodeGif(new Uint8Array(await blob.arrayBuffer()));
  for (const f of [0, 13]) {
    const i = Math.round((f * plan.samples) / plan.frames), want = pixels(render(f)), got = new Uint8ClampedArray(gif.frames[i]!.rgba);
    const wm = mask(want, baseline), gm = mask(got, baseline);
    const other = pixels(render(f === 0 ? 13 : 0)), both = new Uint8Array(W * H).map((_, k) => (wm[k] || gm[k] ? 1 : 0));
    const own = lumDiff(got, want, both), cross = lumDiff(got, other, both);
    expect(iou(wm, gm) > 0.9 && own < 16 && own < cross, `GIF frame ${f} (picture ${i} of ${plan.samples}): box ${iou(wm, gm).toFixed(2)}, luminance off by ${own.toFixed(1)} (another frame ${cross.toFixed(1)})`);
  }
});

await check('Video export shows the same timecode (decoded back)', async () => {
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('mediabunny');
  const result = await exportVideo(app.project, { format: 'webm', size: 'original', quality: 'high', background: 'white' }, () => {}, new AbortController().signal, hold);
  const input = new Input({ source: new BlobSource(result.blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack(); expect(track && await track.canDecode(), 'video cannot be decoded');
    const sink = new CanvasSink(track!, { width: W, height: H, fit: 'fill' });
    for (const f of [0, 13]) {
      const wrapped = await sink.getCanvas((f + 0.5) / FPS); expect(wrapped, `no video frame ${f}`);
      const got = pixels(wrapped!.canvas as HTMLCanvasElement), want = pixels(render(f)), other = pixels(render(f === 0 ? 13 : 0));
      const wm = mask(want, baseline), gm = mask(got, baseline, 64), both = new Uint8Array(W * H).map((_, k) => (wm[k] || gm[k] ? 1 : 0));
      const own = lumDiff(got, want, both), cross = lumDiff(got, other, both);
      expect(iou(wm, gm) > 0.75 && own < cross, `video frame ${f}: box overlap ${iou(wm, gm).toFixed(2)}, luminance off by ${own.toFixed(1)} (another frame ${cross.toFixed(1)})`);
    }
  } finally { input.dispose(); }
});

await check('Effect controls: format, place grid, start, label and opacity in Simple mode with 44 px targets', async () => {
  effects.show(tcLayer()!.id); await wait(120);
  const panel = document.querySelector<HTMLElement>('.fxpanel')!; expect(panel && !panel.hidden, 'panel not open');
  if (!panel.querySelector('.fx-grid3')) { const head = [...panel.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Timecode')); head?.click(); await wait(80); }
  const grid = panel.querySelector<HTMLElement>('.fx-grid3'); expect(grid, 'no place grid in Simple mode');
  const cells = [...grid!.querySelectorAll<HTMLButtonElement>('button')];
  expect(cells.length === 9 && cells.every((b) => b.offsetWidth >= 44 && b.offsetHeight >= 44), `grid cells ${cells.map((b) => `${b.offsetWidth}x${b.offsetHeight}`).join(' ')}`);
  cells[0]!.click(); await wait(80); expect(param<string>(tcEffect(), 'anchor') === 'tl', 'grid did not set the place');
  const fmt = [...panel.querySelectorAll<HTMLButtonElement>('[aria-label=Format] button')].find((b) => b.textContent === 'Frames'); expect(fmt, 'no Frames button');
  fmt!.click(); await wait(80); expect(param<string>(tcEffect(), 'format') === 'frames', 'format not set');
  const start = panel.querySelector<HTMLInputElement>('input[type=number][aria-label^="Start at"]'); expect(start && start.offsetHeight >= 44, 'no start box');
  start!.value = '1001'; start!.dispatchEvent(new Event('change')); await wait(80); expect(param<number>(tcEffect(), 'start') === 1001, 'start not set');
  const label = panel.querySelector<HTMLInputElement>('input[type=text][aria-label=Label]'); expect(label && label.offsetHeight >= 44, 'no label box');
  label!.value = 'SH 3'; label!.dispatchEvent(new Event('change')); await wait(80); expect(param<string>(tcEffect(), 'prefix') === 'SH 3', 'label not set');
  const undo = app.history.peekUndo()?.label ?? ''; expect(/label/i.test(undo), `label is not its own undo step (${undo})`);
  app.undo(); await wait(80); expect(param<string>(tcEffect(), 'prefix') === '', `Undo did not restore the label (${undo} → now ${JSON.stringify(tcEffect().params)}, next undo ${app.history.peekUndo()?.label})`);
  expect(panel.querySelector<HTMLInputElement>('input[type=text][aria-label=Label]')?.value === '', 'the card still shows the undone label');
  expect(panel.querySelector('input[type=range][aria-label=Opacity]'), 'no opacity slider in Simple mode');
  expect(panel.querySelector('input[type=color][aria-label=Colour]'), 'no colour in Simple mode');
});

await check('No page errors', () => expect(!errors.length, errors.join(' | ')));
FX_KEYS.forEach((k, i) => { try { if (fxSaved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, fxSaved[i]!); } catch { /* private window */ } });
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
