import { describe, expect, it } from 'vitest';
import { deformation, transformNodes, validTransformNodes, type Point } from './transformmesh';

const box = { x0: 20, y0: 30, x1: 79, y1: 89 };
const affine = [0, -2, -1, 0, 200, 200] as const;

describe('selection deformation', () => {
  it('maps the dragged Distort corner through rotation and flip and round-trips interior pixels', () => {
    const nodes = transformNodes(box, 2);
    nodes[0] = [32, 44];
    const warp = deformation(box, nodes, affine);
    expect(warp.forward(20, 30)).toEqual([156, 136]);
    expect(warp.forward(80, 90)).toEqual([110, 40]);
    const pixel: Point = [57.5, 69.5];
    const restored = warp.inverse(...warp.forward(...pixel))!;
    expect(restored[0]).toBeCloseTo(pixel[0]);
    expect(restored[1]).toBeCloseTo(pixel[1]);
    expect(warp.inverse(30, 10)).toBeNull();
  });

  it('moves the Warp center while holding the perimeter and rejects folded cells', () => {
    const nodes = transformNodes(box, 3);
    nodes[4] = [61, 65];
    expect(validTransformNodes(nodes)).toBe(true);
    const warp = deformation(box, nodes, [1, 0, 0, 1, 0, 0]);
    expect(warp.forward(50, 60)).toEqual([61, 65]);
    expect(warp.forward(80, 90)).toEqual([80, 90]);
    expect(warp.inverse(61, 65)).toEqual([50, 60]);
    nodes[4] = [90, 45];
    expect(validTransformNodes(nodes)).toBe(false);
  });
});
