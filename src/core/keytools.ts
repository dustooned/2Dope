/**
 * Keyframe helpers (EffectCraft's Wiggler and Smoother, and the mograph key tools): pure
 * transforms of one property's keys, so every one is a single undo step and plays the same in
 * every export. Frames are layer time, as on `Key.f`.
 */

import { EASED, LINEAR, removeKey, valueAt, type Key, type Prop, type Side, type Value } from './anim';
import { hash01 } from './rng';

export type WiggleDims = 'both' | 'x' | 'y';

export interface WiggleOptions {
  /** Keys per second (0.5–10). */
  frequency: number;
  /** Each new key moves at most this far from the motion underneath. */
  magnitude: number;
  /** Points only: wiggle both axes, or one. */
  dims: WiggleDims;
  /** 0 = jagged (each key on its own), 1 = smooth (each key leans on its neighbours). */
  smooth: number;
  seed: number;
}

export const WIGGLE_DEFAULTS: Omit<WiggleOptions, 'seed'> = { frequency: 5, magnitude: 10, dims: 'both', smooth: 0.5 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Wiggle between the keys on `from` and `to`: new keys every `fps / frequency` frames, each within
 * ±magnitude of the value the property had there. The end keys and any keys already in between
 * stay as they are.
 */
export function wiggle<T extends Value>(p: Prop<T>, from: number, to: number, fps: number, o: WiggleOptions): Prop<T> {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const step = Math.max(1, Math.round(fps / clamp(o.frequency, 0.5, 10)));
  const frames: number[] = [];
  for (let f = lo + step; f < hi; f += step) if (!p.keys.some((k) => k.f === f)) frames.push(f);
  if (!frames.length) return p;
  const s = clamp(o.smooth, 0, 1), mag = Math.abs(o.magnitude);
  // one random number in -1..1 per key and axis, then (smooth) averaged with its neighbours
  const noise = (axis: number) => {
    const raw = frames.map((_, i) => hash01(o.seed, i, 11 + axis) * 2 - 1);
    return raw.map((r, i) => {
      const avg = ((raw[i - 1] ?? r) + r + (raw[i + 1] ?? r)) / 3;
      return clamp((1 - s) * r + s * avg, -1, 1);
    });
  };
  const nx = noise(0), ny = noise(1);
  const side: Side = s >= 0.5 ? EASED : LINEAR;
  const added: Key<T>[] = frames.map((f, i) => {
    const base = valueAt(p, f);
    const v = (typeof base === 'number'
      ? base + nx[i]! * mag
      : [base[0] + (o.dims === 'y' ? 0 : nx[i]! * mag), base[1] + (o.dims === 'x' ? 0 : ny[i]! * mag)]) as T;
    return { f, v, in: side, out: side };
  });
  const keys = [...p.keys, ...added].sort((a, b) => a.f - b.f);
  return { ...p, keys };
}

const diff = (a: Value, b: Value) => (typeof a === 'number' ? Math.abs(a - (b as number)) : Math.max(Math.abs(a[0] - (b as [number, number])[0]), Math.abs(a[1] - (b as [number, number])[1])));

/**
 * Smooth keys: remove keys between `from` and `to` (the end keys stay) while the motion stays
 * within `tolerance` of the original at every frame. The key whose removal changes least goes first.
 */
export function smoothKeys<T extends Value>(p: Prop<T>, from: number, to: number, tolerance: number): Prop<T> {
  const lo = Math.min(from, to), hi = Math.max(from, to), tol = Math.max(0, tolerance);
  const original = (f: number) => valueAt(p, f);
  const error = (q: Prop<T>) => {
    let e = 0;
    for (let f = lo; f <= hi; f++) e = Math.max(e, diff(valueAt(q, f), original(f)));
    return e;
  };
  let cur = p;
  for (;;) {
    let best: { q: Prop<T>; e: number } | null = null;
    for (const k of cur.keys) {
      if (k.f <= lo || k.f >= hi) continue;
      const q = removeKey(cur, k.f);
      const e = error(q);
      if (e <= tol && (!best || e < best.e)) best = { q, e };
    }
    if (!best) return cur;
    cur = best.q;
  }
}

export type LoopMode = 'cycle' | 'pingpong' | 'offset';

/**
 * Loop the keys from `from` to `to` after themselves `repeats` more times. Cycle repeats them,
 * ping-pong plays every other copy backwards, offset adds the change of each pass to the next
 * (a walk that keeps going). Keys already inside the new range are replaced; later ones stay.
 */
export function loopKeys<T extends Value>(p: Prop<T>, from: number, to: number, mode: LoopMode, repeats: number): Prop<T> {
  const lo = Math.min(from, to), hi = Math.max(from, to), period = hi - lo, n = Math.max(0, Math.round(repeats));
  const inside = p.keys.filter((k) => k.f >= lo && k.f <= hi);
  if (period <= 0 || inside.length < 2 || !n) return p;
  const first = inside[0]!.v, last = inside[inside.length - 1]!.v;
  const add = (v: T, times: number): T => {
    if (mode !== 'offset' || !times) return v;
    if (typeof v === 'number') return (v + ((last as number) - (first as number)) * times) as T;
    const a = first as [number, number], b = last as [number, number];
    return [v[0] + (b[0] - a[0]) * times, v[1] + (b[1] - a[1]) * times] as T;
  };
  const end = hi + n * period;
  const copies: Key<T>[] = [];
  for (let r = 1; r <= n; r++) {
    const back = mode === 'pingpong' && r % 2 === 1;
    for (const k of inside) {
      const t = back ? hi - k.f : k.f - lo;
      // the first key of a pass sits on the last key of the one before: keep that one
      if (t === 0) continue;
      copies.push({ f: hi + (r - 1) * period + t, v: add(k.v, r), in: back ? k.out : k.in, out: back ? k.in : k.out });
    }
  }
  const keys = p.keys.filter((k) => k.f <= hi || k.f > end).concat(copies).sort((a, b) => a.f - b.f);
  return { ...p, keys };
}

export type StaggerOrder = 'order' | 'reverse' | 'random';

/** How many frames each of `count` layers moves for a stagger of `step` frames. */
export function staggerOffsets(count: number, step: number, order: StaggerOrder, seed = 1): number[] {
  const idx = Array.from({ length: count }, (_, i) => i);
  if (order === 'reverse') idx.reverse();
  if (order === 'random') {
    // seeded shuffle, so the same seed staggers the same way
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(hash01(seed, i, 29) * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
  }
  const out = new Array<number>(count);
  idx.forEach((layer, rank) => (out[layer] = rank * Math.round(step)));
  return out;
}
