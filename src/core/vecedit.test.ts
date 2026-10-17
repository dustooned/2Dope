import { describe, expect, it } from 'vitest';
import { anchorsOf, isClosed, moveAnchor, nearestStroke } from './vecedit';

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
