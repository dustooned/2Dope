import { describe, expect, it } from 'vitest';
import { assistPoint, DEFAULT_GUIDE, guideDirections, guideLines, pickDirection, vanishingPoints } from './guides';

describe('drawing guides', () => {
  it('lays out grid, isometric and perspective lines', () => {
    expect(guideLines({ ...DEFAULT_GUIDE, mode: 'grid', size: 50 }, 100, 100)).toHaveLength(6);
    expect(guideLines({ ...DEFAULT_GUIDE, mode: 'iso' }, 100, 100).length).toBeGreaterThan(6);
    expect(vanishingPoints({ ...DEFAULT_GUIDE, mode: 'persp1' }, 200, 100)).toEqual([[100, 40]]);
    expect(vanishingPoints({ ...DEFAULT_GUIDE, mode: 'persp2', left: 0, right: 1 }, 200, 100)).toEqual([[0, 40], [200, 40]]);
    expect(guideLines({ ...DEFAULT_GUIDE, mode: 'off' }, 100, 100)).toEqual([]);
  });

  it('settles a stroke on the closest guide direction and keeps it on that line', () => {
    const g = { ...DEFAULT_GUIDE, mode: 'persp1' as const };
    const dirs = guideDirections(g, 200, 100, 0, 40);
    // moving right from a point on the horizon: horizontal (and the ray to the vanishing point) win
    expect(pickDirection(dirs, 10, 1)).toBeCloseTo(0);
    // a backwards movement picks the same line
    expect(pickDirection([Math.PI / 2], 0, -5)).toBeCloseTo(Math.PI / 2);
    const p = assistPoint({ x: 10, y: 10 }, 0, { x: 30, y: 17 });
    expect(p).toEqual({ x: 30, y: 10 });
    expect(pickDirection(guideDirections({ ...DEFAULT_GUIDE, mode: 'iso' }, 100, 100, 0, 0), 10, 5.8)).toBeCloseTo(Math.PI / 6);
  });
});
