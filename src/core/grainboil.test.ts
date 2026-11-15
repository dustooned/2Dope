import { describe, expect, it } from 'vitest';
import { grainBoilShift, grainBoilStep, readGrainBoil } from './grainboil';
import { cloneBrush, PRESETS, sanitizeBrushExtras } from './brush';
import { readBrush } from './brushlib';

describe('boiling grain', () => {
  it('Fixed (missing or unknown) never moves the grain', () => {
    for (const boil of [undefined, 0, 4, '1', null, 1.5]) {
      for (const f of [0, 1, 2, 7, 100]) expect(grainBoilShift(boil, f)).toEqual({ x: 0, y: 0 });
    }
  });

  it('steps every frame, every 2nd or every 3rd frame', () => {
    expect([0, 1, 2, 3, 4, 5].map((f) => grainBoilStep(1, f))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4, 5].map((f) => grainBoilStep(2, f))).toEqual([0, 0, 1, 1, 2, 2]);
    expect([0, 1, 2, 3, 4, 5, 6].map((f) => grainBoilStep(3, f))).toEqual([0, 0, 0, 1, 1, 1, 2]);
  });

  it('the first step sits where a Fixed brush puts the grain', () => {
    expect(grainBoilShift(1, 0)).toEqual({ x: 0, y: 0 });
    expect(grainBoilShift(3, 2)).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic: the same frame always gives the same shift', () => {
    for (const boil of [1, 2, 3] as const) {
      for (let f = 0; f < 50; f++) expect(grainBoilShift(boil, f)).toEqual(grainBoilShift(boil, f));
    }
    // pinned values, so a change to the sequence (which would change exported pixels) is noticed
    expect(grainBoilShift(1, 1).x).toBeCloseTo(0.7548776662, 9);
    expect(grainBoilShift(1, 1).y).toBeCloseTo(0.5698402910, 9);
    expect(grainBoilShift(2, 4)).toEqual(grainBoilShift(1, 2));
  });

  it('neighbouring steps are far apart on the tile and stay inside it', () => {
    const wrap = (d: number) => Math.min(Math.abs(d), 1 - Math.abs(d));
    for (let f = 0; f < 400; f++) {
      const a = grainBoilShift(1, f), b = grainBoilShift(1, f + 1);
      for (const v of [a.x, a.y, b.x, b.y]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
      expect(Math.hypot(wrap(a.x - b.x), wrap(a.y - b.y))).toBeGreaterThan(0.2);
    }
  });

  it('a fractional frame paints with its whole frame', () => {
    expect(grainBoilShift(1, 3.7)).toEqual(grainBoilShift(1, 3));
    expect(grainBoilShift(1, Number.NaN)).toEqual({ x: 0, y: 0 });
  });

  it('reads only 1, 2 and 3', () => {
    expect([1, 2, 3, 0, 4, '2', undefined].map(readGrainBoil)).toEqual([1, 2, 3, undefined, undefined, undefined, undefined]);
  });

  it('brushes keep a valid setting and drop anything else; old brushes stay Fixed', () => {
    const b = cloneBrush(PRESETS[0]!);
    expect(b.grainBoil).toBeUndefined();
    expect(sanitizeBrushExtras({ ...b, grainBoil: 2 }).grainBoil).toBe(2);
    expect('grainBoil' in sanitizeBrushExtras({ ...b, grainBoil: 7 as never })).toBe(false);
    expect(readBrush({ ...b, grainBoil: 3 })?.grainBoil).toBe(3);
    expect(readBrush({ ...b, grainBoil: 'boil' })?.grainBoil).toBeUndefined();
    const old = { ...b } as Record<string, unknown>;
    delete old.grainBoil;
    expect(readBrush(old)?.grainBoil).toBeUndefined();
  });
});
