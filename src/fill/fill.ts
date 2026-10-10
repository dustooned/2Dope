/**
 * Flood fill for line art, written to avoid the usual problems:
 *
 * - Soft anti-aliased line edges count as line (barrier threshold on alpha), so there is no
 *   one-pixel gap between the fill and the line.
 * - The fill then grows *underneath* the line, only through pixels the line covers (alpha > 0).
 *   Because the fill lives on a plane below the line plane, the overlap is invisible except where
 *   the line is semi-transparent, and there it shows fill color instead of white: no halo, and
 *   the fill can never leak through a line (it cannot enter pixels the line does not touch).
 * - Gaps up to `gap` px are closed with a distance-limited barrier. The seed's own distance to
 *   the nearest line caps the closing radius, so clicking near a line never gets blocked.
 *
 * Pure functions on typed arrays (no DOM), so they are unit-tested in Node.
 */

export interface FillOptions {
  /** Line alpha (0..255) at or above which a pixel blocks the fill. */
  threshold: number;
  /** Close gaps in the line up to this many pixels wide (0 = off). */
  gap: number;
  /** How far the fill grows under the line, in pixels (about the line's soft-edge width). */
  under: number;
}

export const DEFAULT_FILL: FillOptions = { threshold: 24, gap: 4, under: 2 };

export interface FillResult {
  /** 1 where the fill paints, width*height. */
  mask: Uint8Array;
  /** Inclusive bounding box of the painted pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  count: number;
}

const FAR = 255;

/** Distance (4-neighbour steps) to the nearest barrier pixel, capped: 0 on barriers, FAR beyond `cap`. */
function distanceToBarrier(barrier: Uint8Array, w: number, h: number, cap: number): Uint8Array {
  const dist = new Uint8Array(barrier.length).fill(FAR);
  let frontier: number[] = [];
  for (let i = 0; i < barrier.length; i++) {
    if (barrier[i]) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  for (let d = 1; d <= cap && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0 && dist[i - 1] === FAR) (dist[i - 1] = d), next.push(i - 1);
      if (x < w - 1 && dist[i + 1] === FAR) (dist[i + 1] = d), next.push(i + 1);
      if (y > 0 && dist[i - w] === FAR) (dist[i - w] = d), next.push(i - w);
      if (y < h - 1 && dist[i + w] === FAR) (dist[i + w] = d), next.push(i + w);
    }
    frontier = next;
  }
  return dist;
}

/** Nearest non-barrier pixel to (sx, sy) within `radius`, or -1. */
function nearestOpen(barrier: Uint8Array, w: number, h: number, sx: number, sy: number, radius: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      const d = dx * dx + dy * dy;
      if (!barrier[i] && d < bestD) {
        best = i;
        bestD = d;
      }
    }
  }
  return best;
}

/** Grow `mask` by up to `steps` pixels (4-neighbour) into pixels where `allow(i)` is true. */
function grow(mask: Uint8Array, w: number, h: number, frontier: number[], steps: number, allow: (i: number) => boolean): void {
  let cur = frontier;
  for (let s = 0; s < steps && cur.length; s++) {
    const next: number[] = [];
    const add = (j: number) => {
      if (!mask[j] && allow(j)) {
        mask[j] = 1;
        next.push(j);
      }
    };
    for (const i of cur) {
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) add(i - 1);
      if (x < w - 1) add(i + 1);
      if (y > 0) add(i - w);
      if (y < h - 1) add(i + w);
    }
    cur = next;
  }
}

/** Pixels of `mask` (inside the box) that touch an unset pixel. */
function boundary(mask: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) out.push(i);
    }
  }
  return out;
}

/**
 * Compute the fill for a click at (sx, sy) on a line-alpha image (`alpha`, width*height, 0..255).
 * Returns null when there is nothing to fill (the click is buried inside a solid line).
 */
export function computeFill(alpha: Uint8Array, w: number, h: number, sx: number, sy: number, opts: FillOptions = DEFAULT_FILL): FillResult | null {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const N = w * h;
  const barrier = new Uint8Array(N);
  for (let i = 0; i < N; i++) barrier[i] = alpha[i]! >= opts.threshold ? 1 : 0;

  let seed = sy * w + sx;
  if (barrier[seed]) {
    seed = nearestOpen(barrier, w, h, sx, sy, 3);
    if (seed < 0) return null;
  }

  // Gap closing: block pixels within `rr` of a line. rr is capped so the seed itself stays open.
  const want = Math.max(0, Math.ceil(opts.gap / 2));
  const dist = want > 0 ? distanceToBarrier(barrier, w, h, want) : null;
  const rr = dist ? Math.min(want, Math.max(0, dist[seed]! - 1)) : 0;
  const open = (i: number) => (dist ? dist[i]! > rr : !barrier[i]);

  // Flood fill from the seed through open pixels.
  const mask = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  stack[sp++] = seed;
  mask[seed] = 1;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  while (sp > 0) {
    const i = stack[--sp]!;
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (x > 0 && !mask[i - 1] && open(i - 1)) (mask[i - 1] = 1), (stack[sp++] = i - 1);
    if (x < w - 1 && !mask[i + 1] && open(i + 1)) (mask[i + 1] = 1), (stack[sp++] = i + 1);
    if (y > 0 && !mask[i - w] && open(i - w)) (mask[i - w] = 1), (stack[sp++] = i - w);
    if (y < h - 1 && !mask[i + w] && open(i + w)) (mask[i + w] = 1), (stack[sp++] = i + w);
  }

  // Give back the closing band: grow `rr` pixels into pixels that are not line themselves.
  if (rr > 0) {
    const f = boundary(mask, w, h, x0, y0, x1, y1);
    grow(mask, w, h, f, rr, (j) => !barrier[j] && dist![j]! <= rr);
  }

  // Grow under the line, only through pixels the line covers.
  if (opts.under > 0) {
    const bx0 = Math.max(0, x0 - rr - 1);
    const by0 = Math.max(0, y0 - rr - 1);
    const bx1 = Math.min(w - 1, x1 + rr + 1);
    const by1 = Math.min(h - 1, y1 + rr + 1);
    const f = boundary(mask, w, h, bx0, by0, bx1, by1);
    grow(mask, w, h, f, opts.under, (j) => alpha[j]! > 0);
  }

  // Final bounding box and count.
  const pad = rr + opts.under + 1;
  const fx0 = Math.max(0, x0 - pad);
  const fy0 = Math.max(0, y0 - pad);
  const fx1 = Math.min(w - 1, x1 + pad);
  const fy1 = Math.min(h - 1, y1 + pad);
  let count = 0;
  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let y = fy0; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      if (mask[y * w + x]) {
        count++;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  if (count === 0) return null;
  return { mask, x0: bx0, y0: by0, x1: bx1, y1: by1, count };
}
