import { describe, expect, it } from 'vitest';
import { PRESETS } from './brush';
import { drawingsLayer, frameContent, newComp, vectorTweenAt } from './comp';
import type { StrokeRecord } from './stroke';
import { tweenStrokes } from './vectortween';

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
});
