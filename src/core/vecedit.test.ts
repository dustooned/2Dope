import { describe, expect, it } from 'vitest';
import { allStraight, anchorsOf, isClosed, joinStrokes, moveAnchor, movePoint, nearestStroke, scaleWidthAt, setPointMode, snapTarget } from './vecedit';

const line = (pts: [number, number][], step = 1) => {
  const out: { x: number; y: number; pressure: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n, pressure: 0.5 });
  }
  const [lx, ly] = pts[pts.length - 1]!;
  out.push({ x: lx, y: ly, pressure: 0.5 });
  return out;
};

describe('vector point editing', () => {
  it('finds the corners of a drawn polyline', () => {
    const pts = line([[0, 0], [100, 0], [100, 100], [0, 100]]);
    const a = anchorsOf(pts).map((i) => [Math.round(pts[i]!.x), Math.round(pts[i]!.y)]);
    expect(a).toEqual([[0, 0], [100, 0], [100, 100], [0, 100]]);
  });

  it('a straight line has just its two ends', () => {
    expect(anchorsOf(line([[0, 0], [200, 0]]))).toHaveLength(2);
  });

  it('moving a corner moves it fully, neighbours not at all, and bends in between', () => {
    const pts = line([[0, 0], [100, 0], [200, 0]]);
    const anchors = [0, 100, 200];
    const moved = moveAnchor(pts, anchors, 1, 0, 40);
    expect(moved[100]!.y).toBe(40);
    expect(moved[0]!.y).toBe(0);
    expect(moved[200]!.y).toBe(0);
    expect(moved[50]!.y).toBeGreaterThan(0);
    expect(moved[50]!.y).toBeLessThan(40);
    expect(moved[50]!.pressure).toBe(0.5);
    expect(pts[100]!.y).toBe(0); // the original is untouched
  });

  it('on a closed shape the join moves as one point', () => {
    const pts = line([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]);
    expect(isClosed(pts)).toBe(true);
    const anchors = anchorsOf(pts);
    const moved = moveAnchor(pts, anchors, 0, -10, -10);
    expect(moved[0]).toMatchObject({ x: -10, y: -10 });
    expect(moved[moved.length - 1]).toMatchObject({ x: -10, y: -10 });
  });

  it('picks the stroke nearest a tap', () => {
    const a = { points: line([[0, 0], [100, 0]]) };
    const b = { points: line([[0, 50], [100, 50]]) };
    expect(nearestStroke([a, b], 40, 46, 10)).toBe(1);
    expect(nearestStroke([a, b], 40, 25, 10)).toBe(-1);
  });
});

describe('straight and curved points', () => {
  it('a straight point lays straight lines to its neighbours, even after moving', () => {
    const pts = line([[0, 0], [100, 0], [200, 0]]);
    const m = movePoint(pts, [0, 100, 200], 1, 0, 50, 'straight');
    expect(m[100]!.y).toBe(50);
    expect(m[50]!.y).toBeCloseTo(25);
    expect(m[150]!.y).toBeCloseTo(25);
  });

  it('a curved point bends smoothly instead', () => {
    const pts = line([[0, 0], [100, 0], [200, 0]]);
    const m = movePoint(pts, [0, 100, 200], 1, 0, 50, 'curve');
    expect(m[75]!.y).toBeGreaterThan(37.5); // nearer the point, the bend sits above the straight line
  });

  it('switching a corner to curved rounds its spans, and all straight makes a polyline', () => {
    const pts = line([[0, 0], [100, 0], [100, 100]]);
    const anchors = [0, 100, 200];
    const curved = setPointMode(pts, anchors, 1, 'curve');
    expect(curved[150]!.x).toBeGreaterThan(100); // the second span bows out past the corner
    const back = allStraight(curved, anchors);
    expect(back[150]!.x).toBeCloseTo(100);
    expect(back[150]!.y).toBeCloseTo(50);
  });
});

describe('snapping and joining points', () => {
  it('snaps to the nearest point in reach, and not beyond it', () => {
    const c = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(snapTarget(c, 9, 1, 5)).toEqual({ x: 10, y: 0 });
    expect(snapTarget(c, 30, 0, 5)).toBeNull();
  });

  it('joins two lines at the touching ends, whichever way they were drawn', () => {
    const a = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const b = [{ x: 20, y: 0 }, { x: 15, y: 0 }, { x: 10, y: 0 }];
    expect(joinStrokes(a, 'end', b, 'end').map((p) => p.x)).toEqual([0, 5, 10, 15, 20]);
    const c = [{ x: 0, y: 0 }, { x: -5, y: 0 }, { x: -10, y: 0 }];
    expect(joinStrokes(a, 'start', c, 'start').map((p) => p.x)).toEqual([10, 5, 0, -5, -10]);
  });
});

describe('width at a point', () => {
  it('thickens only around the chosen point, fading to nothing at its neighbours', () => {
    const pts: { x: number; y: number; pressure: number; w?: number }[] = line([[0, 0], [100, 0], [200, 0], [300, 0]]);
    const out = scaleWidthAt(pts, [0, 100, 200, 300], 1, 2);
    expect(out[100]!.w).toBe(2);
    expect(out[0]!.w).toBe(1);
    expect(out[200]!.w).toBe(1);
    expect(out[50]!.w).toBeGreaterThan(1);
    expect(out[50]!.w).toBeLessThan(2);
    expect(out[250]!.w).toBeUndefined();
    expect(pts[100]!.w).toBeUndefined();
  });
});
