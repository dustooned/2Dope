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

  it('has noise, texture and turbulence with their own ranges and defaults', () => {
    expect(newEffect('texture', 'a', 1)).toMatchObject({ type: 'texture', target: 'fill', style: 'paper' });
    expect(newEffect('grain', 'a', 1)).toMatchObject({ type: 'grain', target: 'layer', hold: 1 });
    expect(newEffect('turbulence', 'a', 1)).toMatchObject({ type: 'turbulence', target: 'layer' });
    const fx = readEffects([{ type: 'grain', amount: 500, size: 99 }, { type: 'texture', style: 'bogus', amount: 20 }, { type: 'turbulence', amount: 99 }])!;
    expect(fx[0]).toMatchObject({ amount: 100, size: 16 });
    expect(fx[1]).toMatchObject({ style: 'paper', amount: 20 });
    expect(fx[2]).toMatchObject({ amount: 40 });
  });

  it('keeps a texture still while noise changes every frame', () => {
    const t = { id: 'L', effects: [newEffect('texture', 'a', 1)] };
    expect(effectsKey(t, 0)).toBe(effectsKey(t, 5));
    const n = { id: 'L', effects: [newEffect('grain', 'a', 1)] };
    expect(effectsKey(n, 0)).not.toBe(effectsKey(n, 1));
    expect(effectsKey({ id: 'L', effects: [{ ...t.effects[0]!, style: 'dots' as const }] }, 0)).not.toBe(effectsKey(t, 0));
  });

  it('has a dither effect: still, with a palette, a pattern and a pixel size', () => {
    const d = newEffect('dither', 'a', 1);
    expect(d).toMatchObject({ type: 'dither', target: 'layer', palette: 'pico8', method: 'bayer4', gray: false, amount: 100, size: 2 });
    expect(effectsKey({ id: 'L', effects: [d] }, 0)).toBe(effectsKey({ id: 'L', effects: [d] }, 9));
    expect(effectsKey({ id: 'L', effects: [{ ...d, palette: 'bw' as const }] }, 0)).not.toBe(effectsKey({ id: 'L', effects: [d] }, 0));
    const [r] = readEffects([{ type: 'dither', palette: 'nope', method: 'floyd', gray: true, size: 99 }])!;
    expect(r).toMatchObject({ palette: 'pico8', method: 'floyd', gray: true, size: 16 });
  });
});
