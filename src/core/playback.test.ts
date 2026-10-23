import { describe, expect, it } from 'vitest';
import { loopFrame, playbackBounds, readRangeGesture } from './playback';
import { newComp, compLength } from './comp';
import { compFile, compsFromFile, validateProjectFile } from '../io/schema';
import { mixSound } from '../io/soundmix';

describe('playback range', () => {
  it('opts into the ruler gesture only for an explicitly saved boolean', () => {
    expect(readRangeGesture(true)).toBe(true);
    for (const saved of [undefined, null, false, 1, 'true', {}, []]) expect(readRangeGesture(saved)).toBe(false);
  });
  it('defaults to the complete shot, including an empty shot', () => {
    expect(playbackBounds(undefined, 24)).toEqual({ start: 0, end: 24 });
    expect(playbackBounds(undefined, 0)).toEqual({ start: 0, end: 1 });
  });
  it('clamps preview edges after shortening without mutating saved edges', () => {
    const range = { start: 10, end: 20 };
    expect(playbackBounds(range, 15)).toEqual({ start: 10, end: 15 });
    expect(playbackBounds(range, 5)).toEqual({ start: 4, end: 5 });
    expect(playbackBounds(range, 30)).toEqual(range);
    expect(range).toEqual({ start: 10, end: 20 });
  });
  it('loops inclusive first/last frames, large elapsed times and negative look-behind', () => {
    const range = { start: 4, end: 8 };
    expect([4, 5, 6, 7, 8, 9, 100008, -1].map(f => loopFrame(f, range))).toEqual([4, 5, 6, 7, 4, 5, 4, 7]);
    expect(loopFrame(999999, { start: 9, end: 10 })).toBe(9);
  });
  const fixture = () => {
    const c = newComp('c1', 'Shot', 64, 64, 12); c.duration = 24;
    return { format: '2dope', schema: 3, canvas: { width: 64, height: 64 }, main: 'c1', comps: { c1: compFile(c) }, folders: {}, drawings: {} };
  };
  it('round-trips the optional interval independently per comp without changing duration', () => {
    const raw = fixture(); raw.comps.c1.playbackRange = { start: 4, end: 8 };
    const file = validateProjectFile(raw), comps = compsFromFile(file), c = comps.get('c1')!;
    expect(c.playbackRange).toEqual({ start: 4, end: 8 });
    expect(compLength(c, comps)).toBe(24);
    expect(compFile(c).playbackRange).toEqual({ start: 4, end: 8 });
    c.playbackRange!.start = 5; expect(file.comps.c1!.playbackRange!.start).toBe(4);
    delete raw.comps.c1.playbackRange;
    expect(compsFromFile(validateProjectFile(raw)).get('c1')!.playbackRange).toBeUndefined();
  });
  it('rejects malformed ranges but retains valid saved edges beyond a shortened shot', () => {
    for (const range of [null, {}, { start: -1, end: 2 }, { start: 2, end: 2 }, { start: 3, end: 1 }, { start: 1.5, end: 3 }, { start: 0, end: Infinity }, { start: 0, end: 1000001 }]) {
      const raw = fixture(); Object.assign(raw.comps.c1, { playbackRange: range });
      expect(() => validateProjectFile(raw)).toThrow(/playback range/);
    }
    const raw = fixture(); raw.comps.c1.playbackRange = { start: 30, end: 50 };
    expect(validateProjectFile(raw).comps.c1!.playbackRange).toEqual({ start: 30, end: 50 });
  });
  it('audio wraps at nonzero range edges within a queue chunk; normal exports keep all samples', () => {
    const samples = Float32Array.from([0, .1, .2, .3, .4, .5, .6, .7]);
    const bank = { get: () => ({ sampleRate: 4, numberOfChannels: 1, getChannelData: () => samples }) as unknown as AudioBuffer };
    const times: number[] = [], voices = [{ asset: 'a', gain: 1, sourceTime(t: number) { times.push(t); return t; } }];
    const [left] = mixSound(voices, bank, 1.25, 8, 4, 1, .5);
    expect(times).toEqual([1.25, .5, .75, 1, 1.25, .5, .75, 1]);
    expect([...left].map(n => Math.round(n * 10))).toEqual([5, 2, 3, 4, 5, 2, 3, 4]);
    times.length = 0; mixSound(voices, bank, 0, 8, 4);
    expect(times).toEqual([0, .25, .5, .75, 1, 1.25, 1.5, 1.75]);
  });
});
