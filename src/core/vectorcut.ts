import type { StrokePoint, StrokeRecord } from './stroke';

/**
 * Erasing vector lines, the way Clip Studio's vector eraser works:
 * - "whole": a touched line goes away entirely;
 * - "crossing": only the piece between the nearest crossings with other lines goes, so
 *   overshoots at a corner clean up with one swipe.
 * Pure geometry on stroke records; returns the new list, or null when nothing was touched.
 */
export type VectorErase = 'off' | 'crossing' | 'whole';

interface Pt {
  x: number;
  y: number;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Where segments ab and cd cross: the parameter along ab (0..1), or null. */
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Positions along a stroke (segment index + fraction) touched by the eraser path. */
function touchedAt(points: StrokePoint[], path: Pt[], reach: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    let hit = false;
    for (let k = 0; k < path.length && !hit; k++) hit = distToSegment(p, path[Math.max(0, k - 1)]!, path[k]!) <= reach;
    if (hit) out.push(i);
  }
  return out;
}

/** Crossing positions (as fractional point indices) of a stroke with every other stroke. */
function crossings(rec: StrokeRecord, others: StrokeRecord[]): number[] {
  const out: number[] = [];
  const P = rec.points;
  for (const o of others) {
    const Q = o.points;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1]!;
      const b = P[i]!;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      for (let j = 1; j < Q.length; j++) {
        const c = Q[j - 1]!;
        const d = Q[j]!;
        if (Math.max(c.x, d.x) < minX || Math.min(c.x, d.x) > maxX || Math.max(c.y, d.y) < minY || Math.min(c.y, d.y) > maxY) continue;
        const t = crossing(a, b, c, d);
        if (t !== null) out.push(i - 1 + t);
      }
    }
  }
  return out.sort((x, y) => x - y);
}

/** The point at a fractional index (pressure and tilt interpolated). */
export function at(points: StrokePoint[], f: number): StrokePoint {
  const i = Math.max(0, Math.min(points.length - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  const a = points[i]!;
  const b = points[i + 1] ?? a;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), pressure: lerp(a.pressure, b.pressure), tiltX: lerp(a.tiltX, b.tiltX), tiltY: lerp(a.tiltY, b.tiltY), t: lerp(a.t, b.t) };
}

/** The part of a stroke between fractional indices a..b, as a new record. Cut ends lose their taper. */
function piece(rec: StrokeRecord, a: number, b: number, k: number): StrokeRecord | null {
  const P = rec.points;
  const last = P.length - 1;
  if (b - a < 1e-6) return null;
  const pts: StrokePoint[] = [at(P, a)];
  for (let i = Math.floor(a) + 1; i < b; i++) pts.push(P[i]!);
  pts.push(at(P, b));
  if (pts.length < 2) return null;
  const brush = { ...rec.brush, taperStart: a > 1e-6 ? 0 : rec.brush.taperStart, taperEnd: b < last - 1e-6 ? 0 : rec.brush.taperEnd };
  return { ...rec, id: `${rec.id}~${k}`, brush, points: pts };
}

/**
 * Erase vector strokes touched by an eraser path (`radius` = the eraser's half-size). Lines
 * count as touched within the eraser radius plus their own half-width.
 */
export function eraseVectors(strokes: StrokeRecord[], path: Pt[], radius: number, mode: VectorErase): StrokeRecord[] | null {
  if (mode === 'off' || !path.length || !strokes.length) return null;
  const out: StrokeRecord[] = [];
  let changed = false;
  for (const rec of strokes) {
    const touched = touchedAt(rec.points, path, radius + rec.brush.size / 2);
    if (!touched.length) {
      out.push(rec);
      continue;
    }
    changed = true;
    if (mode === 'whole' || rec.points.length < 2) continue;
    // cut points: the stroke's ends and every crossing with another line
    const cuts = [
      0,
      ...crossings(
        rec,
        strokes.filter((o) => o !== rec),
      ),
      rec.points.length - 1,
    ];
    const gone = new Set<number>();
    for (const i of touched) {
      let k = 0;
      while (k < cuts.length - 2 && cuts[k + 1]! <= i) k++;
      gone.add(k);
    }
    let n = 0;
    for (let k = 0; k < cuts.length - 1; k++) {
      if (gone.has(k)) continue;
      // join neighbouring kept intervals into one piece
      let end = k;
      while (end + 1 < cuts.length - 1 && !gone.has(end + 1)) end++;
      const p = piece(rec, cuts[k]!, cuts[end + 1]!, n++);
      if (p) out.push(p);
      k = end;
    }
  }
  return changed ? out : null;
}
