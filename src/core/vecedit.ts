/**
 * Vector point editing (pure): find a vector line's anchor points (its corners and main bends) and
 * move one, bending the stroke smoothly between its neighbours. Pressure and timing stay with each
 * point, so the line keeps its feel; only positions change.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Ramer–Douglas–Peucker: indices of the points that keep the line's shape within `tol` (first and last always). */
export function anchorsOf(points: Pt[], tol?: number): number[] {
  const n = points.length;
  if (n <= 2) return n ? (n === 1 ? [0] : [0, 1]) : [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const t = tol ?? Math.max(2, Math.hypot(x1 - x0, y1 - y0) * 0.04);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = points[a]!, B = points[b]!;
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    let best = -1, bestD = t;
    for (let i = a + 1; i < b; i++) {
      const P = points[i]!;
      const d = len < 1e-9 ? Math.hypot(P.x - A.x, P.y - A.y) : Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  // a closed shape (ends meet) keeps one anchor at the join, not two on top of each other
  return out;
}

/** True when the line's ends meet (a closed shape): moving the first anchor moves the last too. */
export function isClosed(points: Pt[], tol = 4): boolean {
  if (points.length < 4) return false;
  const a = points[0]!, b = points[points.length - 1]!;
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Move anchor `k` by (dx, dy). Points between the previous and next anchors follow with a smooth
 * falloff (all the way at the anchor, nothing at the neighbours), so corners stay crisp and curves
 * bend. On a closed line the first and last points are the same anchor and move together.
 */
export function moveAnchor<T extends Pt>(points: T[], anchors: number[], k: number, dx: number, dy: number): T[] {
  const n = points.length;
  const ai = anchors[k];
  if (ai === undefined || (!dx && !dy)) return points;
  const out = points.map((p) => ({ ...p }));
  const shift = (i: number, w: number) => {
    out[i]!.x += dx * w;
    out[i]!.y += dy * w;
  };
  const closed = isClosed(points) && (k === 0 || k === anchors.length - 1);
  const side = (from: number, to: number) => {
    // from the anchor (weight 1) towards a neighbour anchor (weight 0)
    const span = Math.abs(to - from);
    if (!span) return;
    const step = to > from ? 1 : -1;
    for (let j = 1; j < span; j++) shift(from + j * step, smooth(1 - j / span));
  };
  shift(ai, 1);
  const prev = anchors[k - 1];
  const next = anchors[k + 1];
  if (prev !== undefined) side(ai, prev);
  if (next !== undefined) side(ai, next);
  if (closed) {
    // the other end of the join, and its neighbour span
    const other = k === 0 ? n - 1 : 0;
    shift(other, 1);
    const nb = k === 0 ? anchors[anchors.length - 2] : anchors[1];
    if (nb !== undefined) side(other, nb);
  }
  return out;
}

/** Index of the stroke whose line passes nearest (x, y), within `r`; -1 if none. */
export function nearestStroke(strokes: { points: Pt[] }[], x: number, y: number, r: number): number {
  let best = -1, bestD = r;
  strokes.forEach((s, i) => {
    const pts = s.points;
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j]!;
      const b = pts[Math.min(pts.length - 1, j + 1)]!;
      const vx = b.x - a.x, vy = b.y - a.y;
      const l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)) : 0;
      const d = Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t));
      if (d < bestD) { bestD = d; best = i; }
    }
  });
  return best;
}
