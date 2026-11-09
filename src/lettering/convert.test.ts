import { describe, expect, it } from 'vitest';
import { readBalloon, type Pt } from './geometry';
import { outerContour } from './trace';

const ring = (cx: number, cy: number, a: number, b: number, n = 160): Pt[] => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2) * a, y: cy + Math.sin((i / n) * Math.PI * 2) * b }));

describe('tracing a painted shape', () => {
  it('walks the outer edge of the biggest blob, ignoring specks and holes', () => {
    const w = 60, h = 40, m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (((x - 30) / 22) ** 2 + ((y - 20) / 14) ** 2 <= 1) m[y * w + x] = 1;   // the balloon
      if (((x - 30) / 10) ** 2 + ((y - 20) / 4) ** 2 <= 1) m[y * w + x] = 0;    // a hole (where words were)
    }
    m[2 * w + 2] = 1; // a speck
    const c = outerContour(m, w, h);
    expect(c.length).toBeGreaterThan(60);
    const xs = c.map(p => p.x), ys = c.map(p => p.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6); expect(Math.max(...xs)).toBeLessThanOrEqual(54);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(4); expect(Math.max(...ys)).toBeLessThanOrEqual(36);
    // every step is one cell along an edge, and the walk closes
    for (let i = 1; i < c.length; i++) expect(Math.abs(c[i]!.x - c[i - 1]!.x) + Math.abs(c[i]!.y - c[i - 1]!.y)).toBe(1);
    expect(Math.abs(c[0]!.x - c.at(-1)!.x) + Math.abs(c[0]!.y - c.at(-1)!.y)).toBe(1);
  });
  it('follows diagonal edges of a stroked, hand-drawn ring (the outer edge, not a staircase across it)', () => {
    const w = 200, h = 120, m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = ((x - 100) / 80) ** 2 + ((y - 60) / 45) ** 2;
      if (e <= 1 && e >= 0.86) m[y * w + x] = 1; // a ring about 3 cells thick
    }
    const c = outerContour(m, w, h);
    const xs = c.map(p => p.x), ys = c.map(p => p.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(21); expect(Math.max(...xs)).toBeGreaterThanOrEqual(179);
    expect(Math.min(...ys)).toBeLessThanOrEqual(16); expect(Math.max(...ys)).toBeGreaterThanOrEqual(104);
    // every corner on the outer edge sits on the ellipse's outside (not inside the ring)
    for (const p of c) expect(((p.x - 100) / 80) ** 2 + ((p.y - 60) / 45) ** 2).toBeGreaterThan(0.8);
    const b = readBalloon(c)!;
    expect(b.style).toBe('speech');
  });
  it('keeps a one-cell-thin drawn outline in one piece (diagonals touch only at corners)', () => {
    const w = 120, h = 80, m = new Uint8Array(w * h);
    for (let i = 0; i < 2000; i++) { const t = (i / 2000) * Math.PI * 2; m[Math.round(40 + Math.sin(t) * 30) * w + Math.round(60 + Math.cos(t) * 50)] = 1; }
    const c = outerContour(m, w, h), xs = c.map(p => p.x), ys = c.map(p => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(60);
    expect(readBalloon(c)?.style).toBe('speech');
  });
  it('finds nothing in an empty mask', () => {
    expect(outerContour(new Uint8Array(100), 10, 10)).toEqual([]);
  });
});

describe('reading a drawn balloon', () => {
  it('a speech balloon with its tail drawn as one outline: the spike becomes the tail', () => {
    const pts = ring(200, 100, 120, 60);
    // pull a narrow spike out of the lower left
    const k = Math.round(160 * 0.62);
    for (let i = -4; i <= 4; i++) { const p = pts[(k + i + 160) % 160]!, f = 1 + 1.4 * (1 - Math.abs(i) / 5); pts[(k + i + 160) % 160] = { x: 200 + (p.x - 200) * f, y: 100 + (p.y - 100) * f }; }
    const b = readBalloon(pts)!;
    expect(b.style).toBe('speech');
    expect(b.tail).toBeDefined();
    // the spike points up and to the left (its tip near -11, 2)
    expect(b.tail!.x).toBeLessThan(10); expect(b.tail!.y).toBeLessThan(15);
    expect(b.width / b.height).toBeGreaterThan(1.6);
    expect(b.centre.x).toBeCloseTo(200, -1);
  });
  it('a plain box stays a box with no tail; a scribble is not a balloon', () => {
    const box: Pt[] = [];
    for (let i = 0; i <= 40; i++) box.push({ x: i * 6, y: 0 });
    for (let i = 1; i <= 15; i++) box.push({ x: 240, y: i * 6 });
    for (let i = 1; i <= 40; i++) box.push({ x: 240 - i * 6, y: 90 });
    for (let i = 1; i < 15; i++) box.push({ x: 0, y: 90 - i * 6 });
    const b = readBalloon(box)!;
    expect(b.style).toBe('box');
    expect(b.tail).toBeUndefined();
    expect(readBalloon([{ x: 0, y: 0 }, { x: 50, y: 5 }, { x: 100, y: 0 }, { x: 150, y: 8 }, { x: 200, y: 0 }, { x: 250, y: 4 }, { x: 300, y: 0 }, { x: 350, y: 2 }])).toBeNull();
  });
});

