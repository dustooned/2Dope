import type { StrokePoint, StrokeRecord } from './stroke';
import { insideVectorClips, vectorReach } from './vectorstyle';

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
function touchedAt(points: StrokePoint[], path: Pt[], reach: number): [number,number][] {
  const out: [number,number][] = [];
  for (let i = 0; i < Math.max(1,points.length-1); i++) {
    const a=points[i],b=points[i+1] ?? a;
    if(!a || !b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
    const project=(p:Pt)=>len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
    for(let k=0;k<path.length;k++) {
      const c=path[Math.max(0,k-1)]!,d=path[k]!;
      const distance=(t:number)=>distToSegment({x:a.x+t*dx,y:a.y+t*dy},c,d);
      const candidates=[0,1,project(c),project(d)];
      const cross=crossing(a,b,c,d);if(cross!==null)candidates.push(cross);
      const t=candidates.reduce((best,n)=>distance(n)<distance(best)?n:best,0);
      if(distance(t)>reach)continue;
      let lo=0,hi=t;
      if(distance(0)>reach)for(let n=0;n<24;n++){const mid=(lo+hi)/2;if(distance(mid)<=reach)hi=mid;else lo=mid;}
      else hi=0;
      const left=hi;lo=t;hi=1;
      if(distance(1)>reach)for(let n=0;n<24;n++){const mid=(lo+hi)/2;if(distance(mid)<=reach)lo=mid;else hi=mid;}
      else lo=1;
      out.push([i+left,i+lo]);
    }
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
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), pressure: lerp(a.pressure, b.pressure), tiltX: lerp(a.tiltX, b.tiltX), tiltY: lerp(a.tiltY, b.tiltY), t: lerp(a.t, b.t),
    ...(a.w !== undefined || b.w !== undefined ? {w:lerp(a.w ?? 1,b.w ?? 1)} : {}),
    ...(a.u !== undefined && b.u !== undefined ? {u:lerp(a.u,b.u)} : {}),
    ...(a.speed !== undefined || b.speed !== undefined ? {speed:lerp(a.speed ?? 0,b.speed ?? 0)} : {}) };
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
  return { ...rec, id: `${rec.id}~${k}`, brush, points: pts, controls: undefined };
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
    if(rec.clips?.length) {
      let visible=false;
      for(let i=0;i<path.length && !visible;i++) {
        const a=path[Math.max(0,i-1)]!,b=path[i]!;
        const steps=Math.min(20000,Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,radius))));
        for(let k=0;k<=steps && !visible;k++) {
          const x=a.x+(b.x-a.x)*k/steps,y=a.y+(b.y-a.y)*k/steps;
          visible=insideVectorClips(rec,x,y);
          for(let n=0;n<8 && !visible;n++)visible=insideVectorClips(rec,x+radius*Math.cos(n*Math.PI/4),y+radius*Math.sin(n*Math.PI/4));
        }
      }
      if(!visible){out.push(rec);continue;}
    }
    const touched = touchedAt(rec.points, path, radius + (rec.style ? vectorReach(rec) : rec.brush.size / 2));
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
    for (const [a,b] of touched) for(let k=0;k<cuts.length-1;k++) {
      if(b>=cuts[k]! && a<=cuts[k+1]!) gone.add(k);
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
