/**
 * Drawing guides (Procreate's Drawing Guide): a 2D grid, an isometric grid, and one- or two-point
 * perspective. With Assisted drawing on, a stroke settles on the guide direction closest to the
 * way it starts and stays on that straight line.
 */

export type GuideMode = 'off' | 'grid' | 'iso' | 'persp1' | 'persp2';

export interface Guide {
  mode: GuideMode;
  /** Grid spacing in document pixels (grid and isometric). */
  size: number;
  /** The horizon, as a fraction of the page height (perspective). */
  horizon: number;
  /** Vanishing points along the horizon, as fractions of the page width: one-point, and two-point's left and right. */
  vp1: number;
  left: number;
  right: number;
}

export const DEFAULT_GUIDE: Guide = { mode: 'off', size: 40, horizon: 0.4, vp1: 0.5, left: -0.15, right: 1.15 };

export const GUIDE_NAMES: Record<GuideMode, string> = { off: 'Guide', grid: 'Grid', iso: 'Isometric', persp1: '1-point', persp2: '2-point' };

/** The vanishing points of a perspective guide (document pixels). */
export function vanishingPoints(g: Guide, w: number, h: number): [number, number][] {
  const y = g.horizon * h;
  if (g.mode === 'persp1') return [[g.vp1 * w, y]];
  if (g.mode === 'persp2') return [[g.left * w, y], [g.right * w, y]];
  return [];
}

/** The guide's lines to draw, as segments (document pixels). */
export function guideLines(g: Guide, w: number, h: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const s = Math.max(8, g.size);
  if (g.mode === 'grid') {
    for (let x = 0; x <= w; x += s) out.push([x, 0, x, h]);
    for (let y = 0; y <= h; y += s) out.push([0, y, w, y]);
  } else if (g.mode === 'iso') {
    // verticals, and lines at 30 degrees either way
    const t = Math.tan(Math.PI / 6);
    const dx = s / Math.cos(Math.PI / 6);
    for (let x = 0; x <= w; x += dx) out.push([x, 0, x, h]);
    const span = h / t + w;
    for (let c = -span; c <= span; c += dx) {
      out.push([c, 0, c + h / t, h]);
      out.push([c, h, c + h / t, 0]);
    }
  } else if (g.mode === 'persp1' || g.mode === 'persp2') {
    const R = Math.hypot(w, h) * 2;
    for (const [vx, vy] of vanishingPoints(g, w, h)) for (let a = 0; a < 360; a += 10) out.push([vx, vy, vx + Math.cos((a * Math.PI) / 180) * R, vy + Math.sin((a * Math.PI) / 180) * R]);
    out.push([0, g.horizon * h, w, g.horizon * h]);
    if (g.mode === 'persp1') for (let y = 0; y <= h; y += s * 2) out.push([0, y, w, y]);
    for (let x = 0; x <= w; x += s * 2) out.push([x, 0, x, h]);
  }
  return out;
}

/** The guide directions through a point (angles in radians; a line and its reverse are one). */
export function guideDirections(g: Guide, w: number, h: number, x: number, y: number): number[] {
  if (g.mode === 'grid') return [0, Math.PI / 2];
  if (g.mode === 'iso') return [Math.PI / 6, (5 * Math.PI) / 6, Math.PI / 2];
  if (g.mode === 'persp1' || g.mode === 'persp2') {
    const toVp = vanishingPoints(g, w, h).map(([vx, vy]) => Math.atan2(vy - y, vx - x));
    return g.mode === 'persp1' ? [0, Math.PI / 2, ...toVp] : [Math.PI / 2, ...toVp];
  }
  return [];
}

/** The direction closest to a movement (dx, dy). */
export function pickDirection(dirs: number[], dx: number, dy: number): number | null {
  if (!dirs.length || (dx === 0 && dy === 0)) return null;
  const a = Math.atan2(dy, dx);
  let best = dirs[0]!;
  let gap = Infinity;
  for (const d of dirs) {
    // a line runs both ways: compare modulo half a turn
    let diff = Math.abs(((a - d) % Math.PI) + Math.PI) % Math.PI;
    diff = Math.min(diff, Math.PI - diff);
    if (diff < gap) { gap = diff; best = d; }
  }
  return best;
}

/** A point brought onto the line through `start` in direction `dir`. */
export function assistPoint(start: { x: number; y: number }, dir: number, p: { x: number; y: number }): { x: number; y: number } {
  const ux = Math.cos(dir), uy = Math.sin(dir);
  const t = (p.x - start.x) * ux + (p.y - start.y) * uy;
  return { x: start.x + ux * t, y: start.y + uy * t };
}
