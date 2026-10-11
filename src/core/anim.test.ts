import { describe, expect, it } from 'vitest';
import { blenderHandles, easingOf, easingSides, moveKey, progress, removeKey, reverseKeys, setAllEasings, setKey, setSegmentEasing, shiftKeys, spacingTicks, staticProp, valueAt, type Prop } from './anim';

const two = (e: Parameters<typeof easingSides>[0] = 'linear'): Prop<number> => setKey(setKey(staticProp(0), 0, 0, e), 10, 100, e);

describe('keyframes', () => {
  it('holds a static value, and holds before the first and after the last key', () => {
    expect(valueAt(staticProp(5), 3)).toBe(5);
    const p = two();
    expect(valueAt(p, -5)).toBe(0);
    expect(valueAt(p, 50)).toBe(100);
  });

  it('linear interpolates evenly, for numbers and points', () => {
    expect(valueAt(two(), 5)).toBeCloseTo(50);
    const v = setKey(setKey(staticProp<[number, number]>([0, 0]), 0, [0, 0]), 4, [40, -8]);
    expect(valueAt(v, 1)).toEqual([10, -2]);
  });

  it('ease in starts slow, ease out ends slow, in-out is symmetric', () => {
    const inn = valueAt(setSegmentEasing(two(), 0, 'easeIn'), 2);
    const out = valueAt(setSegmentEasing(two(), 0, 'easeOut'), 2);
    expect(inn).toBeLessThan(20);
    expect(out).toBeGreaterThan(20);
    const io = setSegmentEasing(two(), 0, 'easeInOut');
    expect(valueAt(io, 5)).toBeCloseTo(50, 5);
    expect(valueAt(io, 2) + valueAt(io, 8)).toBeCloseTo(100, 5);
    expect(valueAt(io, 1)).toBeLessThan(10);
  });

  it('progress is monotonic and stays within 0..1 for every preset', () => {
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      const s = easingSides(e);
      let prev = 0;
      for (let i = 1; i <= 100; i++) {
        const y = progress(s.out, s.in, i / 100);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(y).toBeLessThanOrEqual(1 + 1e-9);
        prev = y;
      }
      expect(prev).toBeCloseTo(1);
    }
  });

  it('hold keeps the value until the next key', () => {
    const p = setSegmentEasing(two(), 0, 'hold');
    expect(valueAt(p, 9.9)).toBe(0);
    expect(valueAt(p, 10)).toBe(100);
  });

  it('presets are recognised back from their sides', () => {
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'] as const) {
      const s = easingSides(e);
      expect(easingOf(s.out, s.in)).toBe(e);
    }
  });

  it('a new key takes the last easing; setting an existing key keeps its easing', () => {
    let p = setKey(staticProp(0), 0, 0, 'easeInOut');
    p = setKey(p, 10, 100, 'easeInOut');
    expect(easingOf(p.keys[0]!.out, p.keys[1]!.in)).toBe('easeInOut');
    p = setKey(p, 10, 50, 'linear');
    expect(p.keys).toHaveLength(2);
    expect(p.keys[1]!.v).toBe(50);
    expect(easingOf(p.keys[0]!.out, p.keys[1]!.in)).toBe('easeInOut');
  });

  it('"add keyframe at start" keeps the old value at the start so motion begins at once', () => {
    const p = setKey(staticProp(7), 12, 20, 'linear', 0);
    expect(p.keys.map((k) => [k.f, k.v])).toEqual([
      [0, 7],
      [12, 20],
    ]);
  });

  it('remove, move and shift keys', () => {
    let p = two();
    p = removeKey(p, 10);
    expect(p.keys).toHaveLength(1);
    p = removeKey(p, 0);
    expect(p.keys).toHaveLength(0);
    expect(valueAt(p, 3)).toBe(0);
    const m = moveKey(two(), 10, 20);
    expect(valueAt(m, 10)).toBeCloseTo(50);
    expect(shiftKeys(two(), 5).keys.map((k) => k.f)).toEqual([5, 15]);
  });

  it('reversing keys plays the motion backwards (easing flips too)', () => {
    let p = setKey(two('easeIn'), 20, 0, 'easeIn');
    p = setAllEasings(p, 'easeIn');
    const r = reverseKeys(p, 0, 20);
    for (let f = 0; f <= 20; f++) expect(valueAt(r, f)).toBeCloseTo(valueAt(p, 20 - f), 6);
  });

  it('spacing ticks bunch up where the motion is slow', () => {
    expect(spacingTicks(two(), 0).map((x) => +x.toFixed(2))).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const t = spacingTicks(setSegmentEasing(two(), 0, 'easeIn'), 0);
    expect(t[1]! - t[0]!).toBeLessThan(t[8]! - t[7]!);
  });

  it('Blender handles reproduce linear as one-third handles on the straight line', () => {
    const p = two();
    const [r, l] = blenderHandles({ f: 0, v: 0, out: p.keys[0]!.out }, { f: 10, v: 100, in: p.keys[1]!.in });
    expect(r[0]).toBeCloseTo(10 / 3);
    expect(r[1]).toBeCloseTo(100 / 3);
    expect(l[0]).toBeCloseTo(20 / 3);
    expect(l[1]).toBeCloseTo(200 / 3);
    const e = setSegmentEasing(two(), 0, 'easeInOut');
    const [r2] = blenderHandles({ f: 0, v: 0, out: e.keys[0]!.out }, { f: 10, v: 100, in: e.keys[1]!.in });
    expect(r2[1]).toBe(0); // flat handle = eased to a stop
  });
});
