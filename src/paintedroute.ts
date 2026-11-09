/**
 * A route from a painted line (a brush stroke, not a Vector line), so "tap a line" and the pick
 * whip can animate along lines drawn any way. The painted pixels are reduced to a grid; the route
 * is the longest path through it (one end of the line to the other, through its middle). Only
 * line-like paint counts: a thick shape (a character) is not a route.
 */
import type { Vec2 } from './core/anim';
import type { Drawing } from './core/project';

const routes = new Map<string, Vec2[] | null>();

/** Is anything painted within `reach` (drawing page units) of a point of this drawing? */
export function paintedNear(d: Drawing, x: number, y: number, reach: number): boolean {
  const r = Math.max(1, Math.round(reach)), x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const w = Math.min(d.line.width, Math.round(x + r)) - x0, h = Math.min(d.line.height, Math.round(y + r)) - y0;
  if (w <= 0 || h <= 0) return false;
  for (const c of [d.line, d.fill]) {
    if (!c) continue;
    const px = c.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, w, h).data;
    for (let i = 3; i < px.length; i += 4) if (px[i]! > 40) return true;
  }
  return false;
}

/** The route along a drawing's painted line (page units), or null when it is not line-like. */
export function paintedRoute(d: Drawing): Vec2[] | null {
  const key = `${d.id}:${d.rev}`;
  if (routes.has(key)) return routes.get(key)!;
  const W = d.line.width, H = d.line.height, s = Math.min(1, 320 / Math.max(W, H)), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.scale(s, s);
  if (d.fill) g.drawImage(d.fill, 0, 0);
  g.drawImage(d.line, 0, 0);
  const px = g.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = px[i * 4 + 3]! > 40 ? 1 : 0;
  const route = longestPath(on, w, h);
  const out = route ? route.map(([x, y]) => [x / s, y / s] as Vec2) : null;
  if (routes.size > 40) routes.delete(routes.keys().next().value!);
  routes.set(key, out);
  return out;
}

/**
 * The longest path through the biggest painted region (8-connected), in grid cells: from the cell
 * farthest from anywhere to the cell farthest from it. Null when the region is not line-like (its
 * area is more than a sixth of a square of its length, i.e. it is thick).
 */
export function longestPath(on: Uint8Array, w: number, h: number): Vec2[] | null {
  const seen = new Int32Array(w * h).fill(-1);
  let bestStart = -1, bestSize = 0, id = 0;
  const q: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!on[s] || seen[s] !== -1) continue;
    let size = 0; seen[s] = id; q.length = 0; q.push(s);
    for (let k = 0; k < q.length; k++) { size++; for (const n of around(q[k]!, w, h)) if (on[n] && seen[n] === -1) { seen[n] = id; q.push(n); } }
    if (size > bestSize) { bestSize = size; bestStart = s; }
    id++;
  }
  if (bestStart < 0 || bestSize < 4) return null;
  const region = seen[bestStart]!;
  const bfs = (from: number) => {
    const dist = new Int32Array(w * h).fill(-1), parent = new Int32Array(w * h).fill(-1), order = [from];
    dist[from] = 0;
    for (let k = 0; k < order.length; k++) { const c = order[k]!; for (const n of around(c, w, h)) if (seen[n] === region && dist[n] === -1) { dist[n] = dist[c]! + 1; parent[n] = c; order.push(n); } }
    const far = order[order.length - 1]!;
    return { far, parent, len: dist[far]! };
  };
  const a = bfs(bestStart).far, { far: b, parent, len } = bfs(a);
  // line-like: a long, thin region (a character or filled shape is not a route)
  if (len < 6 || bestSize > (len * len) / 6) return null;
  const cells: Vec2[] = [];
  for (let c = b; c !== -1; c = parent[c]!) cells.push([(c % w) + 0.5, Math.floor(c / w) + 0.5]);
  // smooth the stair steps of the grid a little
  return cells.map((p, i) => {
    let x = 0, y = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(cells.length - 1, i + 2); k++) { x += cells[k]![0]; y += cells[k]![1]; n++; }
    return [x / n, y / n] as Vec2;
  });
}

function around(c: number, w: number, h: number): number[] {
  const x = c % w, y = (c - x) / w, out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < w && Y < h) out.push(Y * w + X);
  }
  return out;
}
