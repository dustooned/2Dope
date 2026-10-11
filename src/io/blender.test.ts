import { describe, expect, it } from 'vitest';
import { setKey, setSegmentEasing, staticProp, type Vec2 } from '../core/anim';
import { cameraLayer, compLayer, drawingsLayer, newComp, nullLayer, type Comp } from '../core/comp';
import { channels, planBlender, plannedLayers, runs } from './blender';

function project() {
  const shot = newComp('c1', 'Shot', 400, 300, 12);
  const walk = newComp('c2', 'Walk', 400, 300, 12);
  walk.layers.push(drawingsLayer('W', 'Legs', [{ drawing: 'w1', length: 2 }, { drawing: 'w2', length: 2 }], 400, 300));
  shot.layers.push(cameraLayer('cam', shot), nullLayer('N', 'Handle', shot), compLayer('P', 'Walk', walk, shot), drawingsLayer('B', 'Ball', [{ drawing: 'b1', length: 3 }, { drawing: 'b2', length: 1 }], 400, 300));
  const comps = new Map<string, Comp>([
    ['c1', shot],
    ['c2', walk],
  ]);
  return { name: 'Test', main: 'c1', width: 400, height: 300, comps, shot, walk };
}

describe('Blender plan', () => {
  it('maps layer kinds: camera, null, instance, drawings; the instanced comp gets its own entry', () => {
    const p = project();
    const plan = planBlender(p, 'test');
    const L = plannedLayers(plan, 'c1');
    expect(L.cam!.kind).toBe('camera');
    expect(L.N!.kind).toBe('null');
    expect(L.P!.kind).toBe('instance');
    expect(L.P!.comp).toBe('c2');
    expect(L.B!.kind).toBe('drawings');
    expect(Object.keys(plan.scene.comps).sort()).toEqual(['c1', 'c2']);
    expect([...plan.drawings].sort()).toEqual(['b1', 'b2', 'w1', 'w2']);
    expect(plan.scene.images['d:b1']).toBe('drawings/b1.png');
    expect(plan.renders).toHaveLength(0);
  });

  it('drawings layers list which image shows on each frame, as runs', () => {
    const plan = planBlender(project(), 'test');
    expect(plannedLayers(plan, 'c1').B!.frames).toEqual([
      { from: 0, to: 2, image: 'd:b1' },
      { from: 3, to: 3, image: 'd:b2' },
    ]);
    expect(runs(['a', 'a', null, 'a'])).toEqual([
      { from: 0, to: 1, image: 'a' },
      { from: 2, to: 2, image: null },
      { from: 3, to: 3, image: 'a' },
    ]);
  });

  it('a precomp on its own clock (offset, looping) is rendered by 2Dope, identical frames once', () => {
    const p = project();
    const P = p.shot.layers.find((l) => l.id === 'P')!;
    if (P.kind === 'comp') {
      P.play = 'loop';
      P.out = 12;
    }
    const plan = planBlender(p, 'test');
    const L = plannedLayers(plan, 'c1').P!;
    expect(L.kind).toBe('baked');
    expect(plan.renders).toHaveLength(2); // w1 and w2 only, however many loops
    expect(L.frames!.map((r) => [r.from, r.to])).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
      [10, 11],
    ]);
    expect(plan.scene.comps.c2).toBeUndefined();
    expect(plan.notes.join(' ')).toMatch(/rendered frames/);
  });

  it('keys go to comp time with Blender handles; eased keys flatten, holds become CONSTANT', () => {
    let pos = setKey(setKey(staticProp<Vec2>([200, 150]), 0, [200, 150]), 10, [300, 150]);
    pos = setSegmentEasing(pos, 0, 'easeInOut');
    const ch = channels(pos, ['position.x', 'position.y'], 5);
    const k = ch['position.x']!.keys!;
    expect(k.map((x) => [x.frame, x.value, x.interp])).toEqual([
      [5, 200, 'BEZIER'],
      [15, 300, 'LINEAR'],
    ]);
    expect(k[0]!.right![1]).toBe(200); // flat handle: eases out of the first key
    expect(k[0]!.right![0]).toBeCloseTo(5 + 10 / 3);
    expect(k[1]!.left![1]).toBe(300);
    const hold = channels(setSegmentEasing(pos, 0, 'hold'), ['position.x', 'position.y'], 0);
    expect(hold['position.x']!.keys![0]!.interp).toBe('CONSTANT');
  });

  it('cameras inside precomps stay in 2Dope; overridden instances are rendered', () => {
    const p = project();
    p.walk.layers.unshift(cameraLayer('cam2', p.walk));
    const P = p.shot.layers.find((l) => l.id === 'P')!;
    if (P.kind === 'comp') P.overrides = { 'W:rotation': staticProp(10) };
    p.walk.pins = [{ layer: 'W', prop: 'rotation' }];
    const plan = planBlender(p, 'test');
    expect(plannedLayers(plan, 'c1').P!.kind).toBe('baked');
  });
});
