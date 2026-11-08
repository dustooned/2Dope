import { parsePath, writePath } from './pathgeometry';
import type { StrokePoint, StrokeRecord } from './stroke';

/** Pen lines only: what automatic matching can pair. */
const pairable = (s: StrokeRecord) => s.tool === 'pen' && !s.shape && !s.clips?.length && s.points.length > 1;

const centroid = (pts: StrokePoint[]) => {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
};

/** `n` points spaced evenly along the line (width and pressure interpolated with them). */
export function resample(pts: StrokePoint[], n: number): StrokePoint[] {
  if (pts.length === n) return pts;
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = lengths[lengths.length - 1]!;
  const out: StrokePoint[] = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const at = n === 1 ? 0 : (total * i) / (n - 1);
    while (k < pts.length - 1 && lengths[k]! < at) k++;
    const a = pts[k - 1]!, b = pts[k]!, span = lengths[k]! - lengths[k - 1]!;
    const t = span > 0 ? Math.max(0, Math.min(1, (at - lengths[k - 1]!) / span)) : 0;
    const mix = (u: number, v: number) => u + (v - u) * t;
    out.push({ ...a, x: mix(a.x, b.x), y: mix(a.y, b.y), pressure: mix(a.pressure, b.pressure), w: mix(a.w ?? 1, b.w ?? 1), t: mix(a.t, b.t) });
  }
  return out;
}

type AutoPair = { from: StrokePoint[]; to: StrokePoint[] };
const autoCache = new WeakMap<StrokeRecord[], { next: StrokeRecord[]; pairs: Map<string, AutoPair> }>();

/**
 * Two separately drawn poses share no line ids. Pair their pen lines nearest-first (by centre),
 * flip a partner drawn the other way, and resample both to the same number of points.
 */
export function autoPairs(current: StrokeRecord[], next: StrokeRecord[]): Map<string, AutoPair> {
  const hit = autoCache.get(current);
  if (hit && hit.next === next) return hit.pairs;
  const pairs = new Map<string, AutoPair>();
  const free = next.filter(pairable).map(s => ({ s, c: centroid(s.points) }));
  const mine = current.filter(pairable).map(s => ({ s, c: centroid(s.points) }));
  // closest pairs first, so one stray line cannot take another's partner
  const options: { a: number; b: number; d: number }[] = [];
  mine.forEach((m, a) => free.forEach((f, b) => options.push({ a, b, d: Math.hypot(m.c.x - f.c.x, m.c.y - f.c.y) })));
  options.sort((u, v) => u.d - v.d);
  const usedA = new Set<number>(), usedB = new Set<number>();
  for (const o of options) {
    if (usedA.has(o.a) || usedB.has(o.b)) continue;
    usedA.add(o.a); usedB.add(o.b);
    const from = mine[o.a]!.s.points;
    let to = free[o.b]!.s.points;
    const d = (p: StrokePoint, q: StrokePoint) => Math.hypot(p.x - q.x, p.y - q.y);
    if (d(from[0]!, to[to.length - 1]!) + d(from[from.length - 1]!, to[0]!) < d(from[0]!, to[0]!) + d(from[from.length - 1]!, to[to.length - 1]!)) to = [...to].reverse();
    const n = Math.min(512, Math.max(from.length, to.length));
    pairs.set(mine[o.a]!.s.id, { from: resample(from, n), to: resample(to, n) });
  }
  autoCache.set(current, { next, pairs });
  return pairs;
}

/**
 * A duplicated drawing keeps stroke IDs, so correspondence stays stable as points move. Two poses
 * drawn separately (no shared IDs) are paired automatically instead.
 */
export function tweenStrokes(current: StrokeRecord[], next: StrokeRecord[], t: number): StrokeRecord[] {
  const targets = new Map(next.map(stroke => [stroke.id, stroke]));
  const mix = (a: number, b: number) => a + (b - a) * t;
  if (!current.some(stroke => targets.has(stroke.id))) {
    const pairs = autoPairs(current, next);
    return current.map(stroke => {
      const pair = pairs.get(stroke.id);
      if (!pair) return stroke;
      return { ...stroke, points: pair.from.map((point, i) => {
        const to = pair.to[i]!;
        return { ...point, x: mix(point.x, to.x), y: mix(point.y, to.y), w: mix(point.w ?? 1, to.w ?? 1) };
      }) };
    });
  }
  return current.map(stroke => {
    const end = targets.get(stroke.id);
    if (!end || end === stroke || stroke.clips?.length || end.clips?.length) return stroke;
    if (stroke.shape && end.shape) {
      const from = stroke.shape, to = end.shape;
      try {
        const a = parsePath(from.path), b = parsePath(to.path);
        if (a.length !== b.length || a.some((node, i) => node.cmd !== b[i]!.cmd)) return stroke;
        const path = writePath(a.map((node, i) => ({
          cmd: node.cmd,
          values: node.values.map((v, j) => node.cmd === 'A' && (j === 3 || j === 4) ? v : mix(v, b[i]!.values[j]!)),
        })));
        return { ...stroke, shape: { ...from, path, width: mix(from.width, to.width), matrix: [
          mix(from.matrix[0], to.matrix[0]), mix(from.matrix[1], to.matrix[1]), mix(from.matrix[2], to.matrix[2]),
          mix(from.matrix[3], to.matrix[3]), mix(from.matrix[4], to.matrix[4]), mix(from.matrix[5], to.matrix[5]),
        ] } };
      } catch {
        return stroke;
      }
    }
    if (stroke.shape || end.shape || stroke.tool !== 'pen' || end.tool !== 'pen' || stroke.points.length !== end.points.length) return stroke;
    return { ...stroke, points: stroke.points.map((point, i) => {
      const to = end.points[i]!;
      return { ...point, x: mix(point.x, to.x), y: mix(point.y, to.y), w: mix(point.w ?? 1, to.w ?? 1) };
    }) };
  });
}
