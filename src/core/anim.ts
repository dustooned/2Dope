/**
 * Animated values: everything keyframable (spec principle 3).
 *
 * The model follows After Effects / EffectCraft (doc 09 §6) in a normalised form:
 * - A key holds a value at an integer frame (layer time).
 * - Each side of a key has an interpolation: linear, bezier or hold. A bezier side has an
 *   `influence` (0..1, fraction of the segment) and a normalised `slope` (speed × duration ÷
 *   change; 0 = eased to a stop, 1 = linear speed). Every dimension of a value moves with the same
 *   progress curve, so a position follows a straight line between keys (motion paths come later).
 * - The four friendly easings (Linear, Ease in, Ease out, Ease in-out) and Hold are presets over
 *   this one model, and the numbers map directly to Blender F-curve handles.
 */

export type Vec2 = [number, number];
export type Value = number | Vec2;

export type Interp = 'linear' | 'bezier' | 'hold';

export interface Side {
  interp: Interp;
  /** Normalised speed at the key (bezier only). 0 = stopped, 1 = the linear speed. */
  slope: number;
  /** How far the handle reaches into the segment, 0.01..1 (bezier only). */
  influence: number;
}

export interface Key<T extends Value = Value> {
  /** Frame in layer time (integer). */
  f: number;
  v: T;
  /** Coming into this key (end of the previous segment). */
  in: Side;
  /** Leaving this key (start of the next segment). */
  out: Side;
}

export interface Prop<T extends Value = Value> {
  /** The value when there are no keys. */
  value: T;
  /** Sorted by frame, one key per frame at most. */
  keys: Key<T>[];
}

export const LINEAR: Side = { interp: 'linear', slope: 1, influence: 1 / 3 };
export const EASED: Side = { interp: 'bezier', slope: 0, influence: 1 / 3 };
export const HOLD: Side = { interp: 'hold', slope: 0, influence: 1 / 3 };

/** The easings the UI offers between two keys (Procreate Dreams' four, plus hold). */
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
export const EASINGS: { id: Easing; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease in' },
  { id: 'easeOut', label: 'Ease out' },
  { id: 'easeInOut', label: 'Ease in and out' },
  { id: 'hold', label: 'Hold' },
];

/**
 * The sides a segment gets for an easing. "Ease in" = slow start (Dreams' wording: more steps
 * near the first key), "ease out" = slow end.
 */
export function easingSides(e: Easing): { out: Side; in: Side } {
  switch (e) {
    case 'linear':
      return { out: LINEAR, in: LINEAR };
    case 'easeIn':
      return { out: EASED, in: LINEAR };
    case 'easeOut':
      return { out: LINEAR, in: EASED };
    case 'easeInOut':
      return { out: EASED, in: EASED };
    case 'hold':
      return { out: HOLD, in: LINEAR };
  }
}

