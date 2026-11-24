/**
 * Motion presets: one-tap simple motion for a layer (Pop in, Bounce, Pulse, Float, Spin, Wobble,
 * Shake, Slide in, Fade in, Fade out). A preset is nothing special: it writes ordinary keyframes
 * from the playhead, relative to where the layer is, so a student can edit, ease or delete them
 * like any other keys. Pure maths; core/compedit applies them as one undo step.
 */
import { EASED, LINEAR, type Key, type Side, type Value, type Vec2 } from './anim';

export type MotionPresetId = 'pop' | 'bounce' | 'pulse' | 'float' | 'spin' | 'wobble' | 'shake' | 'slide' | 'fadein' | 'fadeout';
export type MotionProp = 'position' | 'scale' | 'rotation' | 'opacity';

export interface MotionPreset {
  id: MotionPresetId;
  label: string;
  hint: string;
  /** How long it takes, in seconds (the frame count follows the shot's frame rate). */
  seconds: number;
  /** Words students use for it (Ask finds the preset by these). */
  words: string;
}

export const MOTION_PRESETS: readonly MotionPreset[] = [
  { id: 'pop', label: 'Pop in', hint: 'Grows from nothing with a little overshoot', seconds: 0.5, words: 'appear grow bounce in entrance start' },
  { id: 'bounce', label: 'Bounce', hint: 'Jumps up and lands with a small rebound', seconds: 1, words: 'jump hop ball' },
  { id: 'pulse', label: 'Pulse', hint: 'Swells and settles, like a heartbeat', seconds: 0.8, words: 'heartbeat beat throb breathe' },
  { id: 'float', label: 'Float', hint: 'Drifts gently up and back down, ready to loop', seconds: 2, words: 'hover drift bob idle' },
  { id: 'spin', label: 'Spin', hint: 'One full turn', seconds: 1, words: 'turn rotate twirl' },
  { id: 'wobble', label: 'Wobble', hint: 'Rocks side to side and settles', seconds: 0.8, words: 'rock swing wiggle tilt' },
  { id: 'shake', label: 'Shake', hint: 'A quick shake that dies away, for a hit or a shock', seconds: 0.4, words: 'jitter rumble impact hit' },
  { id: 'slide', label: 'Slide in', hint: 'Slides in from the left and eases to a stop', seconds: 0.6, words: 'enter come in move across' },
  { id: 'fadein', label: 'Fade in', hint: 'Fades up from nothing', seconds: 0.5, words: 'appear dissolve in' },
  { id: 'fadeout', label: 'Fade out', hint: 'Fades away to nothing', seconds: 0.5, words: 'disappear dissolve out vanish' },
];

/** Where a layer is when a preset starts (the animated values at the playhead). */
export interface PresetBase {
  position: Vec2;
  scale: Vec2;
  rotation: number;
  opacity: number;
}

export interface PresetKeys {
  prop: MotionProp;
  keys: Key<Value>[];
}

export const presetOf = (id: MotionPresetId): MotionPreset => MOTION_PRESETS.find((p) => p.id === id)!;

/** Frames a preset lasts at a frame rate (at least 2). */
export function presetFrames(id: MotionPresetId, fps: number): number {
  return Math.max(2, Math.round(presetOf(id).seconds * Math.max(1, fps)));
}

/**
 * The keys a preset writes, from frame `f0` (layer time): for each property it moves, the keys
 * with their easing. Values are relative to \`base\`; \`size\` (the shot's width and height) scales
 * distances so a bounce is as tall on a big page as on a small one.
 */
export function presetKeys(id: MotionPresetId, base: PresetBase, f0: number, fps: number, size: { width: number; height: number }): PresetKeys[] {
  return rawKeys(id, base, f0, fps, size).map((set) => ({ prop: set.prop, keys: oneKeyPerFrame(set.keys) }));
}

