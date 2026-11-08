import { ellipse, inside, mergedOutline } from './tails.mjs';
let seed = Number(process.env.SEED ?? 5);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), range = (a, b) => a + (b - a) * rnd();
const blob = (cx, cy, R) => { const k = Math.round(range(2, 4)), a = range(0.12, 0.28), ph = range(0, 6); return Array.from({ length: 160 }, (_, i) => { const t = (i / 160) * Math.PI * 2, r = R * (1 + a * Math.sin(k * t + ph)); return { x: cx + r * Math.cos(t) * 1.3, y: cy + r * Math.sin(t) }; }); };
const area = p => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q.x * r.y - r.x * q.y; }, 0)) / 2;
const selfCross = p => { const n = p.length, X = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (X(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true; } return false; };
const N = 1000, stats = { ellipse: { ok: 0, fallback: 0, bad: 0 }, blob: { ok: 0, fallback: 0, bad: 0 } };
for (const kind of ['ellipse', 'blob']) for (let i = 0; i < N; i++) {
  const R = range(60, 140), poly = kind === 'ellipse' ? ellipse(0, 0, R * range(1.1, 1.6), R) : blob(0, 0, R);
  const ang = range(0, Math.PI * 2), dist = R * range(1.3, 2.6), tip = { x: Math.cos(ang) * dist * 1.3, y: Math.sin(ang) * dist };
  const bend = rnd() < 0.5 ? null : { x: tip.x * 0.6 + range(-R, R) * 0.5, y: tip.y * 0.6 + range(-R, R) * 0.5 };
  const width = R * range(0.25, 0.5);
  const m = mergedOutline(poly, { tip, bend, width });
  if (!m) { stats[kind].fallback++; continue; }
  const o = m.outline, good = !selfCross(o) && area(o) > area(poly) && poly.filter((_, k) => k % 8 === 0).every(q => inside(o, { x: q.x * 0.97, y: q.y * 0.97 })) && Math.hypot(m.tip.x - tip.x, m.tip.y - tip.y) < 1e-6;
  stats[kind][good ? 'ok' : 'bad']++;
}
for (const [k, v] of Object.entries(stats)) console.log(`${k.padEnd(8)} merged ok ${v.ok}, fell back to seam ${v.fallback}, broken ${v.bad} (of ${N})`);
