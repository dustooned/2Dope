/** Real-pixel checks for Glitch, RGB split, Camera shake, Long shadow, Duotone and Wipe. */
import { newEffect, type EffectType } from '../core/effects';
import { Project } from '../core/project';
import { drawComp, releaseScratch } from './composite';

const W = 100, H = 40;
/** A white square (x 40..59, y 10..29) on the Line plane with one effect on the layer. */
const rig = (type: EffectType, amount: number, params: Record<string, number | string | boolean> = {}, size = 0, seed = 7) => {
  const p = new Project(W, H);
  const l = p.layer, d = p.drawing(l.exposures[0]!.drawing);
  const g = d.line.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(40, 10, 20, 20);
  const e = newEffect(type, 'fx1', seed);
  e.amount = amount; if (size) e.size = size; e.params = params;
  l.effects = [e]; l.play = 'loop'; l.out = null; p.comp.duration = 48;
  return { p };
};
const render = (r: ReturnType<typeof rig>, frame = 0) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  drawComp(c.getContext('2d')!, r.p, r.p.comp, frame, { export: true });
  document.querySelector('#shots')!.append(c);
  return c;
};
const px = (c: HTMLCanvasElement, x: number, y = 20) => [...c.getContext('2d')!.getImageData(x, y, 1, 1).data];
const centroid = (c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, W, H).data; let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = d[(y * W + x) * 4 + 3]!; sx += x * a; sy += y * a; n += a; }
  return n ? [sx / n, sy / n] : [NaN, NaN];
};
let passed = 0, failed = 0;
const check = (name: string, run: () => void) => {
  const li = document.createElement('li');
  try { run(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${String(e)}`; }
  document.querySelector('#results')!.append(li);
  releaseScratch();
};
const ok = (v: boolean, info: unknown = '') => { if (!v) throw new Error(JSON.stringify(info)); };

check('RGB split leaves red on the far side and green-blue on the near side', () => {
  const c = render(rig('rgbsplit', 6, { angle: 0 }));
  const a = px(c, 43), b = px(c, 62), mid = px(c, 50);
  ok(a[0] === 0 && a[1]! > 200 && a[2]! > 200 && b[0]! > 200 && b[1] === 0 && b[2] === 0 && mid.slice(0, 3).every((v) => v > 200), [a, b, mid]);
});
check('RGB split of 0 changes nothing', () => { const c = render(rig('rgbsplit', 0)); ok(px(c, 43)[3]! > 200 && px(c, 38)[3] === 0); });
check('Glitch slides a band sideways and is the same on the same frame', () => {
  const a = render(rig('glitch', 20, { chance: 100, split: 0 }, 100)), b = render(rig('glitch', 20, { chance: 100, split: 0 }, 100));
  const moved = centroid(a)[0]! !== 50 && Math.abs(centroid(a)[0]! - 49.5) > 0.5;
  ok(moved, centroid(a)); ok(centroid(a)[0] === centroid(b)[0]);
});
check('Glitch with no slide, no chance and no split changes nothing', () => { const c = render(rig('glitch', 0, { chance: 0, split: 0 })); ok(Math.abs(centroid(c)[0]! - 49.5) < 0.01, centroid(c)); });
check('Glitch changes between ticks', () => {
  const r = rig('glitch', 25, { chance: 100, split: 0 }, 100);
  const xs = [0, 2, 4, 6, 8].map((f) => Math.round(centroid(render(r, f))[0]! * 10));
  ok(new Set(xs).size > 1, xs);
});
check('Camera shake moves the layer, and not at Strength 0', () => {
  const r = rig('shake', 12), xs = [0, 1, 2, 3, 4, 5].map((f) => centroid(render(r, f)));
  ok(xs.some(([x, y]) => Math.abs(x! - 49.5) > 1 || Math.abs(y! - 19.5) > 1), xs);
  const z = centroid(render(rig('shake', 0)));
  ok(Math.abs(z[0]! - 49.5) < 0.01 && Math.abs(z[1]! - 19.5) < 0.01, z);
});
check('Camera shake stays within its strength', () => {
  const r = rig('shake', 6);
  for (let f = 0; f < 12; f++) { const [x, y] = centroid(render(r, f)); ok(Math.abs(x! - 49.5) <= 6.6 && Math.abs(y! - 19.5) <= 6.6, [f, x, y]); }
});
check('Long shadow stretches away along its direction, behind the art', () => {
  const c = render(rig('longshadow', 30, { angle: 90, opacity: 100 }));
  ok(px(c, 75)[3]! > 200 && px(c, 30)[3] === 0 && px(c, 50).slice(0, 3).every((v) => v > 250) && px(c, 90)[3] === 0, [px(c, 75), px(c, 30)]);
});
check('Duotone maps white to the light colour and mix 0 leaves it', () => {
  const c = render(rig('duotone', 100)), o = px(c, 50);
  ok(Math.abs(o[0]! - 255) < 3 && Math.abs(o[1]! - 211) < 3 && Math.abs(o[2]! - 110) < 3, o);
  ok(render(rig('duotone', 0)) && px(render(rig('duotone', 0)), 50).slice(0, 3).every((v) => v > 250));
});
check('Wipe hides the first half at 50% and nothing at 0%, all at 100%', () => {
  const half = render(rig('wipe', 50, { style: 'line', angle: 90 }));
  ok(px(half, 45)[3] === 0 && px(half, 55)[3]! > 200, [px(half, 45), px(half, 55)]);
  ok(px(render(rig('wipe', 0)), 45)[3]! > 200);
  ok(px(render(rig('wipe', 100)), 55)[3] === 0);
});
check('Clock wipe and Iris wipe clear the page at 100%', () => {
  for (const style of ['clock', 'iris']) ok(px(render(rig('wipe', 100, { style })), 50)[3] === 0 && px(render(rig('wipe', 0, { style })), 50)[3]! > 200, style);
});
check('Iris wipe closes towards the middle', () => {
  const c = render(rig('wipe', 90, { style: 'iris' }));
  ok(px(c, 50)[3]! > 200 && px(c, 41, 11)[3] === 0, [px(c, 50), px(c, 41, 11)]);
});

document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
