import { describe, expect, it } from 'vitest';
import { PRESETS } from './brush';
import { drawingsLayer, frameContent, newComp, vectorTweenAt } from './comp';
import type { StrokeRecord } from './stroke';
import { autoPairs, resample, tweenStrokes } from './vectortween';

const pen = (id: string, y: number): StrokeRecord => ({
  id, tool: 'pen', brush: PRESETS[0]!, color: '#000000', seed: 1,
  points: [0, 20].map(x => ({ x, y, pressure: 1, tiltX: 0, tiltY: 0, t: x })),
});

describe('authored vector poses', () => {
  it('matches stable IDs across reordered drawings and holds unmatched topology', () => {
    const first = pen('same', 10), held = pen('held', 12);
    const altered = { ...held, points: held.points.slice(0, 1) };
    const result = tweenStrokes([first, held], [altered, pen('same', 30), pen('new', 99)], 0.25);
    expect(result[0]!.points.map(p => p.y)).toEqual([15, 15]);
    expect(result[1]).toBe(held);
    expect(first.points[0]!.y).toBe(10);
  });

  it('includes both poses in a frame dependency key only between authored poses', () => {
    const c = newComp('c1', 'Shot', 64, 64, 12);
    const l = drawingsLayer('ink', 'Ink', [{ drawing: 'a', length: 4 }, { drawing: 'b', length: 1 }], 64, 64);
    c.layers = [l];
    l.tweenVectors = true;
    const comps = new Map([[c.id, c]]);
    expect(vectorTweenAt(l, 2)).toEqual({ next: 'b', t: 0.5 });
    expect([...frameContent(comps, c, 0).drawings]).toEqual(['a']);
    expect([...frameContent(comps, c, 2).drawings]).toEqual(['a', 'b']);
    expect(frameContent(comps, c, 2).key).not.toBe(frameContent(comps, c, 3).key);
    expect([...frameContent(comps, c, 4).drawings]).toEqual(['b']);
  });

  it('pairs separately drawn poses by position, flips reversed lines and resamples point counts', () => {
    const line = (id: string, xs: number[], y: number): StrokeRecord => ({ ...pen(id, y), points: xs.map(x => ({ x, y, pressure: 1, tiltX: 0, tiltY: 0, t: x })) });
    const a = [line('a-top', [0, 50, 100], 0), line('a-low', [0, 100], 100)];
    // drawn in the other order, the low line backwards and with more points
    const b = [line('b-low', [110, 80, 40, 10], 110), line('b-top', [0, 100], 20)];
    const pairs = autoPairs(a, b);
    expect(pairs.get('a-top')!.to.every(p => p.y === 20)).toBe(true);
    expect(pairs.get('a-low')!.to[0]!.x).toBe(10);
    expect(pairs.get('a-low')!.from).toHaveLength(4);
    const mid = tweenStrokes(a, b, 0.5);
    expect(mid[0]!.points.every(p => p.y === 10)).toBe(true);
    expect(mid[1]!.points[0]!.x).toBe(5);
    expect(mid[1]!.points[3]!.y).toBe(105);
    expect(a[1]!.points).toHaveLength(2);
  });

  it('keeps id matching when poses share ids, and resamples evenly by length', () => {
    expect(tweenStrokes([pen('x', 0), pen('solo', 50)], [pen('x', 10), pen('other', 60)], 0.5)[1]!.points[0]!.y).toBe(50);
    const even = resample([{ x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 0 }, { x: 30, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 3 }], 4);
    expect(even.map(p => p.x)).toEqual([0, 10, 20, 30]);
  });
});
