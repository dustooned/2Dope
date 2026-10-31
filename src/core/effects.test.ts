import { describe, expect, it } from 'vitest';
import { activeEffects, effectPreview, effectsKey, effectsPad, effectTick, newEffect, param, readEffects, resetEffect } from './effects';

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

  it('has a roughen-edges effect and a gaussian blur, each with its own defaults', () => {
    expect(newEffect('roughen', 'a', 3)).toMatchObject({ type: 'roughen', target: 'line', amount: 3, size: 34, hold: 2 });
    const b = newEffect('blur', 'b', 3);
    expect(b).toMatchObject({ type: 'blur', target: 'layer', amount: 6 });
    expect(effectTick(b, 9)).toBe(0);
    const fx = readEffects([{ type: 'roughen', amount: 99, size: 1 }, { type: 'blur', amount: 99 }])!;
    expect(fx[0]).toMatchObject({ amount: 20, size: 8, target: 'line' });
    expect(fx[1]).toMatchObject({ amount: 40, target: 'layer' });
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

describe('further settings (params)', () => {
  it('reads valid params, clamps numbers and drops unknown keys and bad values', () => {
    const [e] = readEffects([{ type: 'shadow', amount: 6, params: { angle: 999, opacity: 30, color: '#ff0000', only: true, bogus: 1 } }])!;
    expect(e!.params).toEqual({ angle: 360, opacity: 30, color: '#ff0000', only: true });
    const [g] = readEffects([{ type: 'glow', params: { composite: 'sideways', threshold: 'x' } }])!;
    expect(g!.params).toBeUndefined();
    expect(param(g!, 'composite')).toBe('top');
  });

  it('pads layers for shadows and glows, and reset clears params', () => {
    expect(effectsPad({ id: 'a', effects: [newEffect('shadow', 's', 1)] })).toBe(Math.ceil(5 + 0 + 2));
    expect(effectsPad({ id: 'b', effects: [newEffect('glow', 'g', 1)] })).toBe(17);
    expect(effectsPad({ id: 'c', effects: [newEffect('blur', 'b', 1)] })).toBe(0);
    expect(resetEffect({ ...newEffect('shadow', 's', 1), params: { angle: 10 } }).params).toBeUndefined();
  });
});
