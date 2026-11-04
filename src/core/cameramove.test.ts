import { describe, expect, it } from 'vitest';
import { cameraMove, type CameraMove } from './cameramove';
import { cameraLayer, newComp } from './comp';
import { LINEAR, staticProp } from './anim';
const rig = () => { const comp = newComp('shot', 'Shot', 200, 100, 24); comp.duration = 48; return { comp, comps: new Map([[comp.id, comp]]) }; };
const options: CameraMove = { kind: 'push', start: 5, end: 20, strength: 15, direction: 'right', ease: 'easeInOut', replace: false };
describe('camera move builder', () => {
  it('creates a detached camera with a relative push and concrete easing', () => {
    const { comp, comps } = rig(), result = cameraMove(comp, comps, null, options, 'new');
    expect(result.zoom.keys.map(k => [k.f, k.v])).toEqual([[5, 100], [20, 114.99999999999999]]); expect(result.zoom.keys[0]?.out.interp).toBe('bezier'); expect(comp.layers).toHaveLength(0);
  });
  it('preserves outside keys and other channels; explicit replacement is required inside the range', () => {
    const { comp, comps } = rig(), cam = cameraLayer('cam', comp); cam.start = 2;
    cam.zoom.keys = [0, 10, 40].map(f => ({ f, v: 200, in: LINEAR, out: LINEAR })); const before = structuredClone(cam);
    expect(() => cameraMove(comp, comps, cam, options, 'unused')).toThrow('Replace keys'); const next = cameraMove(comp, comps, cam, { ...options, replace: true }, 'unused');
    expect(next.zoom.keys.map(k => k.f)).toEqual([0, 3, 18, 40]); expect(next.zoom.keys.at(-2)?.v).toBeCloseTo(230); expect(next.transform).toEqual(cam.transform); expect(cam).toEqual(before);
  });
  it('pulls by the reciprocal factor and pans by comp dimensions', () => {
    const { comp, comps } = rig(), cam = cameraLayer('cam', comp); cam.zoom = staticProp(200);
    expect(cameraMove(comp, comps, cam, { ...options, kind: 'pull' }, '').zoom.keys.at(-1)?.v).toBeCloseTo(200 / 1.15);
    expect(cameraMove(comp, comps, cam, { ...options, kind: 'pan', direction: 'up', strength: 10 }, '').transform.position.keys.at(-1)?.v).toEqual([100, 40]);
  });
  it.each([{ start: -1 }, { end: 48 }, { end: 5 }, { strength: 31 }, { start: 1.5 }, { strength: NaN }])('rejects invalid ranges/settings: %j', patch => { const { comp, comps } = rig(); expect(() => cameraMove(comp, comps, null, { ...options, ...patch }, 'new')).toThrow(); });
  it('refuses locked, hidden, trimmed and invalid-zoom targets', () => {
    const { comp, comps } = rig(), cam = cameraLayer('cam', comp); cam.locked = true; expect(() => cameraMove(comp, comps, cam, options, '')).toThrow('Unlock'); cam.locked = false; cam.visible = false; expect(() => cameraMove(comp, comps, cam, options, '')).toThrow('visible'); cam.visible = true; cam.out = 15; expect(() => cameraMove(comp, comps, cam, options, '')).toThrow('visible'); cam.out = null; cam.zoom.value = 0; expect(() => cameraMove(comp, comps, cam, options, '')).toThrow('above zero');
  });
});
