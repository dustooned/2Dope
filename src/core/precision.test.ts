import { describe, expect, it } from 'vitest';
import { LINEAR, valueAt, reverseKeys, type Prop, type Vec2 } from './anim';
import { editTiming, smoothPath, spatialHandle, straightPath, validateProperty } from './precision';
import { alignment, distribution, readSnap, snapBox } from './layout';
import { parsePath, pathPoints, writePath } from './pathgeometry';
import { channels } from '../io/blender';
import { captureMotion, presetLayer, readPreset } from './presets';
import { drawingsLayer, newComp } from './comp';
const path = (): Prop<Vec2> => ({ value: [0, 0], keys: [{ f: 0, v: [0, 0], in: LINEAR, out: LINEAR, spatial: { in: [0, 0], out: [0, 100] } }, { f: 10, v: [100, 0], in: LINEAR, out: LINEAR, spatial: { in: [0, 100], out: [0, 0] } }] });
describe('independent spatial and temporal curves', () => {
  it('evaluates cubic paths, exact endpoints, holds and missing straight handles', () => {
    const p = path(); expect(valueAt(p, 5)).toEqual([50, 75]); expect(valueAt(p, -1)).toEqual([0, 0]); expect(valueAt(p, 11)).toEqual([100, 0]);
    p.keys[0]!.out = { ...LINEAR, interp: 'hold' }; expect(valueAt(p, 9)).toEqual([0, 0]); p.keys[0]!.out = LINEAR; delete p.keys[1]!.spatial; expect(valueAt(p, 5)).toEqual([37.5, 37.5]);
  });
  it('reverses offsets as well as time, reproducing the same trajectory backwards', () => { const p = path(), r = reverseKeys(p, 0, 10); for (let f = 0; f <= 10; f++) { expect(valueAt(r, f)[0]).toBeCloseTo(valueAt(p, 10 - f)[0], 10); expect(valueAt(r, f)[1]).toBeCloseTo(valueAt(p, 10 - f)[1], 10); } });
  it('smooths without moving keys or changing timing, then restores straight segments', () => { const p = path(); p.keys.push({ f: 20, v: [100, 100], in: LINEAR, out: LINEAR }); const s = smoothPath(p); expect(s.keys[1]!.spatial?.out).toEqual([100 / 6, 100 / 6]); expect(s.keys.map(k => k.v)).toEqual(p.keys.map(k => k.v)); expect(straightPath(s).keys.every(k => !k.spatial)).toBe(true); expect(spatialHandle(straightPath(s), 0, 'out')).toEqual([100 / 3, 0]); });
  it('edits timing without altering geometry and rejects unordered/nonfinite values', () => { const p = path(), edited = editTiming(p, 0, 'out', [.2, 0]); expect(edited.keys[0]!.spatial).toEqual(p.keys[0]!.spatial); expect(edited.keys[0]!.out.slope).toBe(0); expect(() => validateProperty(edited)).not.toThrow(); const bad = path(); bad.keys[1]!.f = 0; expect(() => validateProperty(bad)).toThrow(); bad.keys[1]!.f = 10; bad.keys[1]!.spatial!.in[0] = NaN; expect(() => validateProperty(bad)).toThrow(); });
  it('bakes curved Blender channels at comp frames and preserves layer offsets', () => { const p = path(), c = channels(p, ['position.x', 'position.y'], 3, 18); expect(c['position.y']!.keys![8]!.value).toBe(75); expect(c['position.x']!.keys![0]!.value).toBe(0); expect(c['position.x']!.keys!.at(-1)!.value).toBe(100); expect(c['position.y']!.keys!.every(k => k.interp === 'LINEAR')).toBe(true); });
  it('uses portable preset version 2 and rescales position handles to the target canvas', () => { const c = newComp('c', 'Shot', 200, 100, 24), l = drawingsLayer('l', 'Art', [{ drawing: 'd', length: 30 }], 200, 100); l.transform.position = path(); const p = captureMotion(l, c, 'curve', 'Curve'); expect(p.version).toBe(2); expect(readPreset(p)).toEqual(p); expect(() => readPreset({ ...p, version: 1 })).toThrow(); const target = newComp('t', 'Target', 400, 200, 24), placed = presetLayer(p, l, target, { frame: 0, duration: 10, append: false }, () => 'id'); expect(placed.transform.position.keys[0]!.spatial!.out).toEqual([0, 200]); });
});
describe('layout geometry', () => {
  const items = [{ id: 'a', box: { x: 10, y: 0, w: 20, h: 10 } }, { id: 'b', box: { x: 45, y: 30, w: 10, h: 20 } }, { id: 'c', box: { x: 100, y: 80, w: 30, h: 10 } }];
  it('aligns actual edges and centers to a specified rectangle', () => { expect(alignment(items, { x: 0, y: 0, w: 200, h: 100 }, 'right').get('a')).toEqual([170, 0]); expect(alignment(items, { x: 0, y: 0, w: 200, h: 100 }, 'centerY').get('b')).toEqual([0, 10]); });
  it('distributes equal gaps with unequal sizes and fixed outside objects', () => { const d = distribution(items, 'horizontal'); expect(d.get('a')).toEqual([0, 0]); expect(d.get('b')).toEqual([15, 0]); expect(d.get('c')).toEqual([0, 0]); expect(() => distribution(items.slice(0, 2), 'vertical')).toThrow(); });
  it('snaps only inside tolerance and clamps persisted grid settings', () => { expect(snapBox({ x: 3, y: 20, w: 10, h: 10 }, [{ x: 0, y: 0, w: 100, h: 100 }], 4).delta).toEqual([-3, 0]); expect(snapBox({ x: 3, y: 20, w: 10, h: 10 }, [], 1).guides).toEqual([]); expect(readSnap({ size: -5, on: true }).size).toBe(1); expect(readSnap({ size: Infinity }).size).toBe(16); });
});
describe('exact SVG node geometry', () => {
  it('normalizes repeated moves, relative horizontal/vertical segments and closed subpaths', () => { expect(parsePath('m10 20 5 6 h3 v4 z')).toEqual([{ cmd: 'M', values: [10, 20] }, { cmd: 'L', values: [15, 26] }, { cmd: 'L', values: [18, 26] }, { cmd: 'L', values: [18, 30] }, { cmd: 'Z', values: [] }]); });
  it('reflects cubic/quadratic shorthand and retains elliptical arc parameters', () => { const n = parsePath('M0 0 C1 2 3 4 5 6 s4 5 6 7 Q20 21 22 23 t5 6 A10 20 30 0 1 40 50'); expect(n[2]).toEqual({ cmd: 'C', values: [7, 8, 9, 11, 11, 13] }); expect(n[4]).toEqual({ cmd: 'Q', values: [24, 25, 27, 29] }); expect(n[5]!.values).toEqual([10, 20, 30, 0, 1, 40, 50]); expect(parsePath(writePath(n))).toEqual(n); expect(pathPoints(n).filter(p => p.handle)).toHaveLength(6); });
  it.each(['M0 0 L5', 'M0 0 X1 2', 'M0 0 A-1 2 0 0 0 3 4', 'M0 0 A1 2 0 2 1 3 4', 'L1 2', 'M0 0Z1 2'])('refuses malformed paths: %s', p => expect(() => parsePath(p)).toThrow());
  it('reads compact SVG arc flags without flattening arcs', () => { expect(parsePath('M0 0 A10 20 0 0110 20')[1]).toEqual({cmd:'A',values:[10,20,0,0,1,10,20]}); });
  it('bounds editing work for very large paths without flattening the original', () => expect(() => parsePath('M0 0 ' + 'L1 2 '.repeat(2000))).toThrow(/complex/));
});
