import { describe, expect, it } from 'vitest';
import { dotRadius } from './fxlight';

describe('Halftone dot size', () => {
  it('grows with the ink coverage, from nothing to filling the cell', () => {
    expect(dotRadius(0, 10)).toBe(0);
    let last = 0;
    for (const c of [0.05, 0.2, 0.4, 0.6, 0.78, 0.9, 1]) { const r = dotRadius(c, 10); expect(r).toBeGreaterThan(last); last = r; }
    // at full coverage the dots reach the corners of their cell, so solid ink has no gaps
    expect(dotRadius(1, 10)).toBeCloseTo(7.071, 2);
  });
  it('covers about the share of the cell it was asked for when it is a plain dot', () => {
    for (const c of [0.1, 0.3, 0.5, 0.7]) expect((Math.PI * dotRadius(c, 10) ** 2) / 100).toBeCloseTo(c, 1);
  });
  it('is continuous where it switches to the filling-up curve, and scales with the cell', () => {
    expect(Math.abs(dotRadius(0.779, 10) - dotRadius(0.781, 10))).toBeLessThan(0.05);
    expect(dotRadius(0.5, 20)).toBeCloseTo(dotRadius(0.5, 10) * 2, 6);
    expect(dotRadius(2, 10)).toBe(dotRadius(1, 10));
  });
});
