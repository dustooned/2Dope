import { describe, expect, it } from 'vitest';
import { ABSOLUTE_MAX_CELL, ABSOLUTE_MIN_CELL, anchoredScroll, clampCell, isFitPinch, pinchCell, zoomLimits } from './flipzoom';

describe('strip zoom limits', () => {
  it('lets a long shot zoom out to fit and a short one to the old minimum', () => {
    const long = zoomLimits(1000, 104, 1000);
    expect(long.fit).toBeCloseTo((896 - 12) / 1000, 5);
    expect(long.min).toBe(long.fit);
    const short = zoomLimits(1000, 104, 12);
    expect(short.min).toBe(4);
    expect(short.fit).toBeCloseTo((896 - 12) / 12, 5);
  });

  it('puts frame focus at a quarter of the strip, so it scales with the screen', () => {
    expect(zoomLimits(1000, 104, 100).max).toBeCloseTo(224, 5);
    expect(zoomLimits(500, 56, 100).max).toBeCloseTo(111, 5);
    expect(zoomLimits(4000, 104, 100).max).toBe(ABSOLUTE_MAX_CELL);
  });

  it('never goes below the floor, and clamps both ways', () => {
    const l = zoomLimits(1000, 104, 1_000_000);
    expect(l.min).toBe(ABSOLUTE_MIN_CELL);
    expect(clampCell(0.01, l)).toBe(ABSOLUTE_MIN_CELL);
    expect(clampCell(9999, l)).toBe(l.max);
    expect(clampCell(30, zoomLimits(1000, 104, 12))).toBe(30);
  });

  it('survives a strip that has no width yet', () => {
    const l = zoomLimits(0, 104, 10);
    expect(l.min).toBeLessThanOrEqual(l.max);
    expect(Number.isFinite(l.fit)).toBe(true);
  });
});

describe('pinch and fit', () => {
  it('scales the width per frame at 0.6 of the finger ratio', () => {
    expect(pinchCell(40, 100, 100)).toBe(40);
    expect(pinchCell(40, 100, 200)).toBeCloseTo(40 * Math.pow(2, 0.6), 6);
    expect(pinchCell(40, 100, 50)).toBeCloseTo(40 * Math.pow(0.5, 0.6), 6);
  });

  it('fits only for a quick, fast, large pinch together', () => {
    expect(isFitPinch(120, 480, 240)).toBe(true); // 2x in 120 ms, 2000 px/s
    expect(isFitPinch(400, 480, 120)).toBe(false); // slow
    expect(isFitPinch(120, 480, 360)).toBe(false); // under 1.6x
    expect(isFitPinch(200, 300, 150)).toBe(false); // 750 px/s: too slow
    expect(isFitPinch(120, 240, 480)).toBe(false); // fingers apart is a zoom in
  });
});

describe('anchoring', () => {
  it('keeps the frame under the same screen position', () => {
    for (const [cell, scroll0] of [[10, 300], [44, 1200], [2, 0]] as const) {
      const label = 104, frame = 61.5, screenX = label + frame * cell - scroll0;
      const next = pinchCell(cell, 100, 220);
      const scroll1 = anchoredScroll(label, frame, next, screenX);
      if (scroll1 > 0) expect(Math.abs(label + frame * next - scroll1 - screenX)).toBeLessThan(0.5);
    }
  });

  it('never scrolls before frame 0', () => {
    expect(anchoredScroll(104, 0, 50, 900)).toBe(0);
  });
});