/** Which preset a segment matches, or null for a custom curve. */
export function easingOf(out: Side, inn: Side): Easing | null {
  if (out.interp === 'hold') return 'hold';
  const lin = (s: Side) => s.interp === 'linear';
  const ease = (s: Side) => s.interp === 'bezier' && Math.abs(s.slope) < 1e-6 && Math.abs(s.influence - 1 / 3) < 1e-3;
  if (lin(out) && lin(inn)) return 'linear';
  if (ease(out) && lin(inn)) return 'easeIn';
  if (lin(out) && ease(inn)) return 'easeOut';
  if (ease(out) && ease(inn)) return 'easeInOut';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Curve math

function bez(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const v = 1 - u;
  return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3;
}

/** Find u with bez(x…, u) = x by bisection (the x curve is monotonic for handles inside the segment). */
function solveU(x1: number, x2: number, x: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (bez(0, x1, x2, 1, mid) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Progress 0..1 through a segment at time fraction `x` (0..1), given the leaving side of the
 * first key and the arriving side of the second. Linear sides act as bezier handles at linear
 * speed, so mixing linear and eased sides gives a smooth half-ease.
 */
export function progress(out: Side, inn: Side, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (out.interp === 'hold') return 0;
  if (out.interp === 'linear' && inn.interp !== 'bezier') return x;
  const s0 = out.interp === 'bezier' ? out.slope : 1;
  const s1 = inn.interp === 'bezier' ? inn.slope : 1;
  const i0 = Math.min(1, Math.max(0.01, out.interp === 'bezier' ? out.influence : 1 / 3));
  const i1 = Math.min(1, Math.max(0.01, inn.interp === 'bezier' ? inn.influence : 1 / 3));
  // time handles; keep them from crossing so the curve stays a function of time
  let t1 = i0;
  let t2 = 1 - i1;
  if (t1 > t2) {
    const k = 1 / (i0 + i1);
    t1 = i0 * k;
    t2 = 1 - i1 * k;
  }
  const u = solveU(t1, t2, x);
  return bez(0, s0 * t1, 1 - s1 * (1 - t2), 1, u);
}

function mix(a: Value, b: Value, t: number): Value {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  const av = a as Vec2;
  const bv = b as Vec2;
  return [av[0] + (bv[0] - av[0]) * t, av[1] + (bv[1] - av[1]) * t];
}

/** The value of a property at a (possibly fractional) frame. Before the first key / after the last it holds. */
export function valueAt<T extends Value>(p: Prop<T>, f: number): T {
  const k = p.keys;
  if (!k.length) return p.value;
  const first = k[0]!;
  if (f <= first.f) return first.v;
  const last = k[k.length - 1]!;
  if (f >= last.f) return last.v;
  // binary search for the segment
  let lo = 0;
  let hi = k.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (k[mid]!.f <= f) lo = mid;
    else hi = mid;
  }
  const a = k[lo]!;
  const b = k[hi]!;
  const x = (f - a.f) / (b.f - a.f);
  return mix(a.v, b.v, progress(a.out, b.in, x)) as T;
}

/** Is the property animated (has at least one key)? */
export function isAnimated(p: Prop): boolean {
  return p.keys.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Editing (pure: every function returns a new Prop)

export function staticProp(value: number): Prop<number>;
export function staticProp<T extends Value>(value: T): Prop<T>;
export function staticProp<T extends Value>(value: T): Prop<T> {
  return { value, keys: [] };
}

/**
 * Set a key at frame `f`. Replaces an existing key's value there (keeping its easing); a new key
 * takes the easing used last (`ease`, default linear) on both sides, as Procreate Dreams does.
 * With `alsoAtStart` (Dreams' "Add keyframe at start") and no keys yet, a key holding the current
 * value is added at `start` too, so motion begins at once.
 */
export function setKey<T extends Value>(p: Prop<T>, f: number, v: T, ease: Easing = 'linear', alsoAtStart?: number): Prop<T> {
  const frame = Math.round(f);
  const keys = p.keys.map((k) => ({ ...k }));
  const sides = easingSides(ease);
  const make = (at: number, value: T): Key<T> => ({ f: at, v: value, in: sides.in, out: sides.out });
  if (!keys.length && alsoAtStart !== undefined && Math.round(alsoAtStart) !== frame) keys.push(make(Math.round(alsoAtStart), p.value));
  const i = keys.findIndex((k) => k.f === frame);
  if (i >= 0) keys[i] = { ...keys[i]!, v };
  else keys.push(make(frame, v));
  keys.sort((a, b) => a.f - b.f);
  return { value: keys.length ? keys[0]!.v : v, keys };
}

/** Remove the key at frame `f`. Removing the last key leaves the value it had. */
export function removeKey<T extends Value>(p: Prop<T>, f: number): Prop<T> {
  const keys = p.keys.filter((k) => k.f !== f);
  if (keys.length === p.keys.length) return p;
  return { value: keys.length ? p.value : valueAt(p, f), keys };
}

/** Move a key to another frame (it replaces a key already there). */
export function moveKey<T extends Value>(p: Prop<T>, from: number, to: number): Prop<T> {
  const k = p.keys.find((x) => x.f === from);
  const at = Math.round(to);
  if (!k || at === from) return p;
  const keys = p.keys.filter((x) => x.f !== from && x.f !== at).concat([{ ...k, f: at }]);
  keys.sort((a, b) => a.f - b.f);
  return { ...p, keys };
}

/** Set the easing of the segment that starts at the key on frame `f`. */
export function setSegmentEasing<T extends Value>(p: Prop<T>, f: number, e: Easing): Prop<T> {
  const i = p.keys.findIndex((k) => k.f === f);
  if (i < 0 || i >= p.keys.length - 1) return p;
  const s = easingSides(e);
  const keys = p.keys.map((k) => ({ ...k }));
  keys[i] = { ...keys[i]!, out: s.out };
  keys[i + 1] = { ...keys[i + 1]!, in: s.in };
  return { ...p, keys };
}

/** Dreams' "Set all easings": every segment of the property. */
export function setAllEasings<T extends Value>(p: Prop<T>, e: Easing): Prop<T> {
  let q = p;
  for (const k of p.keys.slice(0, -1)) q = setSegmentEasing(q, k.f, e);
  return q;
}

/**
 * Mirror keys in time between frames `a` and `b` (inclusive), about their middle. Easing flips
 * with them (an ease-out becomes an ease-in), so the motion plays exactly backwards.
 */
export function reverseKeys<T extends Value>(p: Prop<T>, a: number, b: number): Prop<T> {
  const inside = p.keys.filter((k) => k.f >= a && k.f <= b);
  if (inside.length < 2) return p;
  const lo = inside[0]!.f;
  const hi = inside[inside.length - 1]!.f;
  const flipped = inside.map((k) => ({ ...k, f: lo + hi - k.f, in: k.out, out: k.in }));
  const keys = p.keys.filter((k) => k.f < lo || k.f > hi).concat(flipped);
  keys.sort((x, y) => x.f - y.f);
  return { ...p, keys };
}

/** Shift all keys by `df` frames (moving a layer in time keeps its animation attached). */
export function shiftKeys<T extends Value>(p: Prop<T>, df: number): Prop<T> {
  if (!df || !p.keys.length) return p;
  return { ...p, keys: p.keys.map((k) => ({ ...k, f: k.f + df })) };
}

/**
 * Spacing ticks between two keys: for each frame strictly between them, how far along (0..1) the
 * value is. Evenly spread = linear; bunched at the start = eases out of the first key. This is the
 * visual Procreate Dreams shows to teach easing.
 */
export function spacingTicks(p: Prop, f: number): number[] {
  const i = p.keys.findIndex((k) => k.f === f);
  const a = p.keys[i];
  const b = p.keys[i + 1];
  if (!a || !b) return [];
  const out: number[] = [];
  for (let t = a.f + 1; t < b.f; t++) out.push(progress(a.out, b.in, (t - a.f) / (b.f - a.f)));
  return out;
}

/**
 * Blender F-curve handles for one dimension of a segment (frame, value pairs), so the add-on can
 * reproduce the exact curve. Returns [right handle of key A, left handle of key B].
 */
export function blenderHandles(a: { f: number; v: number; out: Side }, b: { f: number; v: number; in: Side }): [[number, number], [number, number]] {
  const dt = b.f - a.f;
  const dv = b.v - a.v;
  const side = (s: Side) => (s.interp === 'bezier' ? { slope: s.slope, inf: s.influence } : { slope: 1, inf: 1 / 3 });
  const o = side(a.out);
  const i = side(b.in);
  return [
    [a.f + o.inf * dt, a.v + o.slope * o.inf * dv],
    [b.f - i.inf * dt, b.v - i.slope * i.inf * dv],
  ];
}
