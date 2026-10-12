import { describe, expect, it } from 'vitest';
import { smoothStroke } from '../brush/smoothing';
import { PRESETS } from './brush';
import type { StrokePoint, StrokeRecord } from './stroke';
import { eraseVectors } from './vectorcut';

const pt = (x: number, y: number): StrokePoint => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, t: 0 });
const line = (id: string, from: [number, number], to: [number, number], n = 20): StrokeRecord => ({
  id,
  tool: 'pen',
  brush: { ...PRESETS[1]!, size: 2, taperStart: 10, taperEnd: 10 },
  color: '#000000',
  seed: 1,
  points: Array.from({ length: n + 1 }, (_, i) => pt(from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n)),
});

describe('post-correction', () => {
  it('straightens a wobbly line and keeps both ends where the pen was', () => {
    const wobbly = Array.from({ length: 101 }, (_, i) => pt(i * 2, 50 + (i % 2 ? 2 : -2)));
    const out = smoothStroke(wobbly, 0.6);
    const dev = (ps: StrokePoint[]) => ps.slice(10, -10).reduce((m, p) => Math.max(m, Math.abs(p.y - 50)), 0);
    expect(dev(out)).toBeLessThan(dev(wobbly) / 4);
    expect([out[0]!.x, out[0]!.y]).toEqual([wobbly[0]!.x, wobbly[0]!.y]);
    expect([out[100]!.x, out[100]!.y]).toEqual([wobbly[100]!.x, wobbly[100]!.y]);
    expect(out[50]!.pressure).toBe(0.5);
    expect(smoothStroke(wobbly, 0)).toBe(wobbly);
  });
});

describe('vector eraser', () => {
  // a horizontal line crossed by two verticals at x = 30 and x = 70
  const h = line('h', [0, 50], [100, 50], 50);
  const v1 = line('v1', [30, 0], [30, 100]);
  const v2 = line('v2', [70, 0], [70, 100]);

  it('"whole" removes every touched line', () => {
    const out = eraseVectors([h, v1, v2], [pt(90, 50)], 2, 'whole')!;
    expect(out.map((s) => s.id)).toEqual(['v1', 'v2']);
  });

  it('"crossing" removes only the overshoot past the last crossing', () => {
    const out = eraseVectors([h, v1, v2], [pt(90, 50)], 2, 'crossing')!;
    const rest = out.find((s) => s.id.startsWith('h~'))!;
    expect(out.map((s) => s.id).sort()).toEqual(['h~0', 'v1', 'v2']);
    expect(rest.points[0]!.x).toBeCloseTo(0);
    expect(rest.points[rest.points.length - 1]!.x).toBeCloseTo(70, 1);
    // the cut end is blunt, the original start keeps its taper
    expect(rest.brush.taperEnd).toBe(0);
    expect(rest.brush.taperStart).toBe(10);
  });

  it('"crossing" in the middle splits the line in two', () => {
    const out = eraseVectors([h, v1, v2], [pt(50, 50)], 2, 'crossing')!;
    const pieces = out.filter((s) => s.id.startsWith('h~'));
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.points[pieces[0]!.points.length - 1]!.x).toBeCloseTo(30, 1);
    expect(pieces[1]!.points[0]!.x).toBeCloseTo(70, 1);
  });

  it('a line with no crossings goes entirely; untouched lines are left alone (null when nothing changed)', () => {
    const lone = line('lone', [0, 90], [100, 90]);
    const short = line('short', [30, 0], [30, 60]);
    expect(eraseVectors([lone, short], [pt(50, 90)], 2, 'crossing')!.map((s) => s.id)).toEqual(['short']);
    expect(eraseVectors([h, v1], [pt(5, 5)], 2, 'crossing')).toBeNull();
    expect(eraseVectors([h], [pt(50, 50)], 2, 'off')).toBeNull();
  });
});
