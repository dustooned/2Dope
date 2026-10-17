import { describe, expect, it } from 'vitest';
import { sameCels, syncCelGroups, syncExposures } from './cellink';
import { drawingsLayer } from './comp';
import type { Exposure } from './timeline';

const ex = (...pairs: [string, number][]): Exposure[] => pairs.map(([drawing, length]) => ({ drawing, length }));

describe('linked art layers', () => {
  const ink = ex(['a', 2], ['b', 2], ['c', 1]);
  const colour = ex(['x', 2], ['y', 2], ['z', 1]);
  let n = 0;
  const blank = () => `new${++n}`;

  it('a retime follows with the member keeping its own drawings', () => {
    const after = ex(['a', 2], ['b', 4], ['c', 1]);
    expect(syncExposures(ink, after, colour, blank)).toEqual(ex(['x', 2], ['y', 4], ['z', 1]));
  });

  it('a new cel gets a new blank drawing on the member, in the same place', () => {
    n = 0;
    const after = ex(['a', 2], ['q', 1], ['b', 2], ['c', 1]);
    expect(syncExposures(ink, after, colour, blank)).toEqual(ex(['x', 2], ['new1', 1], ['y', 2], ['z', 1]));
  });

  it('deleting and reordering cels carries the partner drawings along', () => {
    expect(syncExposures(ink, ex(['c', 1], ['a', 2]), colour, blank)).toEqual(ex(['z', 1], ['x', 2]));
  });

  it('reusing a drawing reuses its partner', () => {
    expect(syncExposures(ink, ex(['a', 2], ['b', 2], ['a', 3]), colour, blank)).toEqual(ex(['x', 2], ['y', 2], ['x', 3]));
  });

  it('sameCels compares timing only', () => {
    expect(sameCels(ink, colour)).toBe(true);
    expect(sameCels(ink, ex(['x', 2], ['y', 3], ['z', 1]))).toBe(false);
  });
});

describe('cel groups after any layer edit', () => {
  const layer = (id: string, ex: Exposure[], start = 0) => {
    const l = drawingsLayer(id, id, ex, 100, 100, 100, 100);
    l.start = start; l.in = start; l.cel = 'g';
    return l;
  };

  it('a member moved or trimmed in Motion brings the others along', () => {
    const a = layer('A', ex(['a', 2], ['b', 2]));
    const b = layer('B', ex(['x', 2], ['y', 2]));
    const moved = { ...a, start: 10, in: 10, exposures: ex(['a', 2], ['b', 5]) };
    const fixed = syncCelGroups([a, b], [moved, b], () => 'new')!;
    const fb = fixed[1] as typeof b;
    expect(fb.start).toBe(10);
    expect(fb.exposures).toEqual(ex(['x', 2], ['y', 5]));
  });

  it('nothing to do when the group already matches', () => {
    const a = layer('A', ex(['a', 2]));
    const b = layer('B', ex(['x', 2]));
    expect(syncCelGroups([a, b], [a, b], () => 'new')).toBeNull();
  });

  it('a duplicated cel can copy its partner instead of leaving it blank', () => {
    const before = ex(['a', 2]);
    const out = syncExposures(before, ex(['a', 2], ['a2', 2]), ex(['x', 2]), (src, partnerOf) => (src === 'a2' ? `copy-of-${partnerOf('a')}` : 'blank'));
    expect(out).toEqual(ex(['x', 2], ['copy-of-x', 2]));
  });
});
