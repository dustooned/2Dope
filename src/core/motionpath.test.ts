import { describe, expect, it } from 'vitest';
import { travelAngle, valueAt, type Vec2 } from './anim';
import { drawingsLayer, newComp, rotationAt, worldMatrix } from './comp';
import { pathProp } from './motionpath';
import { compFile, compsFromFile, minimumDrawingSchema } from '../io/schema';

const line = (from: Vec2, to: Vec2, n = 20): Vec2[] => Array.from({ length: n + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
// a curve with tight bends and long sweeps: key-to-key timing speeds up and slows down along it
const wave: Vec2[] = Array.from({ length: 121 }, (_, i) => [i * 3, 60 * Math.sin(i / 12) + (i > 60 ? (i - 60) * 4 : 0)]);
const ell: Vec2[] = [...line([0, 0], [200, 0]), ...line([200, 0], [200, 50]).slice(1)];

describe('animate along a path', () => {
  it('turns a drawn line into curved position keys from the playhead, ending where the line ends', () => {
    const p = pathProp(ell, 10, 34)!;
    expect(p.keys[0]!.f).toBe(10);
    expect(p.keys.at(-1)!.f).toBe(34);
    expect(p.keys[0]!.v).toEqual([0, 0]);
    expect(p.keys.at(-1)!.v).toEqual([200, 50]);
    expect(p.keys.length).toBeGreaterThanOrEqual(3);
    expect(p.keys.every(k => !!k.spatial)).toBe(true);
    expect(p.even).toBe(true);
    // strictly increasing frames
    expect(p.keys.every((k, i) => !i || k.f > p.keys[i - 1]!.f)).toBe(true);
  });

  it('keeps a steady speed along the path with Even speed, and not without it', () => {
    const steps = (even: boolean) => {
      const p = pathProp(wave, 0, 40, even)!;
      const d: number[] = [];
      for (let f = 1; f <= 40; f++) { const a = valueAt(p, f - 1), b = valueAt(p, f); d.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
      return Math.max(...d) / Math.min(...d);
    };
    expect(steps(true)).toBeLessThan(1.08);
    expect(steps(false)).toBeGreaterThan(steps(true));
  });

  it('closes a loop smoothly and refuses lines too short to travel', () => {
    const circle: Vec2[] = Array.from({ length: 41 }, (_, i) => [100 + 50 * Math.cos((i / 40) * Math.PI * 2), 100 + 50 * Math.sin((i / 40) * Math.PI * 2)]);
    const p = pathProp(circle, 0, 48)!;
    expect(p.keys.at(-1)!.v).toEqual(p.keys[0]!.v);
    const a = p.keys[0]!.spatial!.out, b = p.keys.at(-1)!.spatial!.in;
    // the last key arrives heading the way the first key leaves
    expect(Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(-b[1], -b[0]))).toBeLessThan(0.05);
    expect(pathProp([[0, 0], [1, 0]], 0, 10)).toBeNull();
    expect(pathProp(ell, 5, 5)).toBeNull();
    expect(pathProp(ell, 0, 2)!.keys.length).toBeLessThanOrEqual(3);
  });

  it('turns the layer to face the way it travels when Orient along path is on', () => {
    const c = newComp('c', 'Shot', 320, 180, 24);
    const l = drawingsLayer('a', 'Fish', [{ drawing: 'd', length: 40 }], 32, 32, 320, 180);
    l.transform.position = pathProp(ell, 0, 40)!;
    c.layers = [l];
    expect(travelAngle(l.transform.position, 5)).toBeCloseTo(0, 0);
    expect(travelAngle(l.transform.position, 39)).toBeCloseTo(90, 0);
    expect(rotationAt(l.transform, 5)).toBe(0);
    l.transform.orient = true;
    expect(rotationAt(l.transform, 39)).toBeCloseTo(90, 0);
    const m = worldMatrix(c, l, 39);
    expect(Math.atan2(m[1], m[0]) * 180 / Math.PI).toBeCloseTo(90, 0);
  });

  it('saves even speed and orient, and needs reader 9 only when they are used', () => {
    const c = newComp('c', 'Shot', 320, 180, 24);
    const l = drawingsLayer('a', 'Fish', [{ drawing: 'd', length: 40 }], 32, 32, 320, 180);
    c.layers = [l];
    expect(minimumDrawingSchema({}, { c: compFile(c) })).toBeLessThan(9);
    l.transform.position = pathProp(ell, 0, 40)!;
    l.transform.orient = true;
    const file = compFile(c);
    expect(minimumDrawingSchema({}, { c: file })).toBe(9);
    const back = compsFromFile({ comps: { c: JSON.parse(JSON.stringify(file)) } }).get('c')!.layers[0]!;
    expect(back.transform.orient).toBe(true);
    expect(back.transform.position.even).toBe(true);
    expect(valueAt(back.transform.position, 17)).toEqual(valueAt(l.transform.position, 17));
  });
});
