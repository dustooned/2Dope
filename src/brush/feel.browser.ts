import { App } from '../app';
import { cloneBrush, dyn, NO_TILT_SHADE, PRESETS, type BrushSettings } from '../core/brush';
import { Project } from '../core/project';
import { strokeLength, type StrokePoint, type StrokeRecord } from '../core/stroke';
import { DabWalker, dabsForStroke, type Dab } from './dabs';
import { ctx2d, loadGrain, loadTip, makeCanvas, putPixels, RasterEngine } from './raster';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`;
  document.querySelector('#results')!.append(li); if (ok) passed++; else failed++;
};
const pixels = (c: HTMLCanvasElement) => ctx2d(c).getImageData(0, 0, c.width, c.height).data;
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
const alpha = (c: HTMLCanvasElement, x: number, y: number) => ctx2d(c).getImageData(x, y, 1, 1).data[3]!;
const point = (x: number, y: number, pressure = 1, t = 0): StrokePoint => ({ x, y, pressure, t, tiltX: 0, tiltY: 0 });
const line = (y: number, pressure = 1, length = 480) => Array.from({ length: 61 }, (_, i) => point(40 + i * length / 60, y, pressure, i * 8));
const base: BrushSettings = { ...cloneBrush(PRESETS[0]!), size: 48, hardness: 0.98, flow: 0.28, opacity: 1, spacing: 0.12, grain: 0, sizeDyn: dyn('off'), opacityDyn: dyn('off'), flowDyn: dyn('off'), taperStart: 0, taperEnd: 0, smoothing: 0, postSmooth: 0, tiltShade: NO_TILT_SHADE };
function record(brush: BrushSettings, points: StrokePoint[], tool: StrokeRecord['tool'] = 'brush'): StrokeRecord { return { id: 'feel', tool, brush: cloneBrush(brush), points, color: '#196b84', seed: 42 }; }
function paint(c: HTMLCanvasElement, rec: StrokeRecord, rerender = false) {
  const engine = new RasterEngine(c.width, c.height); engine.bind(c); engine.begin(rec);
  const walker = new DabWalker(rec.brush, rec.seed);
  for (const p of rec.points) engine.addDabs(walker.push(p));
  const live = pixels(engine.displaySource()).slice();
  const patch = engine.commit(rerender);
  return { live, patch };
}
function swatch(label: string, brush: BrushSettings, pressure: number | ((t: number) => number) = 1, repeats = 1) {
  const c = makeCanvas(560, 120), fig = document.createElement('figure'), caption = document.createElement('figcaption');
  caption.textContent = label; fig.append(caption, c); document.querySelector('#samples')!.append(fig);
  const pts = line(60).map((p, i) => ({ ...p, y: 60 + Math.sin(i / 60 * Math.PI * 2) * 12, pressure: typeof pressure === 'number' ? pressure : pressure(i / 60) }));
  for (let i = 0; i < repeats; i++) paint(c, record(brush, pts));
  return c;
}
const keys = ['2dope.brushes.preferences','2dope.m0.brush','2dope.m0.color','2dope.inkpaint','2dope.ui.level','2dope.select.shape'];
const saved = keys.map(k => localStorage.getItem(k));
localStorage.removeItem('2dope.brushes.preferences');
let app: App | null = null;
try {
  const paper = makeCanvas(8, 8), pg = ctx2d(paper); pg.fillStyle = '#fff'; pg.fillRect(0, 0, 8, 8); pg.fillStyle = '#000'; pg.fillRect(0, 0, 4, 8);
  const grain = paper.toDataURL(); await loadGrain(grain);
  const textured = { ...base, grain: 1, grainImage: grain, grainScale: 1 };
  const dab: Dab = { x: 64, y: 64, size: 40, alpha: 0.28, pressure: 1, angle: 0, roundness: 1, shade: 0 };
  const deposits = (pressure: number, count: number, opacity = 1) => {
    const c = makeCanvas(128, 128), e = new RasterEngine(128, 128); e.bind(c); e.begin(record({ ...textured, opacity }, []));
    e.addDabs(Array.from({ length: count }, () => ({ ...dab, pressure })));
    const live = pixels(e.displaySource()).slice(); e.commit(); return { c, live };
  };
  const one = deposits(1, 1), layered = deposits(1, 6), light = deposits(0.1, 1), limited = deposits(1, 40, 0.4);
  check('A textured stamp retains visible light and dark paper grain', alpha(one.c, 68, 64) > alpha(one.c, 64, 64) + 25);
  check('Overlapping paint within one stroke fills paper valleys instead of cutting fixed holes', alpha(layered.c, 64, 64) > alpha(one.c, 64, 64) + 45);
  check('Firmer pen pressure deposits more pigment through the same texture', alpha(one.c, 64, 64) > alpha(light.c, 64, 64) + 10);
  check('Flow builds toward the stroke opacity ceiling without bypassing it', alpha(limited.c, 68, 64) <= 103 && alpha(limited.c, 68, 64) >= 99);
  check('Live textured paint matches the committed pixels exactly', same(one.live, pixels(one.c)) && same(layered.live, pixels(layered.c)));
  const c = makeCanvas(128, 128), e = new RasterEngine(128, 128); e.bind(c);
  for (let i = 0; i < 2; i++) { e.begin(record(textured, [])); e.addDabs([dab]); e.commit(); }
  check('A second stroke continues building pigment on the first', alpha(c, 64, 64) > alpha(one.c, 64, 64));
  e.begin(record(textured, [])); e.addDabs([dab]); const beforeGhost = pixels(e.displaySource()).slice();
  const ghost = makeCanvas(128, 128); e.drawGhost(ctx2d(ghost), [{ ...dab, x: 88 }]);
  check('Predicted textured stamps leave the live stroke and target untouched', same(beforeGhost, pixels(e.displaySource())) && alpha(c, 88, 64) === 0); e.cancel();

  const jitter = { ...textured, size: 28, hueJitter: 0.7, sizeDyn: dyn('pressure', 0.3, 1, 0.25), taperEnd: 24 };
  const path = line(64, 0.7, 70);
  const a = makeCanvas(160, 128), b = makeCanvas(160, 128);
  paint(a, record(jitter, path), true); paint(b, record(jitter, path), true);
  check('Textured, colour-varying tapered strokes replay deterministically', same(pixels(a), pixels(b)));
  const untaperedJitter = { ...jitter, taperEnd: 0 };
  const j = makeCanvas(160, 128); const jLive = paint(j, record(untaperedJitter, path), true).live;
  check('Post-correction replay restarts colour jitter at the original seed', same(jLive, pixels(j)));

  const tapered = { ...base, size: 80, flow: 1, taperStart: 40, taperEnd: 40 };
  const tc = makeCanvas(560, 150); paint(tc, record(tapered, line(75)));
  const width = (x: number) => { let n = 0; for (let y = 0; y < tc.height; y++) if (alpha(tc, x, y) > 24) n++; return n; };
  check('Broad strokes narrow smoothly at both tips instead of ending in round caps', width(43) < 16 && width(517) < 16 && width(280) > 65);
  check('Tapered stamps do not leave paint beyond their configured endpoints', alpha(tc, 35, 75) === 0 && alpha(tc, 525, 75) === 0);
  const tap = makeCanvas(128, 128); paint(tap, record({ ...tapered, taperEnd: 0 }, [point(64, 64)]));
  check('A tap with start taper stays a visible brush mark', alpha(tap, 64, 64) > 240 && alpha(tap, 84, 64) > 200);
  const short = makeCanvas(128, 128); paint(short, record({ ...tapered, size: 100 }, [point(54, 64), point(74, 64)]));
  check('Short flicks retain fine ends without inflating a broad central blob', alpha(short, 64, 64) > 100 && alpha(short, 64, 90) === 0);
  const tilted = makeCanvas(560, 150);
  paint(tilted, record({ ...tapered, tiltShade: { ...NO_TILT_SHADE, enabled: true, size: 3 } }, line(75).map(p => ({ ...p, tiltX: 80 }))));
  check('Side shading keeps fine endpoints when tilt broadens the tip', alpha(tilted, 35, 75) === 0 && alpha(tilted, 525, 75) === 0 && alpha(tilted, 280, 75) > 0);

  const tip = makeCanvas(16, 32), tg = ctx2d(tip); tg.fillStyle = '#000'; tg.fillRect(0, 0, 16, 32); tg.fillStyle = '#fff'; tg.fillRect(6, 0, 4, 32);
  const tipImage = tip.toDataURL(); await loadTip(tipImage);
  const upright = makeCanvas(128, 128), rotated = makeCanvas(128, 128);
  paint(upright, record({ ...base, flow: 1, size: 80, tipImage }, [point(64, 64)]));
  paint(rotated, record({ ...base, flow: 1, size: 80, tipImage, angle: 90 }, [point(64, 64)]));
  check('Opaque rectangular grayscale tips retain their shape without painting black background', alpha(upright, 64, 94) > 200 && alpha(upright, 78, 64) === 0);
  check('Image-tip rotation works at full roundness', alpha(rotated, 94, 64) > 200 && alpha(rotated, 64, 94) === 0);
  const square = makeCanvas(32, 32); ctx2d(square).fillStyle = '#fff'; ctx2d(square).fillRect(0, 0, 32, 32);
  const squareImage = square.toDataURL(); await loadTip(squareImage);
  const squareCanvas = makeCanvas(128, 128), squareResult = paint(squareCanvas, record({ ...base, flow: 1, size: 80, tipImage: squareImage, angle: 45 }, [point(64, 64)]));
  check('Rotated image-tip corners are inside the committed and undoable rectangle', alpha(squareCanvas, 114, 64) > 100 && squareResult.patch!.rect.x + squareResult.patch!.rect.w > 114);
  putPixels(squareCanvas, squareResult.patch!.rect, squareResult.patch!.before);
  check('Restoring before pixels removes the entire rotated stamp', pixels(squareCanvas).every((v, i) => i % 4 !== 3 || v === 0));
  const eraser = makeCanvas(128, 128); ctx2d(eraser).fillStyle = '#cc7733'; ctx2d(eraser).fillRect(0, 0, 128, 128);
  const beforeErase = pixels(eraser).slice(); paint(eraser, record(textured, [point(64, 64)], 'eraser'));
  check('Textured erasing removes alpha while leaving untouched paint intact', alpha(eraser, 68, 64) < 255 && same(beforeErase.slice(0, 4), pixels(eraser).slice(0, 4)));

  const paintPreset = PRESETS.find(p => p.name === 'Textured Paint')!;
  swatch('Smooth tapered ink', { ...tapered, size: 46 }, t => 0.55 + Math.sin(t * Math.PI) * 0.45);
  swatch('Textured Paint · light pressure', paintPreset, 0.3);
  swatch('Textured Paint · firm pressure', paintPreset, 0.9);
  swatch('Textured Paint · two paint passes', paintPreset, 0.65, 2);

  const appCanvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
  app = new App(appCanvas, stage); app.loadProject(new Project(256, 128)); app.setWorkspace('draw'); app.setInkPaint(false);
  app.setTool('brush'); app.setPlane('fill'); app.quickShape = false; app.setBrush({ ...cloneBrush(paintPreset), size: 30, smoothing: 0 }); app.setColor('#196b84'); app.fit();
  let changes = 0; app.onDocChanged = () => { changes++; }; app.history.clear();
  const pen = (type: string, x: number, pressure: number) => { const r = appCanvas.getBoundingClientRect(), p = app!.view.docToScreen(x, 64); appCanvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'pen', button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure, clientX: r.left + p.x, clientY: r.top + p.y })); };
  pen('pointerdown', 30, 0.3); for (let x = 34; x <= 226; x += 4) pen('pointermove', x, 0.3 + Math.sin((x - 30) / 196 * Math.PI) * 0.6); pen('pointerup', 226, 0);
  const fill = app.drawing.fill!, painted = pixels(fill).slice();
  check('The new paint preset creates textured Fill pixels through real pen-style App input', painted.some((v, i) => i % 4 === 3 && v > 0) && pixels(app.drawing.line).every((v, i) => i % 4 !== 3 || v === 0) && changes === 1);
  app.undo(); await new Promise(r => setTimeout(r, 100));
  check('One Undo removes the complete textured tapered stroke', pixels(fill).every((v, i) => i % 4 !== 3 || v === 0) && !app.history.canUndo);
  app.redo(); await new Promise(r => setTimeout(r, 100));
  check('Redo restores the exact paint pixels without rerandomizing', same(painted, pixels(fill)));

  const large = makeCanvas(1280, 720), start = performance.now();
  paint(large, record({ ...cloneBrush(paintPreset), size: 90 }, line(360, 0.75, 1180)));
  const elapsed = performance.now() - start;
  check(`A long textured 720p stroke stays within the desktop test budget (${Math.round(elapsed)} ms)`, elapsed < 1500 && alpha(large, 640, 360) > 0);
} catch (err) { check(String(err), false); }
finally {
  if (app?.playing) app.togglePlay();
  keys.forEach((key, i) => { if (saved[i] === null) localStorage.removeItem(key); else localStorage.setItem(key, saved[i]!); });
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
