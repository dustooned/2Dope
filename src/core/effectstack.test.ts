import { describe, expect, it } from 'vitest';
import { canMerge, duplicateEffect, mergeDown, moveEffect, newEffect, resetEffect } from './effects';

const stack = () => [newEffect('grain', 'a', 1), newEffect('grain', 'b', 2), newEffect('boil', 'c', 3)];

describe('effect stack', () => {
  it('moves an effect up or down the stack', () => {
    expect(moveEffect(stack(), 2, 0).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(moveEffect(stack(), 0, 9).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    const s = stack();
    expect(moveEffect(s, 1, 1)).toBe(s);
  });

  it('merges two of the same kind, adding the amounts to the limit', () => {
    const s = stack();
    s[0]!.amount = 70; s[1]!.amount = 50;
    const m = mergeDown(s, 0)!;
    expect(m.map((e) => e.id)).toEqual(['b', 'c']);
    expect(m[0]!.amount).toBe(100);
    expect(canMerge(s[1], s[2])).toBe(false);
    expect(mergeDown(s, 1)).toBeNull();
    expect(mergeDown(s, 2)).toBeNull();
  });

  it('duplicates under itself with a new id, and resets to the defaults', () => {
    const d = duplicateEffect(stack(), 0, 'z');
    expect(d.map((e) => e.id)).toEqual(['a', 'z', 'b', 'c']);
    const e = { ...newEffect('boil', 'q', 5), amount: 9, size: 99, hold: 4 };
    expect(resetEffect(e)).toMatchObject({ id: 'q', seed: 5, amount: 1.6, size: 22, hold: 2 });
  });
});
