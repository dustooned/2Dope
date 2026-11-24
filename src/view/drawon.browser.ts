/** Real-pixel checks for the Draw on effect: a vector line cut to a piece, drawn on over time, travelling and tapered. */
import { cloneBrush, PRESETS } from '../core/brush';
import { newEffect } from '../core/effects';
import { Project } from '../core/project';
import type { StrokeRecord } from '../core/stroke';
import { drawComp, releaseScratch } from './composite';

const W = 100, H = 40;
const rig = (params: Record<string, number | string | boolean>, end: number, start = 0) => {
  const p = new Project(W, H);
  const l = p.layer, d = p.drawing(l.exposures[0]!.drawing);
  const brush = cloneBrush(PRESETS[0]!); brush.size = 8; brush.opacity = 1; brush.taperStart = 0; brush.taperEnd = 0;
  const rec: StrokeRecord = { id: 'v', tool: 'pen', brush, color: '#000000', seed: 1,
    points: Array.from({ length: 91 }, (_, i) => ({ x: 5 + i, y: 20, pressure: 1, tiltX: 0, tiltY: 0, t: i })) };
  d.vectors = [rec];
  const e = newEffect('drawon', 'fx1', 1);
  e.amount = end; e.size = start; e.params = { travel: 0, taper: 0, loop: false, offset: 0, mode: 'each', ...params };
  l.effects = [e]; l.play = 'loop'; l.out = null; p.comp.duration = 48;
  return { p, l, e };
};
const render = (r: ReturnType<typeof rig>, frame = 0) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  drawComp(c.getContext('2d')!, r.p, r.p.comp, frame, { export: true });
  document.querySelector('#shots')!.append(c);
  return c;
};
const alpha = (c: HTMLCanvasElement, x: number, y = 20) => c.getContext('2d')!.getImageData(x, y, 1, 1).data[3]!;
let passed = 0, failed = 0;
const check = (name: string, run: () => void) => {
  const li = document.createElement('li');
  try { run(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${String(e)}`; }
  document.querySelector('#results')!.append(li);
  releaseScratch();
};
const expectTrue = (ok: boolean, info: unknown = '') => { if (!ok) throw new Error(JSON.stringify(info)); };

check('End 100% shows the whole line', () => { const c = render(rig({}, 100)); expectTrue(alpha(c, 10) > 200 && alpha(c, 90) > 200); });
check('End 50% shows only the first half', () => { const c = render(rig({}, 50)); expectTrue(alpha(c, 20) > 200 && alpha(c, 80) === 0, [alpha(c, 20), alpha(c, 80)]); });
check('Start 50% End 100% shows only the second half', () => { const c = render(rig({}, 100, 50)); expectTrue(alpha(c, 20) === 0 && alpha(c, 80) > 200); });
check('Offset slides the piece along the path', () => { const c = render(rig({ offset: 50 }, 30)); expectTrue(alpha(c, 20) === 0 && alpha(c, 62) > 200, [alpha(c, 20), alpha(c, 62)]); });
check('Travel moves the piece between frames', () => {
  const r = rig({ travel: 100 }, 20);
  const half = Math.round(r.p.comp.fps / 2), a = render(r, 0), b = render(r, half); // half a second = 50%
  expectTrue(alpha(a, 15) > 200 && alpha(a, 55) === 0 && alpha(b, 15) === 0 && alpha(b, 58) > 200, [alpha(a, 15), alpha(b, 58)]);
});
check('Loop wraps the piece round to the start', () => {
  const c = render(rig({ offset: 90, loop: true }, 30));
  expectTrue(alpha(c, 10) > 200 && alpha(c, 92) > 200 && alpha(c, 50) === 0, [alpha(c, 10), alpha(c, 92), alpha(c, 50)]);
});
check('Tapered ends narrow the cut end to a point', () => {
  const c = render(rig({ taper: 30 }, 60));
  const thick = [18, 20, 22].filter((y) => alpha(c, 30, y) > 100).length, tip = [18, 20, 22].filter((y) => alpha(c, 58, y) > 100).length;
  expectTrue(thick >= 2 && tip < thick, [thick, tip]);
});
check('The drawing itself is not changed', () => { const r = rig({}, 20); render(r); expectTrue(r.p.drawing(r.l.exposures[0]!.drawing).vectors.length === 1 && r.p.drawing(r.l.exposures[0]!.drawing).vectors[0]!.points.length === 91); });

document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
