/**
 * Rail performance: a 1,000-frame shot with 8 drawing tracks and real thumbnails in the Animate
 * flipbook strip. Measures building the strip and each zoom step (layout included), and checks
 * the strip still shows every drawing in the right place after zooming. Run with CPU throttling
 * for an iPad-like number; the limits here are for an unthrottled desktop.
 */
import { App } from '../app';
import { drawingsLayer } from '../core/comp';
import { FlipMode } from './flipmode';

const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), flip = new FlipMode(app, stage);
let passed = 0, failed = 0;
window.addEventListener('unhandledrejection', (e) => { failed++; document.querySelector('#summary')!.textContent = `Error: ${String(e.reason)}`; });
const row = (text: string) => { const li = document.createElement('li'); li.textContent = text; document.querySelector('#results')!.append(li); };
const check = (name: string, ok: boolean | string) => { if (ok === true) { passed++; row(`PASS: ${name}`); } else { failed++; row(`FAIL: ${name}${ok === false ? '' : `: ${ok}`}`); } };
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

// the shot: 1,000 frames, 8 tracks, a drawing every 2 frames (4,000 drawings), each with a thumbnail
const p = app.project, FRAMES = 1000, TRACKS = 8, HOLD = 2;
const comp = p.comp;
comp.layers.length = 0;
for (let t = 0; t < TRACKS; t++) {
  const ex = [];
  for (let f = 0; f < FRAMES; f += HOLD) {
    const d = p.newDrawing();
    // the strip only reads thumbnails: keep 4,000 drawings from holding full-size canvases
    d.line.width = 1; d.line.height = 1;
    const th = document.createElement('canvas');
    th.width = 32; th.height = 18;
    const g = th.getContext('2d')!;
    g.fillStyle = `hsl(${(t * 45 + f) % 360} 70% 50%)`;
    g.fillRect(4, 4, 24, 10);
    d.thumb = th;
    ex.push({ drawing: d.id, length: HOLD });
  }
  comp.layers.push(drawingsLayer(p.newId('L'), `Track ${t + 1}`, ex, p.width, p.height));
}
comp.duration = FRAMES;
app.setWorkspace('animate');
flip.set(true);
await frame();

// includes style and layout: reading a size forces both before the clock stops
const time = (fn: () => void) => { const t = performance.now(); fn(); void document.body.offsetHeight; return performance.now() - t; };
const build = time(() => { (flip as unknown as { sig: string }).sig = ''; flip.update(); });
row(`Measured: build ${FRAMES} frames × ${TRACKS} tracks: ${build.toFixed(0)} ms`);
// a pinch: about 10% wider or narrower per step, out and back (12 → 30 px per frame and back)
const steps: number[] = [];
let zoom = 12;
for (let i = 0; i < 20; i++) { zoom = i < 10 ? zoom * 1.1 : zoom / 1.1; steps.push(time(() => flip.zoomTo(zoom, 500))); }
// the worst case: a jump between far zooms (Alt+0 or a fast double pinch)
const jumps: number[] = [];
for (let i = 0; i < 6; i++) jumps.push(time(() => flip.zoomTo(i % 2 ? 30 : 12, 500)));
jumps.sort((a, b) => a - b);
row(`Measured: zoom jump 12 ↔ 30 px median ${jumps[3]!.toFixed(1)} ms`);
steps.sort((a, b) => a - b);
{ const f = flip as unknown as { relayout(): void; update(): void; cell: number };
  const parts = { relayout: 0, update: 0 };
  for (let i = 0; i < 6; i++) { f.cell = i % 2 ? 30 : 12; parts.relayout += time(() => f.relayout()); parts.update += time(() => f.update()); }
  row(`Measured: per zoom, relayout ${(parts.relayout / 6).toFixed(1)} ms, update ${(parts.update / 6).toFixed(1)} ms`); }
row(`Measured: pinch zoom step median ${steps[10]!.toFixed(1)} ms, worst ${steps.at(-1)!.toFixed(1)} ms (60 fps needs < 16 ms)`);
const cells = () => [...document.querySelectorAll<HTMLElement>('.flip-cel')];
const scroller = document.querySelector<HTMLElement>('.flip-scroll')!;
scroller.scrollLeft = 500 * 30 - 200; (flip as unknown as { renderWindow(force?: boolean): void }).renderWindow(true);
const cel = cells().find((c) => c.dataset.start === '500');
const left = cel ? cel.getBoundingClientRect().left - cel.parentElement!.getBoundingClientRect().left : NaN;
check('After zooming, a drawing sits at its frame (left = start × cell)', Math.abs(left - 500 * 30) < 1 || `left ${left}`);
// Before the strip was virtual a zoom step took ~840 ms here, then ~70 ms.
check('Only the cels near the visible frames exist (the strip is virtual)', cells().length < 600 || `${cells().length} cels`);
// 60 fps needs < 16 ms; headless software rendering varies run to run (14–20 ms here), so the hard
// check is a regression guard: a rebuilt strip took ~840 ms, an unvirtualized one ~70 ms.
check('A pinch zoom step stays under 30 ms on this machine', steps[10]! < 30 || `median ${steps[10]!.toFixed(1)} ms`);
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
