import { describe, expect, it } from 'vitest';
import { thinOut } from './timelapse';

describe('time-lapse', () => {
  it('keeps every other picture once over the limit, always the first and the newest', () => {
    const list = Array.from({ length: 11 }, (_, i) => i);
    expect(thinOut(list, 20)).toBe(list);
    const t = thinOut(list, 10);
    expect(t).toEqual([0, 2, 4, 6, 8, 10]);
    expect(thinOut([...t, 11], 6)).toEqual([0, 4, 8, 11]);
  });
});
