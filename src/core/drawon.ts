/**
 * Draw on: show only part of each vector line, sliding along its path (like Trim Paths or the
 * Start / End / Offset of a stroke plug-in). Pure maths on stroke records; the renderer calls it
 * at draw time, so nothing in the drawing changes.
 */
import type { StrokePoint, StrokeRecord } from './stroke';
import { at } from './vectorcut';

export interface DrawOnSettings {
  /** Where the visible part starts and ends along the path, 0..100 %. */
  start: number;
  end: number;
  /** Slides the visible part along the path, in % of the path (any amount). */
  offset: number;
  /** Extra slide per second, in % of the path (steady, no keys needed). */
  travel: number;
  /** Layer time in seconds. */
  seconds: number;
  /** Length in px over which a cut end narrows to a point (0 = blunt). */
  taper: number;
  /** 'each': every line on its own; 'order': all lines in drawn order as one long path. */
  mode: 'each' | 'order';
  /** The visible part wraps round to the start of the path instead of running off the end. */
  loop: boolean;
}

/**
 * The Repeater: extra copies of the drawn-on lines, each one further along an offset, turned, scaled,
 * faded and (optionally) a few frames behind, so a line leaves echoing trails or recedes into depth.
 * Copy 0 is the line itself; copies 1.. are drawn behind it, farthest first.
 */
export interface RepeatSettings {
  /** Copies in all, the line itself included (1 = no repeat). */
  copies: number;
  /** Each copy moves this far (px) from the one before. */
  x: number;
  y: number;
  /** Each copy is this % of the size of the one before. */
  scale: number;
  /** Each copy turns this many degrees more than the one before. */
  turn: number;
  /** Each copy loses this % of its opacity compared with the one before. */
  fade: number;
  /** Each copy shows the animation this many frames earlier than the one before. */
  delay: number;
  /** 0..100: copies also shrink and fade as if they were further away. */
  depth: number;
}

export const MAX_COPIES = 12;

/** How copy `k` (1 or more) sits: offset from the line, turn (radians), size, opacity and how many frames behind. */
export function repeatCopy(r: RepeatSettings, k: number): { dx: number; dy: number; turn: number; scale: number; alpha: number; frames: number } {
  const d = Math.max(0, Math.min(100, r.depth)) / 100;
  const scale = (Math.max(1, r.scale) / 100) * (1 - d * 0.08);
  const keep = (1 - Math.max(0, Math.min(100, r.fade)) / 100) * (1 - d * 0.12);
  return {
    dx: r.x * k, dy: r.y * k,
    turn: (r.turn * k * Math.PI) / 180,
    scale: Math.max(0.01, scale ** k),
    alpha: Math.max(0, keep ** k),
    frames: r.delay * k,
  };
}

/** The copies to draw, farthest first (the line itself is drawn on top, last). */
export function repeatIndices(r: RepeatSettings): number[] {
  const n = Math.max(1, Math.min(MAX_COPIES, Math.round(r.copies)));
  return Array.from({ length: n - 1 }, (_, i) => n - 1 - i);
}

/** Lines this applies to: pen and vector brush lines (imported closed shapes are left whole). */
export const drawOnable = (s: StrokeRecord): boolean => !s.shape && s.points.length > 1;

/** Visible parts of the path as [from, to] fractions of 0..1, for the settings. */
export function drawOnWindows(s: DrawOnSettings): [number, number][] {
  const lo = Math.max(0, Math.min(100, s.start)) / 100;
  const hi = Math.max(0, Math.min(100, s.end)) / 100;
  const w = Math.max(0, hi - lo);
  if (w <= 1e-6) return [];
  const a = lo + (s.offset + s.travel * s.seconds) / 100;
  if (!s.loop) {
    const from = Math.max(0, a), to = Math.min(1, a + w);
    return to - from > 1e-6 ? [[from, to]] : [];
  }
  if (w >= 1 - 1e-9) return [[0, 1]];
  const from = ((a % 1) + 1) % 1, to = from + w;
  return to <= 1 ? [[from, to]] : [[from, 1], [0, to - 1]];
}

/** Fractional point index for an arc distance `d` along a stroke (`cum` = distance to each point). */
function indexAt(cum: number[], d: number): number {
  let lo = 0, hi = cum.length - 1;
  if (d <= 0) return 0;
  if (d >= cum[hi]!) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= d) lo = mid; else hi = mid;
  }
  const span = cum[hi]! - cum[lo]!;
  return lo + (span > 0 ? (d - cum[lo]!) / span : 0);
}

function piece(rec: StrokeRecord, cum: number[], d0: number, d1: number, k: number, taper: number): StrokeRecord | null {
  const total = cum[cum.length - 1]!;
  if (d1 - d0 < 1e-6) return null;
  const a = indexAt(cum, d0), b = indexAt(cum, d1);
  const P = rec.points;
  const pts: StrokePoint[] = [at(P, a)];
  for (let i = Math.floor(a) + 1; i < b; i++) pts.push(P[i]!);
  pts.push(at(P, b));
  if (pts.length < 2) return null;
  const cutStart = d0 > 1e-6, cutEnd = d1 < total - 1e-6;
  const t = Math.min(taper, (d1 - d0) / 2);
  const brush = {
    ...rec.brush,
    taperStart: cutStart && taper > 0 ? Math.max(rec.brush.taperStart, t) : rec.brush.taperStart,
    taperEnd: cutEnd && taper > 0 ? Math.max(rec.brush.taperEnd, t) : rec.brush.taperEnd,
  };
  return { ...rec, id: `${rec.id}~d${k}`, brush, points: pts, controls: undefined };
}

/**
 * The strokes with only their visible parts. Lines that cannot be cut come back unchanged (same
 * object); every cut line is a new record (the renderer keys its caches on the record).
 */
export function drawOnStrokes(strokes: readonly StrokeRecord[], s: DrawOnSettings): StrokeRecord[] {
  const windows = drawOnWindows(s);
  const lines = strokes.filter(drawOnable);
  const lens = new Map<StrokeRecord, number[]>();
  let total = 0;
  const starts = new Map<StrokeRecord, number>();
  for (const rec of lines) {
    const cum = [0];
    for (let i = 1; i < rec.points.length; i++) cum.push(cum[i - 1]! + Math.hypot(rec.points[i]!.x - rec.points[i - 1]!.x, rec.points[i]!.y - rec.points[i - 1]!.y));
    lens.set(rec, cum);
    starts.set(rec, total);
    total += cum[cum.length - 1]!;
  }
  const out: StrokeRecord[] = [];
  for (const rec of strokes) {
    const cum = lens.get(rec);
    if (!cum) { out.push(rec); continue; }
    const len = cum[cum.length - 1]!;
    if (len <= 0) continue;
    let k = 0;
    for (const [u0, u1] of windows) {
      let d0: number, d1: number;
      if (s.mode === 'order') {
        const c0 = starts.get(rec)!;
        d0 = Math.max(0, u0 * total - c0);
        d1 = Math.min(len, u1 * total - c0);
      } else { d0 = u0 * len; d1 = u1 * len; }
      if (d1 <= d0) continue;
      const p = d0 <= 1e-6 && d1 >= len - 1e-6 ? rec : piece(rec, cum, d0, d1, k, s.taper);
      if (p) { out.push(p); k++; }
    }
  }
  return out;
}
