import { describe, expect, it } from 'vitest';
import { distanceField, outlineColours, soundValues } from './fxextra';
import { effectsKey, newEffect, outlineReach, readEffects, OUTLINE_MAX_REACH, type LayerEffect } from '../core/effects';
import { drawingsLayer, newComp } from '../core/comp';
import { compFile, minimumDrawingSchema } from '../io/schema';

const fx = (type: LayerEffect['type'], params: LayerEffect['params'] = {}, over: Partial<LayerEffect> = {}): LayerEffect => ({ ...newEffect(type, 'e1', 7), params, ...over });

describe('distance field', () => {
  it('is exact Euclidean distance, or square (Chebyshev) for square corners', () => {
    const w = 21, h = 21, inside = new Uint8Array(w * h);
    inside[10 * w + 10] = 1;
    const d = distanceField(inside, w, h), sq = distanceField(inside, w, h, true);
    expect(d[10 * w + 10]).toBe(0);
    expect(d[(10 + 4) * w + 10 + 3]).toBeCloseTo(5, 6);
    expect(d[(10 + 7) * w + 10 + 7]).toBeCloseTo(Math.hypot(7, 7), 6);
    expect(sq[(10 + 4) * w + 10 + 3]).toBe(4);
    expect(sq[(10 + 7) * w + 10 + 7]).toBe(7);
  });
});

describe('outline settings', () => {
  it('uses one colour, a named palette or four custom colours, and caps how far lines reach', () => {
    expect(outlineColours(fx('outline', { color: '#102030' }))).toEqual([[16, 32, 48]]);
    expect(outlineColours(fx('outline', { palette: 'rainbow' })).length).toBe(8);
    expect(outlineColours(fx('outline', { palette: 'custom', color: '#000000', color2: '#ffffff', color3: '#ff0000', color4: '#00ff00' }))).toEqual([[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0]]);
    expect(outlineReach(fx('outline', { count: 3, gap: 2 }, { amount: 4 }))).toBe(3 * 4 + 2 * 2);
    expect(outlineReach(fx('outline', { count: 24, gap: 60 }, { amount: 60 }))).toBe(OUTLINE_MAX_REACH);
  });

  it('re-renders every frame only when something moves on its own', () => {
    const still = { id: 'a', effects: [fx('outline', { count: 4, palette: 'rainbow' })] };
    const cycling = { id: 'a', effects: [fx('outline', { count: 4, palette: 'rainbow', cycle: 2 })] };
    expect(effectsKey(still, 1)).toBe(effectsKey(still, 2));
    expect(effectsKey(cycling, 1)).not.toBe(effectsKey(cycling, 2));
    const wave = { id: 'a', effects: [fx('soundwave')] };
    expect(effectsKey(wave, 1)).not.toBe(effectsKey(wave, 2));
  });

  it('keeps settings within range when read from a file', () => {
    const [e] = readEffects([{ type: 'outline', amount: 999, params: { count: 99, palette: 'nope', position: 'inside' } }])!;
    expect(e!.amount).toBe(60);
    expect(e!.params).toEqual({ count: 24, position: 'inside' });
    const [k] = readEffects([{ type: 'kaleido', amount: 1, params: { style: 'triangles', spin: 999 } }])!;
    expect(k!.amount).toBe(2);
    expect(k!.params).toEqual({ style: 'triangles', spin: 180 });
  });
});

describe('sound wave analysis', () => {
  const rate = 22050, tone = (hz: number, sec = 1) => Float32Array.from({ length: rate * sec }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate) * 0.8);

  it('puts a tone in the matching spectrum band', () => {
    const e = fx('soundwave', { type: 'spectrum', low: 100, high: 4000, window: 100 });
    const n = 32, v = soundValues({ samples: tone(1000), rate, time: 0.5 }, e, 0.5, n);
    const peak = v.indexOf(Math.max(...v));
    const band = (b: number) => 100 * Math.pow(4000 / 100, b / n);
    expect(band(peak)).toBeLessThanOrEqual(1000 * 1.05);
    expect(band(peak + 1)).toBeGreaterThanOrEqual(1000 * 0.95);
    expect(Math.max(...v)).toBeGreaterThan(0.5);
    expect(v[0]).toBeLessThan(Math.max(...v) * 0.5);
  });

  it('gives signed samples for lines and peaks for bars, silence past the end', () => {
    const lines = soundValues({ samples: tone(50), rate, time: 0.5 }, fx('soundwave', { type: 'waveform', look: 'lines', window: 40 }), 0.5, 64);
    expect(Math.min(...lines)).toBeLessThan(-0.5);
    expect(Math.max(...lines)).toBeGreaterThan(0.5);
    const bars = soundValues({ samples: tone(50), rate, time: 0.5 }, fx('soundwave', { type: 'waveform', look: 'bars', window: 40 }), 0.5, 16);
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(0);
    const quiet = soundValues({ samples: tone(50), rate, time: 5 }, fx('soundwave', { type: 'waveform', look: 'bars', window: 40 }), 5, 16);
    expect(Math.max(...quiet)).toBe(0);
  });
});

describe('format gate', () => {
  it('needs reader 10 only when a new effect is used', () => {
    const c = newComp('c', 'Shot', 64, 64, 12);
    const l = drawingsLayer('a', 'Art', [{ drawing: 'd', length: 4 }], 64, 64);
    c.layers = [l];
    expect(minimumDrawingSchema({}, { c: compFile(c) })).toBeLessThan(10);
    l.effects = [fx('blinds')];
    expect(minimumDrawingSchema({}, { c: compFile(c) })).toBe(10);
  });
});
