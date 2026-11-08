// Prototype: balloon tails. A tail is a tapered wedge along a (possibly curved) centreline from the
// balloon to a tip. "Merged" (open) joins it into the balloon outline with no line across the base;
// "seam" (closed) draws it as its own closed shape over the balloon; "bubbles" (thought) is a row of
// shrinking circles; "lightning" (radio, phone) zigzags.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = a => Math.hypot(a.x, a.y);
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

export function ellipse(cx, cy, rx, ry, n = 160) {
  return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }; });
}

export function inside(poly, p) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function centroid(poly) { return mul(poly.reduce((s, p) => add(s, p), { x: 0, y: 0 }), 1 / poly.length); }

/** Where a ray from the centre towards `toward` leaves the outline (the tail's base). */
function exitPoint(poly, toward) {
  const c = centroid(poly), d = norm(sub(toward, c));
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], hit = segRay(c, d, a, b);
    if (hit !== null && (!best || hit.t > best.t)) best = { ...hit, i };
  }
  return best ? add(c, mul(d, best.t)) : toward;
}
function segRay(o, d, a, b) {
  const e = sub(b, a), den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(a, o), t = (w.x * e.y - w.y * e.x) / den, u = (w.x * d.y - w.y * d.x) / den;
  return t > 0 && u >= 0 && u <= 1 ? { t } : null;
}

/** Centreline from the base (started inside the balloon so the join is clean) through a bend to the tip. */
function centreline(poly, tip, bend, n = 40) {
  const base = exitPoint(poly, bend ?? tip), c = centroid(poly);
  const start = add(base, mul(norm(sub(c, base)), Math.min(len(sub(c, base)) * 0.5, 30)));
  const ctrl = bend ?? mul(add(base, tip), 0.5);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return { x: u * u * start.x + 2 * u * t * ctrl.x + t * t * tip.x, y: u * u * start.y + 2 * u * t * ctrl.y + t * t * tip.y };
  });
}

/** The two sides of a tapered wedge along a centreline (full width at the start, a point at the tip). */
function wedge(line, width) {
  const L = [], R = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], t = norm(sub(b, a)), nrm = { x: -t.y, y: t.x };
    const w = (width / 2) * (1 - i / (line.length - 1));
    L.push(add(p, mul(nrm, w))); R.push(add(p, mul(nrm, -w)));
  });
  return { L, R };
}

function crossing(p1, p2, poly) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], r = sub(p2, p1), s = sub(b, a), den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, p1), t = (w.x * s.y - w.y * s.x) / den, u = (w.x * r.y - w.y * r.x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { i, u, p: add(p1, mul(r, t)), seg: null };
  }
  return null;
}

/** First place a side (walking out from the base) leaves the balloon. */
function sideExit(side, poly) {
  for (let k = 1; k < side.length; k++) {
    if (inside(poly, side[k - 1]) && !inside(poly, side[k])) { const c = crossing(side[k - 1], side[k], poly); if (c) return { ...c, k }; }
  }
  return null;
}

/**
 * The merged outline: walk the balloon to where one side of the tail leaves it, out along that
 * side to the tip, back along the other side, then on round the balloon. Returns null when the tail
 * does not cleanly cross the outline once per side (the caller falls back to a seam).
 */
export function mergedOutline(poly, tail) {
  const { L, R } = wedge(centreline(poly, tail.tip, tail.bend), tail.width);
  const a = sideExit(L, poly), b = sideExit(R, poly);
  if (!a || !b) return null;
  // both sides must leave the balloon only once (a tail that wraps back in is not merged)
  const reenters = side => side.some((p, k) => k > 0 && !inside(poly, side[k - 1]) && inside(poly, p));
  if (reenters(L) || reenters(R)) return null;
  const outL = [a.p, ...L.slice(a.k)], outR = [b.p, ...R.slice(b.k)];
  const tip = outL[outL.length - 1];
  // order: balloon from just after b's segment round to a's segment, then out L to the tip, back R
  const n = poly.length, out = [];
  const forward = (from, to) => { const pts = []; for (let i = (from + 1) % n; ; i = (i + 1) % n) { pts.push(poly[i]); if (i === to) break; } return pts; };
  // decide direction: the stretch of outline between the crossings that does NOT lie under the tail
  const keep1 = forward(b.i, a.i), keep2 = forward(a.i, b.i);
  const underTail = pts => pts.some(p => inside([...outL, ...[...outR].reverse()], p));
  const keep = keep1.length >= keep2.length && !underTail(keep1) ? keep1 : underTail(keep2) ? keep1 : keep2;
  if (keep === keep1) out.push(b.p, ...keep1, ...outL, ...[...outR].reverse().slice(1));
  else out.push(a.p, ...keep2, ...outR, ...[...outL].reverse().slice(1));
  return { outline: out, tip };
}

/** A closed tail shape drawn over the balloon, with its own ink (the "seam" look). */
export function seamTail(poly, tail) {
  const { L, R } = wedge(centreline(poly, tail.tip, tail.bend), tail.width);
  // start a little inside the edge (just enough to overlap the ink), not at the deep inner base
  const first = side => Math.max(0, side.findIndex(p => !inside(poly, p)) - 1);
  const k = Math.min(first(L), first(R));
  return [...L.slice(k), ...[...R.slice(k)].reverse()];
}

/** Thought tail: shrinking circles from the balloon edge to the tip. */
export function bubbleTail(poly, tail, count = 3) {
  const line = centreline(poly, tail.tip, tail.bend, 60), out = [];
  const firstOutside = line.findIndex(p => !inside(poly, p));
  const from = Math.max(0, firstOutside);
  for (let k = 0; k < count; k++) {
    const t = (k + 0.6) / count, p = line[Math.round(from + (line.length - 1 - from) * t)], r = (tail.width / 2) * (1 - k / count) * 0.75;
    out.push({ ...p, r: Math.max(2, r) });
  }
  return out;
}

/** Radio/phone tail: a zigzag from the balloon edge to the tip, drawn as a line with the balloon's ink. */
export function lightningTail(poly, tail, zigs = 3) {
  const base = exitPoint(poly, tail.tip), d = sub(tail.tip, base), dir = norm(d), nrm = { x: -dir.y, y: dir.x }, amp = tail.width * 0.8;
  return Array.from({ length: zigs * 2 + 1 }, (_, i) => { const t = i / (zigs * 2), p = add(base, mul(d, t)); return i === 0 || i === zigs * 2 ? p : add(p, mul(nrm, i % 2 ? amp : -amp)); });
}
