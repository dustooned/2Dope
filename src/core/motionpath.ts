/**
 * Animate along a path: a line the student draws becomes an ordinary curved motion path (position
 * keys with spatial handles), so Edit motion path, Smooth/Straight and every renderer and export
 * already understand it.
 */
import { LINEAR, type Key, type Prop, type Vec2 } from './anim';
import { simplifyPoints } from './vecedit';

/** At most this many keys from one drawn path. */
export const MAX_PATH_KEYS = 60;

const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Position keys that travel along `points` from frame `f0` to `f1` (layer time). Keys are placed by
 * distance, handles follow the line (Catmull-Rom; sharp corners stay sharp), and a line that ends
 * where it began closes smoothly. `even` sets steady speed along the whole path. Null when the line is too short.
 */
export function pathProp(points: Vec2[], f0: number, f1: number, even = true): Prop<Vec2> | null {
  const pts: Vec2[] = [];
  for (const p of points) if (Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!pts.length || len(pts[pts.length - 1]!, p) > 0.5)) pts.push([p[0], p[1]]);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += len(pts[i - 1]!, pts[i]!);
  const frames = Math.round(f1) - Math.round(f0);
  if (pts.length < 2 || total < 2 || frames < 1) return null;
  // fewer, well-placed anchors: tolerance grows until the key count fits the frames available
  const limit = Math.max(2, Math.min(MAX_PATH_KEYS, frames + 1));
  let tol = Math.max(1, total * 0.004), anchors: Vec2[] = [];
  for (let tries = 0; tries < 30; tries++, tol *= 1.6) {
    anchors = simplifyPoints(pts.map(([x, y]) => ({ x, y })), tol).map(p => [p.x, p.y] as Vec2);
    if (anchors.length <= limit) break;
  }
  if (anchors.length > limit) anchors = [anchors[0]!, anchors[anchors.length - 1]!];
  const closed = anchors.length > 2 && len(anchors[0]!, anchors[anchors.length - 1]!) < Math.max(4, total * 0.02);
  if (closed) anchors[anchors.length - 1] = [...anchors[0]!];
  // frames by distance along the line; keys need distinct frames
  const along: number[] = [0];
  for (let i = 1; i < anchors.length; i++) along.push(along[i - 1]! + len(anchors[i - 1]!, anchors[i]!));
  const span = along[along.length - 1]! || 1;
  const start = Math.round(f0), end = Math.round(f1);
  const keys: Key<Vec2>[] = [];
  anchors.forEach((v, i) => {
    const last = i === anchors.length - 1;
    const f = last ? end : Math.max(keys.length ? keys[keys.length - 1]!.f + 1 : start, Math.round(start + (along[i]! / span) * (end - start)));
    if (!last && f >= end) return;
    keys.push({ f, v: [v[0], v[1]], in: LINEAR, out: LINEAR });
  });
  if (keys.length < 2) return null;
  // handles along the line: each key's tangent points from its neighbour before to the one after
  const n = keys.length;
  keys.forEach((k, i) => {
    const prev = i > 0 ? keys[i - 1]!.v : closed ? keys[n - 2]!.v : null;
    const next = i < n - 1 ? keys[i + 1]!.v : closed ? keys[1]!.v : null;
    const from = prev ?? k.v, to = next ?? k.v;
    const tx = to[0] - from[0], ty = to[1] - from[1], tl = Math.hypot(tx, ty) || 1;
    const ux = tx / tl, uy = ty / tl;
    const before = i > 0 ? len(keys[i - 1]!.v, k.v) : prev ? len(prev, k.v) : 0;
    const after = i < n - 1 ? len(k.v, keys[i + 1]!.v) : next ? len(k.v, next) : 0;
    // a sharp corner (turning more than 50°) stays a corner: each handle points along its own side,
    // so the straight parts either side stay straight
    if (prev && next && before > 0 && after > 0) {
      const ix = k.v[0] - prev[0], iy = k.v[1] - prev[1], ox = next[0] - k.v[0], oy = next[1] - k.v[1];
      const turn = Math.acos(Math.max(-1, Math.min(1, (ix * ox + iy * oy) / (before * after))));
      if (turn > (50 * Math.PI) / 180) {
        k.spatial = { in: [-ix / 3, -iy / 3], out: [ox / 3, oy / 3] };
        return;
      }
    }
    k.spatial = { in: [-ux * before / 3, -uy * before / 3], out: [ux * after / 3, uy * after / 3] };
  });
  return { value: keys[0]!.v, keys, ...(even ? { even: true } : {}) };
}
