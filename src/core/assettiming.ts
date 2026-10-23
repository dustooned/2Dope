import { compLength, layerEnd, type Comp, type CompLayer } from './comp';

export type AssetTimingField = 'start' | 'hold' | 'end' | 'shot';
export type AssetClipGesture = 'move' | 'in' | 'out';
const MAX_FRAME = 1_000_000;

/** Human frame numbers: Start and End are inclusive, Hold is frames on screen. */
export function assetTiming(l: CompLayer, c: Comp, comps: ReadonlyMap<string, Comp>) {
  const end = layerEnd(l, comps, c.fps);
  const last = Number.isFinite(end) ? end : compLength(c, comps);
  return { start: l.in + 1, hold: Math.max(1, last - l.in), end: last, follow: l.out === null && !Number.isFinite(end) };
}

/** Recompute each drag from its initial interval, never from the previous preview. */
export function assetClipTimingChange(l: CompLayer, c: Comp, comps: ReadonlyMap<string, Comp>, kind: AssetClipGesture, delta: number) {
  if (!Number.isFinite(delta)) return null;
  const t = assetTiming(l,c,comps), max = Math.max(1,Math.min(MAX_FRAME,c.duration ?? MAX_FRAME));
  const end = Math.max(l.in+1,Math.min(max,t.end));
  delta = Math.round(delta);
  if (delta === 0) return {start:l.start,in:l.in,out:l.out,play:l.play};
  // Moving a following clip makes its currently visible length explicit.
  if (kind === 'move') return assetTimingChange({...l,out:end},c,comps,'start',l.in+1+delta);
  if (kind === 'out') return assetTimingChange(l,c,comps,'end',end+delta);
  // Trim the visible beginning without slipping source frames or local transform keys.
  return {start:l.start,in:Math.max(0,Math.min(end-1,l.in+delta)),out:end,play:l.play};
}

/** Only instance timing changes. Source frames, local keys, transforms and sibling tracks stay put. */
export function assetTimingChange(l: CompLayer, c: Comp, comps: ReadonlyMap<string, Comp>, field: AssetTimingField, value?: number) {
  if (field !== 'shot' && (value === undefined || !Number.isFinite(value))) return null;
  const max = Math.max(1, Math.min(MAX_FRAME, c.duration ?? MAX_FRAME));
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  let visibleStart = clamp(l.in, 0, max - 1), out = l.out;
  let start = l.start + visibleStart - l.in;
  if (field === 'start') {
    const length = out === null ? 1 : Math.max(1, out - l.in);
    visibleStart = clamp(value! - 1, 0, Math.max(0, max - Math.min(length, max)));
    const delta = visibleStart - l.in;
    start = l.start + delta;
    out = out === null ? null : Math.min(max, visibleStart + length);
  } else if (field === 'hold') out = clamp(visibleStart + Math.max(1, Math.round(value!)), visibleStart + 1, max);
  else if (field === 'end') out = clamp(value!, visibleStart + 1, max);
  else out = null;
  // A Play-once source otherwise goes blank before a longer interval has finished.
  const play = field !== 'start' && l.play === 'once' ? 'loop' : l.play;
  return { start, in: visibleStart, out, play };
}
