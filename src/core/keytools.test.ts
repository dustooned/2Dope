import { describe, expect, it } from 'vitest';
import { setKey, staticProp, valueAt, type Prop, type Vec2 } from './anim';
import { loopKeys, smoothKeys, staggerOffsets, wiggle, WIGGLE_DEFAULTS } from './keytools';

const ramp = (): Prop<number> => setKey(setKey(staticProp(0), 0, 0), 30, 300);
const point = (): Prop<Vec2> => setKey(setKey(staticProp<Vec2>([0, 0]), 0, [0, 0]), 24, [240, 0]);

describe('wiggle', () => {
  it('adds keys every fps/frequency frames between the ends and leaves the ends alone', () => {
    const w = wiggle(ramp(), 0, 30, 30, { ...WIGGLE_DEFAULTS, frequency: 5, seed: 7 });
    expect(w.keys.map((k) => k.f)).toEqual([0, 6, 12, 18, 24, 30]);
    expect(w.keys[0]!.v).toBe(0);
    expect(w.keys[5]!.v).toBe(300);
  });

  it('stays within ±magnitude of the motion underneath', () => {
    for (const smooth of [0, 0.5, 1]) {
      const w = wiggle(ramp(), 0, 30, 30, { ...WIGGLE_DEFAULTS, magnitude: 12, smooth, seed: 3 });
      for (const k of w.keys.slice(1, -1)) expect(Math.abs(k.v - valueAt(ramp(), k.f))).toBeLessThanOrEqual(12 + 1e-9);
    }
  });

  it('is reproducible by seed and changes with a new seed', () => {
    const a = wiggle(ramp(), 0, 30, 30, { ...WIGGLE_DEFAULTS, seed: 42 });
    expect(wiggle(ramp(), 0, 30, 30, { ...WIGGLE_DEFAULTS, seed: 42 })).toEqual(a);
    expect(wiggle(ramp(), 0, 30, 30, { ...WIGGLE_DEFAULTS, seed: 43 })).not.toEqual(a);
  });

  it('can wiggle one axis of a point', () => {
    const w = wiggle(point(), 0, 24, 24, { ...WIGGLE_DEFAULTS, dims: 'x', seed: 5 });
    expect(w.keys.length).toBeGreaterThan(2);
    for (const k of w.keys) expect(k.v[1]).toBe(0);
    expect(w.keys.slice(1, -1).some((k) => k.v[0] !== valueAt(point(), k.f)[0])).toBe(true);
  });

  it('keeps keys that were already between the ends', () => {
    const p = setKey(ramp(), 6, 999);
    const w = wiggle(p, 0, 30, 30, { ...WIGGLE_DEFAULTS, seed: 1 });
    expect(w.keys.find((k) => k.f === 6)!.v).toBe(999);
  });
});

describe('smooth keys', () => {
  it('drops jittery keys within the tolerance and keeps the ends', () => {
    let p: Prop<number> = staticProp(0);
    for (let f = 0; f <= 60; f++) p = setKey(p, f, f * 2 + (f % 2 ? 0.4 : -0.4));
    const s = smoothKeys(p, 0, 60, 1);
    expect(s.keys.length).toBeLessThan(10);
    expect(s.keys[0]!.f).toBe(0);
    expect(s.keys.at(-1)!.f).toBe(60);
    for (let f = 0; f <= 60; f++) expect(Math.abs(valueAt(s, f) - valueAt(p, f))).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('removes nothing at tolerance 0 when every key matters', () => {
    const p = setKey(ramp(), 15, 0);
    expect(smoothKeys(p, 0, 30, 0).keys).toHaveLength(3);
  });
});

describe('loop keys', () => {
  it('cycles, ping-pongs and offsets a range', () => {
    const p = setKey(setKey(staticProp(0), 0, 0), 10, 100);
    const c = loopKeys(p, 0, 10, 'cycle', 2);
    expect(c.keys.map((k) => [k.f, k.v])).toEqual([[0, 0], [10, 100], [20, 100], [30, 100]]);
    const three = setKey(setKey(setKey(staticProp(0), 0, 0), 5, 50), 10, 100);
    expect(loopKeys(three, 0, 10, 'cycle', 1).keys.map((k) => [k.f, k.v])).toEqual([[0, 0], [5, 50], [10, 100], [15, 50], [20, 100]]);
    expect(loopKeys(three, 0, 10, 'pingpong', 1).keys.map((k) => [k.f, k.v])).toEqual([[0, 0], [5, 50], [10, 100], [15, 50], [20, 0]]);
    expect(loopKeys(p, 0, 10, 'offset', 2).keys.map((k) => [k.f, k.v])).toEqual([[0, 0], [10, 100], [20, 200], [30, 300]]);
  });

  it('replaces keys inside the new range and keeps later ones', () => {
    const p = setKey(setKey(setKey(setKey(staticProp(0), 0, 0), 10, 100), 14, 7), 50, 9);
    const l = loopKeys(p, 0, 10, 'cycle', 1);
    expect(l.keys.map((k) => k.f)).toEqual([0, 10, 20, 50]);
  });
});

describe('stagger', () => {
  it('offsets layers in order, reverse or a seeded random order', () => {
    expect(staggerOffsets(4, 3, 'order')).toEqual([0, 3, 6, 9]);
    expect(staggerOffsets(4, 3, 'reverse')).toEqual([9, 6, 3, 0]);
    const r = staggerOffsets(6, 2, 'random', 9);
    expect([...r].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(staggerOffsets(6, 2, 'random', 9)).toEqual(r);
  });
});
