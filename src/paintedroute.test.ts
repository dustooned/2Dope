import { describe, expect, it } from 'vitest';
import { longestPath } from './paintedroute';

describe('a route from a painted line', () => {
  it('runs end to end through a curved brush line, through its middle', () => {
    const w = 120, h = 60, on = new Uint8Array(w * h);
    // an S-curve about 3 cells thick
    for (let x = 10; x < 110; x++) { const yc = 30 + Math.sin((x - 10) / 16) * 18; for (let y = Math.round(yc) - 1; y <= Math.round(yc) + 1; y++) on[y * w + x] = 1; }
    const r = longestPath(on, w, h)!;
    expect(r).not.toBeNull();
    const ends = [r[0]!, r[r.length - 1]!].sort((a, b) => a[0] - b[0]);
    expect(ends[0]![0]).toBeLessThan(14); expect(ends[1]![0]).toBeGreaterThan(105);
    // every point sits on the line's middle (within a cell)
    for (const [x, y] of r) expect(Math.abs(y - (30 + Math.sin((x - 10.5) / 16) * 18) - 0.5)).toBeLessThan(2.2);
  });
  it('is not a route for a thick painted shape (a character), or nothing', () => {
    const w = 60, h = 60, on = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - 30) ** 2 + (y - 30) ** 2 < 400) on[y * w + x] = 1;
    expect(longestPath(on, w, h)).toBeNull();
    expect(longestPath(new Uint8Array(100), 10, 10)).toBeNull();
  });
});
