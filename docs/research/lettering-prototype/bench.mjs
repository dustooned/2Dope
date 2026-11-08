// Draw each balloon kind sloppily, many times, and see what the classifier says.
import { classify } from './classify.mjs';

let seed = Number(process.env.SEED ?? 12345);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const range = (a, b) => a + (b - a) * rnd();
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3; };

/** Turn a clean outline r(θ) into a hand-drawn stroke: wobble, jitter, rotation, aspect, closure error, uneven speed. */
function draw(radius, opts = {}) {
  const R = range(60, 200), aspect = opts.aspect ?? range(1, 1.9), rot = range(0, Math.PI);
  const wob = [1, 2, 3].map(k => ({ k, a: range(0, opts.wobble ?? 0.04) / k, ph: range(0, 6.3) }));
  const jit = R * (opts.jitter ?? range(0.004, 0.015));
  const close = range(-0.04, opts.gap ?? 0.07); // negative = overshoot past the start
  const start = range(0, Math.PI * 2), sweep = Math.PI * 2 * (1 - close);
  const pts = [];
  let t = 0;
  while (t < 1) {
    const th = start + sweep * t;
    let r = radius(th - start) * R;
    for (const w of wob) r *= 1 + w.a * Math.sin(w.k * th + w.ph);
    let x = Math.cos(th) * r * aspect, y = Math.sin(th) * r;
    [x, y] = [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
    pts.push({ x: x + gauss() * jit, y: y + gauss() * jit });
    t += range(0.002, 0.012); // uneven pen speed
  }
  return pts;
}

const shapes = {
  speech: () => draw(() => 1),
  box: () => {
    const k = range(6, 14); // superellipse: a hand-drawn box with soft corners
    return draw(th => { const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)); return 1 / Math.pow(Math.pow(c, k) + Math.pow(s, k), 1 / k); }, { wobble: 0.02 });
  },
  cloud: () => {
    const n = Math.round(range(6, 13)), a = range(0.12, 0.25);
    return draw(th => 1 + a * Math.pow(Math.abs(Math.sin((n * th) / 2)), 0.55), { aspect: range(1, 1.6) });
  },
  burst: () => {
    const n = Math.round(range(7, 16)), inner = range(0.5, 0.72), jag = range(0, 0.12);
    const radii = Array.from({ length: n * 2 }, (_, i) => (i % 2 ? inner : 1) * (1 + range(-jag, jag)));
    return draw(th => {
      const u = ((th / (Math.PI * 2)) * n * 2) % (n * 2), i = Math.floor(u), f = u - i;
      return radii[i % (n * 2)] * (1 - f) + radii[(i + 1) % (n * 2)] * f;
    }, { aspect: range(1, 1.5), wobble: 0.02 });
  },
  custom: () => {
    // a lumpy free shape: a bean, a heart-ish blob, a wide lozenge
    const k1 = Math.round(range(2, 4)), a1 = range(0.18, 0.32), ph = range(0, 6);
    return draw(th => 1 + a1 * Math.sin(k1 * th + ph) + 0.08 * Math.sin((k1 + 1) * th), { wobble: 0.02 });
  },
  open: () => {
    const pts = draw(() => 1, { gap: 0.4 });
    return pts.slice(0, Math.floor(pts.length * range(0.4, 0.75)));
  },
};

const kinds = Object.keys(shapes), N = 300, table = {};
for (const k of kinds) {
  table[k] = Object.fromEntries(kinds.map(x => [x, 0]));
  for (let i = 0; i < N; i++) table[k][classify(shapes[k]()).kind]++;
}
const pad = (s, n = 8) => String(s).padEnd(n);
console.log(pad('drawn \\ got', 12) + kinds.map(k => pad(k)).join('') + 'correct');
for (const k of kinds) console.log(pad(k, 12) + kinds.map(x => pad(table[k][x])).join('') + `${((table[k][k] / N) * 100).toFixed(1)}%`);
const total = kinds.reduce((s, k) => s + table[k][k], 0);
console.log(`overall ${((total / (N * kinds.length)) * 100).toFixed(1)}%`);
export { shapes };
