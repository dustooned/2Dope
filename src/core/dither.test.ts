import { describe, expect, it } from 'vitest';
import { ditherPixels, paletteColors, PALETTES, type DitherMethod } from './dither';

function ramp(w: number, h: number, v: number, a = 255): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = a; }
  return px;
}
const lightShare = (px: Uint8ClampedArray) => { let on = 0; for (let i = 0; i < px.length; i += 4) if (px[i]! > 127) on++; return on / (px.length / 4); };

describe('dither', () => {
  it('has the palettes the effect offers, each with at least two colours', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['bw', 'gameboy', 'cga', 'ega', 'c64', 'zx', 'pico8', 'rgb2', 'rgb4']);
    for (const p of PALETTES) expect(p.colors.length).toBeGreaterThanOrEqual(2);
    expect(paletteColors('pico8')).toHaveLength(16);
  });

  it('turns mid grey into a checker of black and white, about half each, with every method', () => {
    for (const m of ['bayer2', 'bayer4', 'bayer8', 'floyd', 'atkinson', 'jjn', 'stucki', 'burkes', 'sierra'] as DitherMethod[]) {
      const px = ramp(32, 32, 128);
      ditherPixels(px, 32, 32, { palette: 'bw', method: m });
      for (let i = 0; i < px.length; i += 4) expect([0, 255]).toContain(px[i]);
      const share = lightShare(px);
      // Atkinson drops part of the error, so it drifts a little further
      expect(share).toBeGreaterThan(m === 'atkinson' ? 0.3 : 0.4);
      expect(share).toBeLessThan(m === 'atkinson' ? 0.7 : 0.6);
    }
  });

  it('without a pattern, rounds each pixel to the nearest colour', () => {
    const dark = ramp(4, 4, 40), light = ramp(4, 4, 220);
    ditherPixels(dark, 4, 4, { palette: 'bw', method: 'none' });
    ditherPixels(light, 4, 4, { palette: 'bw', method: 'none' });
    expect(lightShare(dark)).toBe(0);
    expect(lightShare(light)).toBe(1);
  });

  it('keeps alpha, skips transparent pixels, and lands only on palette colours', () => {
    const px = ramp(8, 8, 100);
    for (let i = 0; i < 8; i++) px[i * 4 + 3] = 0; // first row see-through
    const before = Array.from(px.slice(0, 32));
    ditherPixels(px, 8, 8, { palette: 'gameboy', method: 'floyd' });
    expect(Array.from(px.slice(0, 32))).toEqual(before);
    const pal = paletteColors('gameboy').map((c) => c.join(','));
    for (let i = 8; i < 64; i++) {
      expect(pal).toContain(`${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]}`);
      expect(px[i * 4 + 3]).toBe(255);
    }
  });

  it('mixes back toward the original, and can go to grey first', () => {
    const px = ramp(4, 4, 40);
    ditherPixels(px, 4, 4, { palette: 'bw', method: 'none', strength: 0.5 });
    expect(px[0]).toBe(20);
    const c = new Uint8ClampedArray([255, 0, 0, 255]);
    ditherPixels(c, 1, 1, { palette: 'bw', method: 'none', gray: true });
    expect(c[0]).toBe(0); // red is dark as grey
    expect(c[1]).toBe(0);
  });
});