import { alongPath, pathBand, pathLength, textPath } from './geometry';
import { readCurve } from './spec';

describe('sound effects on a path', () => {
  it('makes an arc and a wave to the words’ length, centred, bending the way asked', () => {
    const up = textPath({ kind: 'arc', bend: 0.8 }, 300, 30), down = textPath({ kind: 'arc', bend: -0.8 }, 300, 30);
    const mid = (p: Pt[]) => p[Math.floor(p.length / 2)]!;
    expect(up[0]!.x).toBeCloseTo(-156, 0); expect(up.at(-1)!.x).toBeCloseTo(156, 0);
    // bending up: the middle is higher (smaller y) than the ends, and the whole is centred on the caption
    expect(mid(up).y).toBeLessThan(up[0]!.y - 50);
    expect(mid(down).y).toBeGreaterThan(down[0]!.y + 50);
    expect(Math.abs((Math.min(...up.map(p => p.y)) + Math.max(...up.map(p => p.y))) / 2)).toBeLessThan(2);
    const wave = textPath({ kind: 'wave', bend: 1 }, 300, 30);
    expect(Math.max(...wave.map(p => p.y)) - Math.min(...wave.map(p => p.y))).toBeGreaterThan(60);
  });
  it('finds points and directions along a path, carrying on straight past its ends', () => {
    const p: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pathLength(p)).toBe(20);
    expect(alongPath(p, 5)).toMatchObject({ x: 5, y: 0, angle: 0 });
    const turn = alongPath(p, 15);
    expect(turn.x).toBe(10); expect(turn.y).toBe(5); expect(turn.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(alongPath(p, -4)).toMatchObject({ x: -4, y: 0 });
    expect(alongPath(p, 26).y).toBeCloseTo(16, 6);
    expect(pathBand(p, 3)).toHaveLength(6);
  });
  it('reads text paths back safely', () => {
    expect(readCurve({ kind: 'arc', bend: 5 })).toEqual({ kind: 'arc', bend: 1 });
    expect(readCurve({ kind: 'drawn', points: [[0, 0], [10, 5]] })).toEqual({ kind: 'drawn', points: [[0, 0], [10, 5]] });
    expect(readCurve({ kind: 'drawn', points: [[0, 0]] })).toBeNull();
    expect(readCurve({ kind: 'spiral', bend: 1 })).toBeNull();
  });
});

import { balloonOutline as outlineOf, balloonShapes as shapesOf, inside as isInside } from './geometry';

describe('tails always close', () => {
  const ring = outlineOf('speech', 120, 70, 1, undefined, { wobble: 0 });
  it('a closed (seam) tail starts inside the balloon on both sides, however it bends or tapers', () => {
    for (const t of [{ x: 40, y: 260, bend: [150, 150] as [number, number] }, { x: -230, y: 140, bend: [-80, 160] as [number, number] }, { x: 0, y: 300 }]) {
      for (const shape of [{ taper: 1, tip: 0 }, { taper: 3, tip: 0.6 }, { taper: 0.3, tip: 0 }]) {
        const s = shapesOf(ring, [{ ...t, join: 'seam', width: 2.5, ...shape }], 0, 0, 30).seams[0]!;
        const n = s.length;
        // its first and last points (the base, on either side) are inside the balloon: no gap where it meets
        expect(isInside(ring, s[0]!) && isInside(ring, s[n - 1]!)).toBe(true);
      }
    }
  });
  it('a Joined tail that cannot merge exactly still joins (drawn in one outline), never as a seam', () => {
    const s = shapesOf(ring, [{ x: 30, y: 200, bend: [260, 60], join: 'merged', width: 4, taper: 3, tip: 0.6 }], 0, 0, 30);
    expect(s.seams).toHaveLength(0);
    expect(s.joined.length + (s.outline.length > ring.length ? 1 : 0)).toBeGreaterThan(0);
  });
  it('lightning: thin is a line with its thickness, thick is a closed bolt', () => {
    const thin = shapesOf(ring, [{ x: 0, y: 260, join: 'lightning', width: 1, line: 2.5 }], 0, 0, 30);
    expect(thin.zigzags).toHaveLength(1); expect(thin.zigzagWidths).toEqual([2.5]);
    const thick = shapesOf(ring, [{ x: 0, y: 260, join: 'lightning', width: 1, bolt: true }], 0, 0, 30);
    expect(thick.zigzags).toHaveLength(0); expect(thick.seams).toHaveLength(1);
    expect(isInside(ring, thick.seams[0]![0]!)).toBe(true);
  });
});
