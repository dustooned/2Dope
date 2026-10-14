import type { Prop, Value } from './anim';
import { layerEnd, PART_NAMES, type Comp, type Layer } from './comp';
import { locate, totalFrames, type Exposure } from './timeline';

/**
 * Ripple edits (doc 16, "Live edits"): when a timeline gets longer or shorter at a frame, everything
 * after that frame moves with it, on every layer of the comp, so the board, the drawings, the camera
 * and (later) audio and video stay lined up. Pure functions; the app wraps them in one undo step.
 *
 * The rule, for an edit at comp frame `P` that adds `delta` frames (negative = removes):
 * - a layer that starts at or after P shifts by delta;
 * - a layer that spans P stretches there: a plain drawings layer holds the drawing showing just
 *   before P longer (or loses the frames from P on), and keys after P move by delta;
 * - a layer that ends at or before P stays as it is.
 */

/** Keys moved for an edit at layer frame `at`: later keys shift; keys inside a removed span collapse onto `at`. */
export function rippleProp<T extends Value>(p: Prop<T>, at: number, delta: number): Prop<T> {
  if (!delta || !p.keys.length) return p;
  const gone = delta < 0 ? -delta : 0;
  let changed = false;
  const keys = p.keys.map((k) => {
    if (k.f < at) return k;
    changed = true;
    if (delta > 0) return { ...k, f: k.f + delta };
    return { ...k, f: k.f >= at + gone ? k.f + delta : at };
  });
  if (!changed) return p;
  // two keys can land on one frame after a removal: the later one wins
  const byFrame = new Map<number, (typeof keys)[number]>();
  for (const k of keys) byFrame.set(k.f, k);
  return { ...p, keys: [...byFrame.values()].sort((a, b) => a.f - b.f) };
}

/**
 * A drawings layer's timing stretched at layer frame `at`: adding frames lengthens the hold showing
 * just before `at` (the drawing on screen keeps going); removing frames cuts them from `at` on.
 * Never leaves the layer empty.
 */
export function rippleExposures(ex: Exposure[], at: number, delta: number): Exposure[] {
  const total = totalFrames(ex);
  // adding needs a hold before `at` to lengthen; removing can start at the very first frame
  if (!delta || (delta > 0 ? at <= 0 : at < 0) || at >= total + (delta > 0 ? 1 : 0)) return ex;
  const out = ex.map((e) => ({ ...e }));
  if (delta > 0) {
    const l = locate(ex, at - 1);
    if (!l) return ex;
    out[l.index]!.length += delta;
    return out;
  }
  let cut = -delta;
  let pos = 0;
  for (const e of out) {
    const start = pos;
    pos += e.length;
    if (cut <= 0 || pos <= at) continue;
    const from = Math.max(at, start);
    const take = Math.min(cut, pos - from);
    e.length -= take;
    cut -= take;
  }
  const kept = out.filter((e) => e.length > 0);
  return kept.length ? kept : [{ ...ex[ex.length - 1]!, length: 1 }];
}

/** Every keyed property of a layer, moved for an edit at layer frame `at`. */
function rippleLayerKeys(l: Layer, at: number, delta: number): void {
  const t = l.transform;
  t.anchor = rippleProp(t.anchor, at, delta);
  t.position = rippleProp(t.position, at, delta);
  t.scale = rippleProp(t.scale, at, delta);
  t.rotation = rippleProp(t.rotation, at, delta);
  t.opacity = rippleProp(t.opacity, at, delta);
  if (l.kind === 'camera') l.zoom = rippleProp(l.zoom, at, delta);
  if (l.kind === 'comp') l.overrides = Object.fromEntries(Object.entries(l.overrides).map(([k, p]) => [k, rippleProp(p, at, delta)]));
  if (l.kind === 'drawings' && l.parts) {
    for (const n of PART_NAMES) {
      const part = l.parts[n];
      if (part) l.parts[n] = { ...part, opacity: rippleProp(part.opacity, at, delta), offset: rippleProp(part.offset, at, delta) };
    }
  }
}

