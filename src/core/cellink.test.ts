import { describe, expect, it } from 'vitest';
import { sameCels, syncExposures } from './cellink';
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
