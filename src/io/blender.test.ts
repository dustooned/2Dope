import { describe, expect, it } from 'vitest';
import { setKey, setSegmentEasing, staticProp, type Vec2 } from '../core/anim';
import { cameraLayer, compLayer, drawingsLayer, newComp, nullLayer, type Comp } from '../core/comp';
import { newEffect } from '../core/effects';
import { channels, planBlender, plannedLayers, runs, trimScene } from './blender';

function project() {
  const shot = newComp('c1', 'Shot', 400, 300, 12);
  const walk = newComp('c2', 'Walk', 400, 300, 12);
  walk.layers.push(
    drawingsLayer(
      'W',
      'Legs',
      [
        { drawing: 'w1', length: 2 },
        { drawing: 'w2', length: 2 },
      ],
      400,
      300,
    ),
  );
  shot.layers.push(
    cameraLayer('cam', shot),
    nullLayer('N', 'Handle', shot),
    compLayer('P', 'Walk', walk, shot),
    drawingsLayer(
      'B',
      'Ball',
      [
        { drawing: 'b1', length: 3 },
        { drawing: 'b2', length: 1 },
      ],
      400,
      300,
    ),
  );
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

  it('exports the timeline Share shows: the shot while a group in it is open, an asset opened on its own by itself', () => {
    const p = project();
    expect(planBlender({ ...p, activeComp: 'c2' }, 'test').scene.main).toBe('c1');
    const solo = newComp('c3', 'Prop', 200, 200, 12);
    solo.layers.push(drawingsLayer('X', 'Prop', [{ drawing: 'x1', length: 2 }], 200, 200));
    p.comps.set('c3', solo);
    const plan = planBlender({ ...p, activeComp: 'c3' }, 'test');
    expect(plan.scene.main).toBe('c3');
    expect(Object.keys(plan.scene.comps)).toEqual(['c3']);
    expect([...plan.drawings]).toEqual(['x1']);
  });

  it('guide layers (the storyboard) stay out of Blender unless set to export', () => {
    const p = project();
    const B = p.shot.layers.find((l) => l.id === 'B')!;
    B.guide = true;
    expect(plannedLayers(planBlender(p, 'test'), 'c1').B).toBeUndefined();
    B.guideExport = true;
    expect(plannedLayers(planBlender(p, 'test'), 'c1').B).toBeDefined();
  });

  it('the storyboard goes to 3D as markers with shot, camera and captions, and its pictures', () => {
    const p = project();
    const board = drawingsLayer('S', 'Storyboard', [{ drawing: 's1', length: 12, shot: 'Sc 1', camera: 'Wide' }, { drawing: 's2', length: 6, action: 'Ball bounces' }], 400, 300);
    board.guide = true;
    board.start = 2;
    p.shot.layers.push(board);
    const plan = planBlender(p, 'test');
    expect(plan.scene.board).toEqual([
      { n: 1, frame: 2, length: 12, shot: 'Sc 1', camera: 'Wide', image: 'd:s1' },
      { n: 2, frame: 14, length: 6, action: 'Ball bounces', image: 'd:s2' },
    ]);
    expect(plan.scene.images['d:s2']).toBe('drawings/s2.png');
    expect(planBlender(project(), 'test').scene.board).toBeUndefined();
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

describe('Blender planes sized to their art', () => {
  it('cuts each layer to the union of its drawings plus a margin, keeps anchors, and moves the plane by offset', () => {
    const plan = planBlender(project(), 'test');
    const bounds = new Map([
      ['d:b1', { x: 100, y: 50, w: 20, h: 20 }],
      ['d:b2', { x: 150, y: 60, w: 10, h: 30 }],
      ['d:w1', null],
      ['d:w2', null],
    ]);
    const images = trimScene(plan.scene, bounds, [400, 300], true);
    const B = plannedLayers(plan, 'c1').B!;
    expect(B.anchor).toEqual([200, 150]);
    expect(B.offset).toEqual([98, 48]);
    expect(B.size).toEqual([64, 44]);
    expect(images.find((i) => i.source === 'd:b1')!.rect).toEqual({ x: 98, y: 48, w: 64, h: 44 });
    // an empty layer: a 1-pixel blank plane
    expect(plannedLayers(plan, 'c2').W!.size).toEqual([1, 1]);
    expect(plan.scene.images['d:b1']).toBe('drawings/b1.png');
  });

  it('clamps the margin to the page; whole page when trimming is off', () => {
    const plan = planBlender(project(), 'test');
    trimScene(plan.scene, new Map([['d:b1', { x: 0, y: 0, w: 400, h: 300 }]]), [400, 300], true);
    expect(plannedLayers(plan, 'c1').B!.size).toEqual([400, 300]);
    expect(plannedLayers(plan, 'c1').B!.offset).toBeUndefined();
    const full = planBlender(project(), 'test');
    trimScene(full.scene, new Map([['d:b1', { x: 10, y: 10, w: 5, h: 5 }]]), [400, 300], false);
    expect(plannedLayers(full, 'c1').B!.size).toEqual([400, 300]);
  });

  it('a drawing cut two ways (or used by a storyboard marker) gets one image per cut', () => {
    const p = project();
    const board = drawingsLayer('S', 'Storyboard', [{ drawing: 'b1', length: 4 }], 400, 300);
    board.guide = true;
    p.shot.layers.push(board);
    const plan = planBlender(p, 'test');
    const images = trimScene(plan.scene, new Map([['d:b1', { x: 10, y: 10, w: 5, h: 5 }]]), [400, 300], true);
    const b1 = images.filter((i) => i.source === 'd:b1');
    expect(b1.map((i) => i.key)).toEqual(['d:b1', 'd:b1~2']);
    expect(plan.scene.board![0]!.image).toBe('d:b1~2');
    expect(plan.scene.images['d:b1~2']).toBe('drawings/b1_2.png');
    expect(b1[1]!.rect).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
});

describe('Blender: what an image plane cannot do', () => {
  const ball = (p: ReturnType<typeof project>) => p.shot.layers.find((l) => l.id === 'B')! as Extract<Comp['layers'][number], { kind: 'drawings' }>;

  it('bakes group effects on the placement clock instead of exporting an unaffected instance', () => {
    const p = project(), group = p.shot.layers.find((l) => l.id === 'P')!;
    group.effects = [{ ...newEffect('blur', 'groupfx', 1), keys: { amount: setKey(setKey(staticProp(0), 0, 0), 3, 6) } }];
    const plan = planBlender(p, 'test'), layer = plannedLayers(plan, 'c1').P!;
    expect(layer.kind).toBe('baked');
    const jobs = plan.renders.filter((r) => r.image.startsWith('r:c1:P:'));
    expect(jobs).toHaveLength(4);
    expect(jobs.map((r) => r.frame)).toEqual([0, 1, 2, 3]);
    expect(jobs[0]!.comp.layers[0]!.effects).toEqual(group.effects);
    expect(plan.notes.some((n) => n.includes('group effects'))).toBe(true);
  });

  it('an adjustment layer stays in 2Dope, with a note', () => {
    const p = project();
    ball(p).adjust = true;
    const plan = planBlender(p, 'test');
    expect(plannedLayers(plan, 'c1').B).toBeUndefined();
    expect(plan.notes.some((n) => n.includes('adjustment layer'))).toBe(true);
  });

  it('a mask or effects: rendered frames on the layer page, keeping its moves; same pictures share a frame', () => {
    const p = project();
    const B = ball(p);
    B.mask = 'm1';
    B.transform.position = setKey(B.transform.position, 0, [10, 20] as Vec2);
    const plan = planBlender(p, 'test');
    const L = plannedLayers(plan, 'c1').B!;
    expect(L.kind).toBe('drawings');
    expect(L.size).toEqual([400, 300]);
    expect(L.channels['position.x']!.keys).toHaveLength(1);
    expect(L.frames!.every((r) => r.image?.startsWith('r:'))).toBe(true);
    // b1 for 3 frames, b2 for 1: two renders, each with the mask
    const jobs = plan.renders.filter((r) => r.image.startsWith('r:c1:B:'));
    expect(jobs).toHaveLength(2);
    const solo = jobs[0]!.comp;
    expect(solo.layers).toHaveLength(1);
    expect(solo.layers[0]!.parent).toBeNull();
    expect(solo.layers[0]!.transform.position.value).toEqual(solo.layers[0]!.transform.anchor.value);
    expect(plan.drawings.has('m1')).toBe(true);
    expect(plan.notes.some((n) => n.includes('mask'))).toBe(true);
    // effects: the same
    const q = project();
    ball(q).effects = [newEffect('boil', 'e1', 1)];
    expect(plannedLayers(planBlender(q, 'test'), 'c1').B!.frames!.every((r) => r.image?.startsWith('r:'))).toBe(true);
  });

  it('a clipped layer: rendered in the comp space over its base at opacity 0, plane with no moves', () => {
    const p = project();
    const top = drawingsLayer('T', 'Shine', [{ drawing: 't1', length: 4 }], 400, 300);
    top.clip = true;
    top.transform.opacity = setKey(top.transform.opacity, 0, 50);
    p.shot.layers.splice(p.shot.layers.findIndex((l) => l.id === 'B'), 0, top);
    const plan = planBlender(p, 'test');
    const L = plannedLayers(plan, 'c1').T!;
    expect(L.parent).toBeNull();
    expect(L.size).toEqual([400, 300]);
    expect(L.channels['position.x']!.value).toBe(200);
    expect(L.channels['opacity']!.keys).toHaveLength(1);
    const job = plan.renders.find((r) => r.image.startsWith('r:c1:T:'))!;
    const clip = job.comp;
    expect(clip.layers.find((l) => l.id === 'B')!.transform.opacity.value).toBe(0);
    expect(clip.layers.find((l) => l.id === 'B')!.visible).toBe(true);
    expect(clip.layers.find((l) => l.id === 'N')!.visible).toBe(false);
    expect(clip.layers.some((l) => l.kind === 'camera')).toBe(false);
    expect(clip.layers.find((l) => l.id === 'T')!.transform.opacity.value).toBe(100);
    // the base itself still goes as a plain drawings plane
    expect(plannedLayers(plan, 'c1').B!.frames![0]!.image).toBe('d:b1');
  });
});