/** Does this drawings layer show its frames one for one (so its timing can be stretched in place)? */
function plain(l: Layer): boolean {
  return l.kind === 'drawings' && l.play === 'once' && l.speed === 1 && !l.timeRemap?.keys.length;
}

/**
 * Ripple a comp's layers for an edit at comp frame `P` adding `delta` frames. `edited` is the layer
 * whose own timing was already changed (its exposures are left alone; its keys and out point move).
 * Returns a new layer list (the input is not changed) and the comp's new set duration.
 */
export function rippleComp(c: Comp, comps: ReadonlyMap<string, Comp>, edited: string | null, P: number, delta: number): { layers: Layer[]; duration: number | null } {
  if (!delta) return { layers: c.layers, duration: c.duration };
  const layers = c.layers.map((orig) => {
    const end = layerEnd(orig, comps, c.fps);
    const l = structuredClone(orig);
    if (l.id === edited) {
      rippleLayerKeys(l, P - l.start, delta);
      if (l.out !== null && l.out > P) l.out = Math.max(l.in + 1, l.out + delta);
      return l;
    }
    if (l.in >= P) {
      // starts after the edit: the whole layer moves. When frames are removed it moves back at
      // most to the edit point: a layer that started inside the removed span (or right at it)
      // must not slide before it (and never before the shot's first frame).
      // a plain drawings layer starting inside the removed span loses the frames that were in it
      // (deleting the first board panel removes the animation drawn for it), so the rest stays in step
      if (delta < 0 && l.kind === 'drawings' && plain(l) && l.start === l.in && l.in < P - delta) {
        const cut = Math.min(P - delta - l.in, totalFrames(l.exposures) - 1);
        if (cut > 0) l.exposures = rippleExposures(l.exposures, 0, -cut);
        l.start = P;
        l.in = P;
        if (l.out !== null) l.out = Math.max(P + 1, l.out + delta);
        return l;
      }
      const shift = delta < 0 ? Math.max(delta, P - l.in) : delta;
      l.start += shift;
      l.in += shift;
      if (l.out !== null) l.out += shift;
      return l;
    }
    if (end <= P) return orig; // over before the edit
    // spans the edit point: stretch it there
    const at = P - l.start;
    if (l.kind === 'drawings' && plain(l)) l.exposures = rippleExposures(l.exposures, at, delta);
    rippleLayerKeys(l, at, delta);
    if (l.out !== null && l.out > P) l.out = Math.max(l.in + 1, l.out + delta);
    return l;
  });
  const duration = c.duration !== null && c.duration > P ? Math.max(1, c.duration + delta) : c.duration;
  return { layers, duration };
}

/**
 * Where two timings of the same layer first differ, in layer frames, and by how much the length
 * changed: the edit point of an add / delete / hold change. null when the length did not change.
 */
export function editPoint(before: Exposure[], after: Exposure[]): { at: number; delta: number } | null {
  const delta = totalFrames(after) - totalFrames(before);
  if (!delta) return null;
  let at = 0;
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const a = before[i];
    const b = after[i];
    if (a && b && a.drawing === b.drawing && a.length === b.length) {
      at += a.length;
      continue;
    }
    // a hold that changed length: the edit is at the end of its shorter version
    if (a && b && a.drawing === b.drawing) at += Math.min(a.length, b.length);
    break;
  }
  return { at, delta };
}

/** Layers after comp frame `P` moved by `delta` (a trim in Motion: nothing is stretched). */
export function shiftLater(layers: Layer[], except: string, P: number, delta: number): Layer[] {
  if (!delta) return layers;
  return layers.map((orig) => {
    if (orig.id === except || orig.in < P) return orig;
    const l = structuredClone(orig);
    l.start += delta;
    l.in += delta;
    if (l.out !== null) l.out += delta;
    return l;
  });
}
