import { describe, expect, it } from 'vitest';
import { LINEAR, valueAt, type Key, type Vec2 } from './anim';
import { MOTION_PRESETS, presetFrames, presetKeys, withPresetKeys, type MotionPresetId, type PresetBase } from './motionpresets';

const base: PresetBase = { position: [200, 150], scale: [100, 100], rotation: 10, opacity: 80 };
const size = { width: 400, height: 300 };
const keysOf = (id: MotionPresetId, prop: string, f0 = 5, fps = 12) => presetKeys(id, base, f0, fps, size).find((p) => p.prop === prop)?.keys ?? [];
const asProp = (keys: Key[]) => ({ value: keys[0]!.v, keys });

describe('Motion presets', () => {
  it('last about as long as they say, at any frame rate, and never less than two frames', () => {
    expect(presetFrames('bounce', 12)).toBe(12);
    expect(presetFrames('bounce', 24)).toBe(24);
    expect(presetFrames('shake', 12)).toBe(5);
    expect(presetFrames('shake', 1)).toBeGreaterThanOrEqual(2);
  });
  it('write keys that start at the playhead, in order, one per frame', () => {
    for (const p of MOTION_PRESETS) for (const set of presetKeys(p.id, base, 7, 12, size)) {
      expect(set.keys[0]!.f).toBe(7);
      expect(set.keys.every((k, i) => i === 0 || k.f > set.keys[i - 1]!.f)).toBe(true);
    }
  });
  it('are relative to where the layer is', () => {
    const moved = presetKeys('bounce', { ...base, position: [50, 60] }, 0, 12, size)[0]!.keys;
    expect(moved[0]!.v).toEqual([50, 60]);
    expect((moved[1]!.v as Vec2)[0]).toBe(50);
    expect(keysOf('wobble', 'rotation')[0]!.v).toBe(10);
  });
  it('Bounce goes up, lands, rebounds and ends where it began', () => {
    const k = keysOf('bounce', 'position').map((x) => x.v as Vec2);
    expect(k[0]).toEqual([200, 150]); expect(k[k.length - 1]).toEqual([200, 150]);
    expect(k[1]![1]).toBeLessThan(150); // up is smaller y
    expect(k[3]![1]).toBeLessThan(150); expect(k[3]![1]).toBeGreaterThan(k[1]![1]); // a smaller second hop
  });
  it('Pop in starts from nothing, overshoots and settles at the layer size and opacity', () => {
    const s = keysOf('pop', 'scale').map((x) => x.v as Vec2), o = keysOf('pop', 'opacity').map((x) => x.v);
    expect(s[0]).toEqual([0, 0]); expect(s[1]![0]).toBeGreaterThan(100); expect(s[2]).toEqual([100, 100]);
    expect(o[0]).toBe(0); expect(o[o.length - 1]).toBe(80);
  });
  it('Spin turns exactly once, Slide in arrives where the layer is, Fade out ends clear', () => {
    const r = keysOf('spin', 'rotation'); expect(r[r.length - 1]!.v).toBe(370);
    const s = keysOf('slide', 'position'); expect((s[0]!.v as Vec2)[0]).toBeLessThan(0); expect(s[1]!.v).toEqual([200, 150]);
    const f = keysOf('fadeout', 'opacity'); expect(f[0]!.v).toBe(80); expect(f[1]!.v).toBe(0);
  });
  it('Shake dies away and ends where it began; Float and Pulse return so they can loop', () => {
    const sh = keysOf('shake', 'position').map((x) => (x.v as Vec2)[0] - 200);
    expect(sh[sh.length - 1]).toBe(0);
    expect(Math.abs(sh[1]!)).toBeGreaterThan(Math.abs(sh[sh.length - 2]!));
    for (const [id, prop] of [['float', 'position'], ['pulse', 'scale']] as const) {
      const k = keysOf(id, prop); expect(k[0]!.v).toEqual(k[k.length - 1]!.v);
    }
  });
  it('Bounce lands fast and rises into its peak slowly (speed from the key sides)', () => {
    const k = keysOf('bounce', 'position');
    expect(k[0]!.out).toEqual(LINEAR); expect(k[1]!.in.interp).toBe('bezier'); expect(k[1]!.in.slope).toBe(0);
  });
  it('scale distances with the shot, so a bounce is not tiny on a big page', () => {
    const small = presetKeys('bounce', base, 0, 12, { width: 400, height: 300 })[0]!.keys[1]!.v as Vec2;
    const big = presetKeys('bounce', base, 0, 12, { width: 1920, height: 1080 })[0]!.keys[1]!.v as Vec2;
    expect(150 - big[1]).toBeGreaterThan(150 - small[1]);
  });
});

describe('writing preset keys over existing ones', () => {
  const mk = (f: number, v: number): Key<number> => ({ f, v, in: LINEAR, out: LINEAR });
  it('replaces keys inside the preset, keeps the ones outside and keeps them in order', () => {
    const out = withPresetKeys([mk(0, 1), mk(8, 2), mk(30, 3)], 1, [mk(5, 10), mk(10, 20), mk(15, 30)]);
    expect(out.keys.map((k) => k.f)).toEqual([0, 5, 10, 15, 30]);
    expect(out.keys.map((k) => k.v)).toEqual([1, 10, 20, 30, 3]);
  });
  it('starts a property with no keys at the preset', () => {
    const out = withPresetKeys([], 7, [mk(3, 70), mk(6, 80)]);
    expect(out.keys.map((k) => k.f)).toEqual([3, 6]); expect(out.value).toBe(70);
    expect(valueAt(asProp(out.keys) as never, 4.5)).toBeCloseTo(75, 0);
  });
});
