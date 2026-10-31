import { describe, expect, it } from 'vitest';
import { ACTION_SAFE, DEFAULT_CANVAS_VIEW, overviewEntries, readCanvasView, safeRect, TITLE_SAFE } from './canvasview';

describe('canvas view options', () => {
  it('reads stored preferences, falling back to defaults', () => {
    expect(readCanvasView(null)).toEqual(DEFAULT_CANVAS_VIEW);
    expect(readCanvasView('yes')).toEqual(DEFAULT_CANVAS_VIEW);
    expect(readCanvasView({ overscan: true, safeAreas: 'on', centre: 1, overview: true, extra: true }))
      .toEqual({ overscan: true, safeAreas: false, centre: false, overview: true });
  });

  it('places action-safe (90%) and title-safe (80%) frames in the middle', () => {
    expect(safeRect(1920, 1080, ACTION_SAFE)).toEqual({ x: 96, y: 54, w: 1728, h: 972 });
    expect(safeRect(1920, 1080, TITLE_SAFE)).toEqual({ x: 192, y: 108, w: 1536, h: 864 });
    expect(safeRect(100, 50, 2)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it('lists the drawings around the current one', () => {
    const ex = ['a', 'b', 'c', 'd', 'e', 'f'].map((drawing, i) => ({ drawing, length: i + 1 }));
    // starts: a0 b1 c3 d6 e10 f15
    const mid = overviewEntries(ex, 7);
    expect(mid.map((e) => e.drawing)).toEqual(['b', 'c', 'd', 'e', 'f']);
    expect(mid.find((e) => e.current)).toMatchObject({ drawing: 'd', start: 6, length: 4 });
    expect(overviewEntries(ex, 0, 1).map((e) => e.drawing)).toEqual(['a', 'b']);
    // past the end or before the start: the nearest drawing is current
    expect(overviewEntries(ex, 99, 1).filter((e) => e.current).map((e) => e.drawing)).toEqual(['f']);
    expect(overviewEntries(ex, -3, 0).map((e) => e.drawing)).toEqual(['a']);
    expect(overviewEntries([], 0)).toEqual([]);
  });
});
