// Prototype: a pixel drawing of a balloon becomes a caption balloon. Rasterise ink, close small
// gaps (dilate the ink), flood the enclosed area from a point inside, trace its boundary, grow it
// back by the gap radius, simplify, then classify with the shape detector.
import { classify } from './classify.mjs';

/** Ink mask from a polyline (round pen of radius `r`). */
export function rasterise(pts, w, h, r) {
  const m = new Uint8Array(w * h);
  const dab = (cx, cy) => { for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 1; };
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)); for (let k = 0; k <= n; k++) dab(a.x + ((b.x - a.x) * k) / Math.max(1, n), a.y + ((b.y - a.y) * k) / Math.max(1, n)); }
  return m;
}

function dilate(m, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && dx * dx + dy * dy <= r * r) out[Y * w + X] = 1; }
  return out;
}

/** The enclosed area around (sx, sy): a flood that may not reach the page edge (else it is not enclosed). */
export function enclosed(ink, w, h, sx, sy, gap) {
  const wall = dilate(ink, w, h, gap), region = new Uint8Array(w * h), stack = [sy * w + sx];
  if (wall[stack[0]]) return null;
  region[stack[0]] = 1;
  let leaks = false;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) leaks = true;
    for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && !region[j] && !wall[j]) { region[j] = 1; stack.push(j); }
  }
  return leaks ? null : dilate(region, w, h, gap); // grow back over the closed gap
}

/** Outer boundary of a region (Moore-neighbour tracing), as points. */
export function boundary(region, w, h) {
  let start = -1;
  for (let i = 0; i < w * h; i++) if (region[i]) { start = i; break; }
  if (start < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x];
  let x = start % w, y = (start - x) / w, d = 7; const sx = x, sy = y, out = [];
  for (let guard = 0; guard < w * h * 2; guard++) {
    out.push({ x, y });
    let found = false;
    for (let k = 0; k < 8; k++) { const nd = (d + 6 + k) % 8, [dx, dy] = dirs[nd]; if (at(x + dx, y + dy)) { x += dx; y += dy; d = nd; found = true; break; } }
    if (!found || (x === sx && y === sy && out.length > 2)) break;
  }
  return out;
}

export function trace(pts, { w = 420, h = 320, pen = 3, gap = 6 } = {}) {
  const ink = rasterise(pts, w, h, pen);
  // tap point: the middle of the drawing (in the app, where the student taps)
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const sx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2), sy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
  // close gaps adaptively: small first (keeps detail), wider only if needed, at most ~a sixth of the drawing
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  let region = null, used = gap;
  for (const g of [gap, 10, 16, 24, 34, 46]) { if (g > size / 6) break; region = enclosed(ink, w, h, sx, sy, g); used = g; if (region) break; }
  if (!region) return { kind: 'leaks', outline: null };
  // the balloon's edge is the outside of its ink: the enclosed area plus the line itself keeps spike tips sharp
  const shape = region.map((v, i) => v || ink[i] ? 1 : 0);
  const outline = boundary(shape, w, h);
  return { ...classify(outline), outline, gap: used };
}