/** Keys on strictly increasing frames: where a short preset would put two on one frame, the later one moves on a frame. */
function oneKeyPerFrame(keys: Key<Value>[]): Key<Value>[] {
  let last = -Infinity;
  return keys.map((k) => { const f = Math.max(k.f, last + 1); last = f; return f === k.f ? k : { ...k, f }; });
}

function rawKeys(id: MotionPresetId, base: PresetBase, f0: number, fps: number, size: { width: number; height: number }): PresetKeys[] {
  const n = presetFrames(id, fps), at = (t: number) => f0 + Math.max(0, Math.round(t * n));
  const key = (t: number, v: Value, inn: Side = EASED, out: Side = EASED): Key<Value> => ({ f: at(t), v, in: inn, out });
  const [px, py] = base.position, [sx, sy] = base.scale;
  const up = Math.round(Math.min(120, size.height * 0.14)), drift = Math.round(Math.min(40, size.height * 0.04));
  const scaled = (k: number): Vec2 => [sx * k, sy * k];
  switch (id) {
    case 'pop':
      return [
        { prop: 'scale', keys: [key(0, scaled(0)), key(0.6, scaled(1.15)), key(1, scaled(1))] },
        { prop: 'opacity', keys: [key(0, 0), key(0.3, base.opacity)] },
      ];
    case 'bounce': {
      // rising slows into the top, falling speeds up into the ground, then a small rebound
      const ground = (t: number): Key<Value> => key(t, [px, py], LINEAR, LINEAR);
      return [{ prop: 'position', keys: [ground(0), key(0.3, [px, py - up]), ground(0.6), key(0.78, [px, py - up * 0.22]), ground(1)] }];
    }
    case 'pulse':
      return [{ prop: 'scale', keys: [key(0, scaled(1)), key(0.4, scaled(1.18)), key(1, scaled(1))] }];
    case 'float':
      return [{ prop: 'position', keys: [key(0, [px, py]), key(0.5, [px, py - drift]), key(1, [px, py])] }];
    case 'spin':
      return [{ prop: 'rotation', keys: [key(0, base.rotation), key(1, base.rotation + 360)] }];
    case 'wobble':
      return [{ prop: 'rotation', keys: [key(0, base.rotation), key(0.2, base.rotation - 10), key(0.45, base.rotation + 8), key(0.7, base.rotation - 4), key(0.88, base.rotation + 1.5), key(1, base.rotation)] }];
    case 'shake': {
      const a = Math.round(Math.min(24, size.width * 0.02));
      return [{ prop: 'position', keys: [key(0, [px, py], LINEAR, LINEAR), key(0.15, [px + a, py], LINEAR, LINEAR), key(0.32, [px - a * 0.8, py], LINEAR, LINEAR), key(0.5, [px + a * 0.55, py], LINEAR, LINEAR), key(0.68, [px - a * 0.35, py], LINEAR, LINEAR), key(0.84, [px + a * 0.15, py], LINEAR, LINEAR), key(1, [px, py], LINEAR, LINEAR)] }];
    }
    case 'slide':
      return [{ prop: 'position', keys: [key(0, [px - size.width * 0.6, py]), key(1, [px, py])] }];
    case 'fadein':
      return [{ prop: 'opacity', keys: [key(0, 0), key(1, base.opacity)] }];
    case 'fadeout':
      return [{ prop: 'opacity', keys: [key(0, base.opacity), key(1, 0)] }];
  }
}

/**
 * A property's keys with a preset's keys written in: any keys already inside the frames the preset
 * covers go (the preset replaces what was there), keys outside stay, and the keys end up in order.
 * With no keys before it, the property's still value is kept at the start so nothing jumps.
 */
export function withPresetKeys<T extends Value>(existing: readonly Key<T>[], value: T, keys: readonly Key<Value>[]): { value: T; keys: Key<T>[] } {
  const first = keys[0]!.f, last = keys[keys.length - 1]!.f;
  const kept = existing.filter((k) => k.f < first || k.f > last);
  const merged = [...kept, ...(keys as Key<T>[])].sort((a, b) => a.f - b.f);
  return { value: merged.length ? merged[0]!.v : value, keys: merged };
}
