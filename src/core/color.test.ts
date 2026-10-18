import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex, pushRecent } from './color';

describe('colour', () => {
  it('normalises hex', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex('#FF5A8A')).toBe('#ff5a8a');
    expect(normalizeHex('nope')).toBeNull();
  });

  it('round-trips through HSV', () => {
    for (const c of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ff5a8a', '#123456', '#808080']) expect(hsvToHex(hexToHsv(c))).toBe(c);
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00').h).toBeCloseTo(120);
  });

  it('keeps recent colours unique, newest first', () => {
    expect(pushRecent(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
    expect(pushRecent(['#111111'], 'nope')).toEqual(['#111111']);
    expect(
      pushRecent(
        Array.from({ length: 12 }, (_, i) => `#0000${String(i).padStart(2, '0')}`),
        '#ffffff',
      ),
    ).toHaveLength(12);
  });
});

describe('harmony and palettes from pictures', () => {
  it('turns the hue round the wheel', async () => {
    const { harmony } = await import('./color');
    expect(harmony('#ff0000', 'complementary')).toEqual(['#ff0000', '#00ffff']);
    expect(harmony('#ff0000', 'triadic')).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(harmony('#ff0000', 'tetradic')).toHaveLength(4);
  });

  it('finds the main colours of a picture, darkest first', async () => {
    const { paletteFromPixels } = await import('./color');
    const data = new Uint8ClampedArray(4 * 300);
    for (let i = 0; i < 300; i++) {
      const c = i < 100 ? [250, 10, 10] : i < 200 ? [10, 10, 250] : [240, 240, 240];
      data.set([...c, 255], i * 4);
    }
    const p = paletteFromPixels(data, 3);
    expect(p).toEqual(['#0a0afa', '#fa0a0a', '#f0f0f0']);
  });
});
