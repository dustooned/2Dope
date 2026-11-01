import { describe, expect, it } from 'vitest';
import { cloneBrush, PRESETS } from './brush';
import type { StrokePoint, StrokeRecord } from './stroke';
import { eraseVectors, vectorWidths } from './vectorcut';
import { segDist, simplifyPoints, smoothPoints } from './vecedit';
import { strokeLength } from './stroke';
import { readVectorSvg, vectorsToSvg } from '../io/svg';

// The fixture: a long low-point line, a variable-width line, a crossing pair and a closed shape.
const P = (x: number, y: number, w?: number): StrokePoint => ({ x, y, pressure: 1, tiltX: 0, tiltY: 0, t: x, ...(w === undefined ? {} : { w }) });
const line = (id: string, points: StrokePoint[], size = 4, extra: Partial<StrokeRecord['brush']> = {}): StrokeRecord => ({ id, tool: 'pen', brush: { ...cloneBrush(PRESETS[0]!), size, taperStart: 0, taperEnd: 0, ...extra }, color: '#112233', seed: 1, points });
const long = () => line('long', [P(0, 100), P(300, 100)]);
const wide = () => line('wide', [P(0, 300, 1), P(100, 300, 1), P(200, 300, 3), P(300, 300, 1), P(400, 300, 1)], 6);
const pairA = () => line('a', [P(100, 500), P(200, 600)]);
const pairB = () => line('b', [P(200, 500), P(100, 600)]);
const closed = () => line('ring', Array.from({ length: 33 }, (_, i) => P(600 + 50 * Math.cos((i / 32) * 2 * Math.PI), 200 + 50 * Math.sin((i / 32) * 2 * Math.PI))));
const fixture = () => [long(), wide(), pairA(), pairB(), closed()];
const xs = (r: StrokeRecord) => r.points.map((p) => p.x);

describe('vector eraser: segments and drawn width', () => {
  it('hits a 300 px two-point segment mid-way, at its own half-width', () => {
    // 2.5 px from the centreline: radius 1 + half-width 2 reaches it; no stored point is near
    expect(eraseVectors([long()], [P(150, 102.5)], 1, 'whole')).toEqual([]);
    expect(eraseVectors([long()], [P(150, 104)], 1, 'whole')).toBeNull();
  });

  it('misses a thin tapered tail that the base width would have hit', () => {
    const tail = line('tail', [P(0, 0), P(300, 0)], 20, { taperEnd: 100 });
    const w = vectorWidths(tail, strokeLength(tail.points));
    expect(w[0]).toBeCloseTo(10);
    expect(w[1]!).toBeLessThan(1);
    expect(eraseVectors([tail], [P(298, 8)], 1, 'whole')).toBeNull();
    expect(eraseVectors([tail], [P(2, 8)], 1, 'whole')).toEqual([]);
  });

  it('only where it crosses: cuts the touched span, leaves grazes and starts alone', () => {
    const cut = eraseVectors([long()], [P(150, 90), P(150, 110)], 3, 'intersection')!;
    expect(cut).toHaveLength(2);
    expect(cut[0]!.points.at(-1)!.x).toBeCloseTo(145, 0);
    expect(cut[1]!.points[0]!.x).toBeCloseTo(155, 0);
    // starting on the line and moving off it is not a crossing
    expect(eraseVectors([long()], [P(150, 100), P(150, 130)], 3, 'intersection')).toBeNull();
    expect(eraseVectors([long()], [P(150, 100), P(150, 130)], 3, 'crossing')).toEqual([]);
  });

  it('up to crossings still stops at the other line of a crossing pair', () => {
    const out = eraseVectors([pairA(), pairB()], [P(110, 500), P(110, 530)], 2, 'crossing')!;
    const a = out.find((r) => r.id.startsWith('a~'))!;
    expect(a.points[0]!.x).toBeCloseTo(150);
    expect(a.points[0]!.y).toBeCloseTo(550);
    expect(out.find((r) => r.id === 'b')).toBeDefined();
  });

  it('a cut through a width peak keeps the local width at both new ends', () => {
    const out = eraseVectors([wide()], [P(200, 280), P(200, 320)], 2, 'intersection')!;
    expect(out).toHaveLength(2);
    const left = out[0]!.points.at(-1)!, right = out[1]!.points[0]!;
    // the point width runs 1 → 3 → 1 either side of x = 200
    expect(left.w!).toBeCloseTo(1 + (2 * (left.x - 100)) / 100, 5);
    expect(right.w!).toBeCloseTo(1 + (2 * (300 - right.x)) / 100, 5);
    expect(left.w!).toBeGreaterThan(2.5);
    // the cut ends lose their taper, the outer ends keep theirs
    expect(out[0]!.points[0]!.x).toBe(0);
  });
});

