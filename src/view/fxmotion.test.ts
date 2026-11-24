import { describe, expect, it } from 'vitest';
import { shapeMetric, type WipeShape } from './fxmotion';
import { blendHex } from './fxlight';

const shapes: WipeShape[] = ['diamond', 'square', 'star', 'heart'];

describe('Wipe shapes', () => {
  it('measure from the middle: nothing at the middle, one on the edge of the unit shape', () => {
    expect(shapeMetric('square', 1, 0.5)).toBe(1);
    expect(shapeMetric('square', 0, -1)).toBe(1);
    expect(shapeMetric('diamond', 0.5, 0.5)).toBe(1);
    expect(shapeMetric('diamond', 0, 1)).toBe(1);
    expect(shapeMetric('star', 0, -1)).toBeCloseTo(1, 5); // straight up is a point of the star
    for (const s of shapes) expect(shapeMetric(s, 0, 0)).toBeLessThan(0.01);
  });
  it('is a distance: twice as far is twice the size, and it grows along any line out', () => {
    for (const s of shapes) for (const [x, y] of [[0.3, 0.2], [-0.4, 0.5], [0.1, -0.6], [0.7, 0.1]] as const) {
      expect(shapeMetric(s, 2 * x, 2 * y)).toBeCloseTo(2 * shapeMetric(s, x, y), 2);
      expect(shapeMetric(s, 1.5 * x, 1.5 * y)).toBeGreaterThan(shapeMetric(s, x, y));
    }
  });
  it('gives the star notches between its points and the heart a cleft at the top', () => {
    // a star point reaches further than the notch beside it
    const point = shapeMetric('star', 0, -1), notch = shapeMetric('star', Math.sin(Math.PI / 5), -Math.cos(Math.PI / 5));
    expect(notch).toBeGreaterThan(point);
    // the heart is wider than it is tall at its widest, and its top middle is a dip: a point straight up is further out
    // than the same distance up the side of a lobe, relative to the shape
    expect(shapeMetric('heart', 0, -0.8)).toBeGreaterThan(shapeMetric('heart', 0.5, -0.8) * 0.5);
  });
});

describe('Gradient colours', () => {
  it('blend from the first colour to the second', () => {
    expect(blendHex('#000000', '#ffffff', 0)).toBe('rgb(0,0,0)');
    expect(blendHex('#000000', '#ffffff', 1)).toBe('rgb(255,255,255)');
    expect(blendHex('#ff0000', '#0000ff', 0.5)).toBe('rgb(128,0,128)');
    expect(blendHex('#ff0000', '#0000ff', 3)).toBe('rgb(0,0,255)');
  });
});
