import { describe, expect, it } from 'vitest';
import { scaleKeyTimes, setKey, staticProp, valueAt } from './anim';

const track = (frames: number[]) => frames.reduce((p, f, i) => setKey(p, f, i * 10), staticProp(0));

describe('stretching key timing', () => {
  it('doubles the spacing from the first key and keeps the values in order', () => {
    const p = scaleKeyTimes(track([10, 14, 20]), new Set([10, 14, 20]), 10, 2);
    expect(p.keys.map((k) => k.f)).toEqual([10, 18, 30]);
    expect(p.keys.map((k) => k.v)).toEqual([0, 10, 20]);
    expect(valueAt(p, 30)).toBe(20);
  });
  it('squeezes without two keys sharing a frame, never before frame 0', () => {
    const p = scaleKeyTimes(track([0, 1, 2, 3]), new Set([0, 1, 2, 3]), 0, 0.2);
    expect(p.keys.map((k) => k.f)).toEqual([0, 1, 2, 3]);
    const q = scaleKeyTimes(track([5, 6, 20]), new Set([5, 6, 20]), 20, 3);
    expect(q.keys.map((k) => k.f)).toEqual([0, 1, 20]);
  });
  it('moves only the selected keys; a moved key replaces one it lands on', () => {
    const p = scaleKeyTimes(track([0, 10, 20, 30]), new Set([10, 20]), 10, 2);
    expect(p.keys.map((k) => k.f)).toEqual([0, 10, 30]);
    expect(p.keys.find((k) => k.f === 30)!.v).toBe(20);
  });
});