describe('simplify and smooth', () => {
  const wobbly = () => Array.from({ length: 60 }, (_, i) => P(i * 10, 100 + Math.sin(i * 0.15) * 30 + ((i * 7919) % 5) * 0.6));

  it('a wobbly 60-point line comes down below 15 points within tolerance, ends kept', () => {
    const pts = wobbly();
    const tol = 3;
    const out = simplifyPoints(pts, tol);
    expect(out.length).toBeLessThan(15);
    expect(out[0]).toEqual(pts[0]);
    expect(out.at(-1)).toEqual(pts.at(-1));
    for (const p of pts) {
      let d = Infinity;
      for (let i = 1; i < out.length; i++) d = Math.min(d, segDist(p, out[i - 1]!, out[i]!));
      expect(d).toBeLessThanOrEqual(tol + 1e-9);
    }
  });

  it('keeps the width profile: a width peak on a straight line survives', () => {
    const rec = line('w', Array.from({ length: 30 }, (_, i) => P(i * 10, 0, i === 15 ? 4 : 1)), 6);
    const out = simplifyPoints(rec.points, 2, vectorWidths(rec, strokeLength(rec.points)));
    expect(out.map((p) => p.w ?? 1)).toContain(4);
    expect(simplifyPoints(rec.points, 2).length).toBe(2); // without widths it would be lost
  });

  it('smooths within tolerance, ends fixed, less wobble', () => {
    const pts = wobbly();
    const out = smoothPoints(pts, 2);
    expect(out[0]).toEqual(pts[0]);
    expect(out.at(-1)).toEqual(pts.at(-1));
    const bend = (q: { x: number; y: number }[]) => q.slice(1, -1).reduce((s, p, i) => s + (q[i]!.y + q[i + 2]!.y - 2 * p.y) ** 2, 0);
    expect(bend(out)).toBeLessThan(bend(pts));
    pts.forEach((p, i) => expect(Math.hypot(out[i]!.x - p.x, out[i]!.y - p.y)).toBeLessThanOrEqual(2 + 1e-9));
    expect(out.map((p) => p.pressure)).toEqual(pts.map((p) => p.pressure));
  });
});

describe('SVG export of vector lines', () => {
  it('round-trips the fixture: one path per line, same point count, bounds and width profile', () => {
    const lines = fixture();
    const svg = vectorsToSvg([...lines, { ...long(), id: 'rub', tool: 'eraser' }], 1280, 720, 'Lines & <test>');
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 1280 720"');
    expect(svg).toContain('Lines &amp; &lt;test>');
    const back = readVectorSvg(svg);
    expect(back.map((l) => l.id)).toEqual(lines.map((l) => l.id));
    const box = (q: { x: number; y: number }[]) => [Math.min(...q.map((p) => p.x)), Math.min(...q.map((p) => p.y)), Math.max(...q.map((p) => p.x)), Math.max(...q.map((p) => p.y))];
    lines.forEach((rec, i) => {
      const l = back[i]!;
      expect(l.points.length).toBe(rec.points.length);
      box(l.points).forEach((v, k) => expect(v).toBeCloseTo(box(rec.points)[k]!, 2));
      expect(l.color).toBe('#112233');
      const w = vectorWidths(rec, strokeLength(rec.points));
      l.widths!.forEach((v, k) => expect(v).toBeCloseTo(w[k]!, 2));
    });
    // the variable-width line writes its average width; the peak is in the profile
    expect(Math.max(...back[1]!.widths!)).toBeCloseTo(9, 1);
  });

  it('exports what is left after erase, cut and simplify', () => {
    let lines = eraseVectors(fixture(), [P(150, 90), P(150, 110)], 3, 'intersection')!;
    lines = lines.map((r) => (r.id === 'ring' ? { ...r, points: simplifyPoints(r.points, 2) } : r));
    const back = readVectorSvg(vectorsToSvg(lines, 1280, 720));
    expect(back).toHaveLength(6);
    expect(back.find((l) => l.id === 'ring')!.points.length).toBe(lines.find((r) => r.id === 'ring')!.points.length);
    expect(xs(lines.find((r) => r.id === 'long~0')!).at(-1)).toBeCloseTo(145, 0);
  });
});
