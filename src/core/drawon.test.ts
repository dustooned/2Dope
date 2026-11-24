import { describe, expect, it } from 'vitest';
import { PRESETS } from './brush';
import { drawOnStrokes, drawOnWindows, repeatCopy, repeatIndices, type DrawOnSettings, type RepeatSettings } from './drawon';
import type { StrokePoint, StrokeRecord } from './stroke';

const pt = (x: number, y: number): StrokePoint => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, t: x });
/** A horizontal line from x=0 to x=100 (or y=y0) with 101 points: arc length 100. */
const line = (id: string, y = 0): StrokeRecord => ({
  id, tool: 'pen', brush: { ...PRESETS[1]!, size: 2, taperStart: 0, taperEnd: 0 }, color: '#000', seed: 1,
  points: Array.from({ length: 101 }, (_, i) => pt(i, y)),
});
const base: DrawOnSettings = { start: 0, end: 100, offset: 0, travel: 0, seconds: 0, taper: 0, mode: 'each', loop: false };
const xs = (r: StrokeRecord) => [r.points[0]!.x, r.points[r.points.length - 1]!.x];

describe('drawOnWindows', () => {
  it('is the whole path at 0 to 100 and nothing when the window is empty', () => {
    expect(drawOnWindows(base)).toEqual([[0, 1]]);
    expect(drawOnWindows({ ...base, end: 0 })).toEqual([]);
    expect(drawOnWindows({ ...base, start: 60, end: 40 })).toEqual([]);
  });
  it('slides with offset and travel, and runs off the end without loop', () => {
    expect(drawOnWindows({ ...base, end: 30, offset: 20 })).toEqual([[0.2, 0.5]]);
    expect(drawOnWindows({ ...base, end: 30, travel: 50, seconds: 1.5 })).toEqual([[0.75, 1]]);
    expect(drawOnWindows({ ...base, end: 30, offset: 100 })).toEqual([]);
  });
  it('wraps round to the start with loop', () => {
    const w = drawOnWindows({ ...base, end: 30, offset: 85, loop: true });
    expect(w).toHaveLength(2);
    expect(w[0]![0]).toBeCloseTo(0.85); expect(w[0]![1]).toBe(1);
    expect(w[1]![0]).toBe(0); expect(w[1]![1]).toBeCloseTo(0.15);
  });
});

describe('drawOnStrokes', () => {
  it('returns the same records when everything shows', () => {
    const a = line('a');
    expect(drawOnStrokes([a], base)).toEqual([a]);
    expect(drawOnStrokes([a], base)[0]).toBe(a);
  });
  it('cuts a line to the visible part by arc length', () => {
    const [p] = drawOnStrokes([line('a')], { ...base, start: 25, end: 75 });
    expect(xs(p!)[0]).toBeCloseTo(25); expect(xs(p!)[1]).toBeCloseTo(75);
    expect(p!.id).not.toBe('a');
  });
  it('tapers only the cut ends', () => {
    const [p] = drawOnStrokes([line('a')], { ...base, end: 50, taper: 12 });
    expect(p!.brush.taperStart).toBe(0);
    expect(p!.brush.taperEnd).toBe(12);
  });
  it('keeps a taper no longer than half the visible length', () => {
    const [p] = drawOnStrokes([line('a')], { ...base, start: 40, end: 50, taper: 50 });
    expect(p!.brush.taperStart).toBeCloseTo(5); expect(p!.brush.taperEnd).toBeCloseTo(5);
  });
  it('draws lines one after another in order mode', () => {
    const out = drawOnStrokes([line('a', 0), line('b', 10)], { ...base, end: 75, mode: 'order' });
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('a'); // the first line is fully drawn: unchanged
    expect(xs(out[1]!)[1]).toBeCloseTo(50); // half of the second
  });
  it('splits into two pieces when a looping window wraps', () => {
    const out = drawOnStrokes([line('a')], { ...base, end: 30, offset: 85, loop: true });
    expect(out).toHaveLength(2);
  });
  it('leaves closed shapes whole', () => {
    const s = { ...line('s'), shape: {} as StrokeRecord['shape'] } as StrokeRecord;
    expect(drawOnStrokes([s], { ...base, end: 10 })).toEqual([s]);
  });
});

describe('the Repeater', () => {
  const r: RepeatSettings = { copies: 4, x: 10, y: -5, scale: 100, turn: 15, fade: 50, delay: 2, depth: 0 };
  it('places each copy a step further on, turned, faded and behind in time', () => {
    const c1 = repeatCopy(r, 1), c3 = repeatCopy(r, 3);
    expect([c1.dx, c1.dy, c1.frames]).toEqual([10, -5, 2]);
    expect([c3.dx, c3.dy, c3.frames]).toEqual([30, -15, 6]);
    expect(c3.turn).toBeCloseTo((45 * Math.PI) / 180);
    expect(c1.alpha).toBeCloseTo(0.5); expect(c3.alpha).toBeCloseTo(0.125);
    expect(c3.scale).toBeCloseTo(1);
  });
  it('size compounds per copy, and depth shrinks and fades the far ones', () => {
    expect(repeatCopy({ ...r, scale: 90 }, 2).scale).toBeCloseTo(0.81);
    const near = repeatCopy({ ...r, fade: 0 }, 2), far = repeatCopy({ ...r, fade: 0, depth: 100 }, 2);
    expect(near.alpha).toBe(1); expect(near.scale).toBe(1);
    expect(far.scale).toBeLessThan(near.scale); expect(far.alpha).toBeLessThan(near.alpha);
  });
  it('draws the farthest copy first and never more than the limit', () => {
    expect(repeatIndices({ ...r, copies: 4 })).toEqual([3, 2, 1]);
    expect(repeatIndices({ ...r, copies: 1 })).toEqual([]);
    expect(repeatIndices({ ...r, copies: 99 })).toHaveLength(11);
    expect(repeatIndices({ ...r, copies: 0 })).toEqual([]);
  });
});
