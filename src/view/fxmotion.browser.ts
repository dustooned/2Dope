/** Real-pixel checks for Glitch, RGB split, Camera shake, Long shadow, Duotone and Wipe. */
import { LINEAR } from '../core/anim';
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

// ---- expanded settings of the earlier effects -------------------------------------------------
/** A square of one colour (x 40..59, y 10..29) with an effect. */
let rev = 0;
const rigC = (type: EffectType, amount: number, params: Record<string, number | string | boolean> = {}, fill = '#ffffff', size = 0) => {
  const r = rig(type, amount, params, size);
  const d = r.p.drawing(r.p.layer.exposures[0]!.drawing), g = d.line.getContext('2d')!;
  g.clearRect(0, 0, W, H); g.fillStyle = fill; g.fillRect(40, 10, 20, 20);
  d.rev += 1000 + (rev += 1); // the drawing changed: effect results cached for the earlier paint no longer apply
  return r;
};
check('Threshold keeps black and white by default and takes new colours', () => {
  const bw = px(render(rigC('threshold', 128, {}, '#ffffff')), 50), dk = px(render(rigC('threshold', 128, {}, '#202020')), 50);
  ok(bw.slice(0, 3).every((v) => v === 255) && dk.slice(0, 3).every((v) => v === 0), [bw, dk]);
  const c = px(render(rigC('threshold', 128, { dark: '#ff0000', light: '#00ff00' }, '#202020')), 50);
  ok(c[0] === 255 && c[1] === 0, c);
});
check('Threshold soft edge blends between the two colours near the level', () => {
  const mid = px(render(rigC('threshold', 128, { softness: 100 }, '#808080')), 50);
  ok(mid[0]! > 40 && mid[0]! < 215, mid);
});
check('Find edges can draw lines only, in a colour', () => {
  const r = rigC('edges', 0, { clear: true, color: '#ff0000' }, '#000000');
  const c = render(r), edge = px(c, 40, 20), inner = px(c, 50, 20);
  ok(edge[3]! > 150 && edge[0] === 255 && inner[3] === 0, [edge, inner]);
});
check('Find edges line width reaches further from the edge', () => {
  const thin = px(render(rigC('edges', 0, { clear: true, width: 1 }, '#000000')), 43)[3]!, wide = px(render(rigC('edges', 0, { clear: true, width: 4 }, '#000000')), 43)[3]!;
  ok(wide > thin, [thin, wide]);
});
check('Vignette darkens towards a chosen colour', () => {
  const r = rigC('vignette', 100, { color: '#ff0000', softness: 100 }, '#ffffff', 10);
  const c = render(r), edge = px(c, 41, 11);
  ok(edge[0]! > edge[1]! + 40, edge);
});
check('Glow can be tinted a colour', () => {
  const plain = px(render(rigC('glow', 6, { composite: 'none', threshold: 0 }, '#ffffff')), 38), tinted = px(render(rigC('glow', 6, { composite: 'none', threshold: 0, tint: 100, tintColor: '#ff0000' }, '#ffffff')), 38);
  ok(plain[3]! > 0 && plain[1]! > 200 && tinted[3]! > 0 && tinted[0]! > 200 && tinted[1]! < 40, [plain, tinted]);
});
check('Film grain can add light and dark specks instead of rubbing the paint out', () => {
  const c = render(rigC('grain', 100, { look: 'speckle', mono: true }, '#808080', 1));
  const d = c.getContext('2d')!.getImageData(40, 10, 20, 20).data; const seen = new Set<number>();
  for (let i = 0; i < d.length; i += 4) { ok(d[i + 3] === 255); seen.add(d[i]!); }
  ok(seen.size > 6, seen.size);
  ok(px(render(rigC('grain', 100, {}, '#808080', 1)), 50)[3]! <= 255);
});
/** The painted box [x0, y0, x1, y1] of a render. */
const box = (c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
check('Boil and Ripple can wobble one way only', () => {
  const sideways = box(render(rigC('turbulence', 12, { direction: 'horizontal' }, '#ffffff', 30)));
  ok(sideways[1] === 10 && sideways[3] === 29 && (sideways[0]! < 40 || sideways[2]! > 59), sideways);
  const vertical = box(render(rigC('turbulence', 12, { direction: 'vertical' }, '#ffffff', 30)));
  ok(vertical[0] === 40 && vertical[2] === 59 && (vertical[1]! < 10 || vertical[3]! > 29), vertical);
  const both = box(render(rigC('turbulence', 12, { direction: 'both' }, '#ffffff', 30)));
  ok(both[0]! < 40 && both[1]! < 10 || both[2]! > 59 || both[3]! > 29, both);
});
check('A tinted echo paints its trail in the tint colour, behind the art', () => {
  const r = rig('echo', 80, { spacing: 2, tint: 100, tintColor: '#4aa3ff' }, 3);
  const pos = r.p.layer.transform.position, [bx, by] = pos.value as [number, number];
  pos.keys = [{ f: 0, v: [bx, by], in: LINEAR, out: LINEAR }, { f: 10, v: [bx + 30, by], in: LINEAR, out: LINEAR }];
  const c = render(r, 10), trail = px(c, 60), art = px(c, 80);
  ok(trail[3]! > 0 && trail[2]! > trail[0]! + 60 && art[0]! > 240 && art[1]! > 240, [trail, art]);
});

document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
