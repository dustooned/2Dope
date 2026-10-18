import { describe, expect, it } from 'vitest';
import { activeEffects, effectPreview, effectsKey, effectTick, newEffect, readEffects } from './effects';

describe('layer effects', () => {
  it('makes a line boil with its defaults, aimed at the Line', () => {
    const e = newEffect('boil', 'fx1', 7);
    expect(e).toMatchObject({ type: 'boil', on: true, target: 'line', hold: 2, seed: 7 });
  });

  it('changes the pattern every `hold` frames', () => {
    const e = newEffect('boil', 'fx1', 7);
    expect([0, 1, 2, 3, 4].map((f) => effectTick(e, f))).toEqual([0, 0, 1, 1, 2]);
    expect(effectTick({ ...e, hold: 1 }, 3)).toBe(3);
  });

  it('reads effects from a file, dropping unknown types and clamping values', () => {
    expect(readEffects('nope')).toBeUndefined();
    const fx = readEffects([{ type: 'boil', amount: 99, size: 1, hold: 30, target: 'fill', seed: 5 }, { type: 'sparkle' }])!;
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ type: 'boil', amount: 16, size: 4, hold: 8, target: 'fill', on: true, seed: 5 });
  });

  it('keys a frame by what its effects show, and previews override the saved ones', () => {
    const l = { id: 'L1', effects: [newEffect('boil', 'fx1', 7)] };
    expect(effectsKey(l, 0)).toBe(effectsKey(l, 1));
    expect(effectsKey(l, 0)).not.toBe(effectsKey(l, 2));
    expect(effectsKey({ id: 'L2' }, 0)).toBe('');
    effectPreview.set('L1', [{ ...l.effects[0]!, on: false }]);
    expect(activeEffects(l)).toHaveLength(0);
    effectPreview.delete('L1');
    expect(activeEffects(l)).toHaveLength(1);
  });
});
