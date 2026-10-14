import { describe, expect, it } from 'vitest';
import { setKey, staticProp, type Vec2 } from './anim';
import { cameraLayer, drawingsLayer, newComp, type Comp } from './comp';
import { editPoint, rippleComp, rippleExposures, rippleProp, shiftLater } from './ripple';

const names = (ex: { drawing: string; length: number }[]) => ex.map((e) => `${e.drawing}${e.length}`).join(' ');

function shot() {
  const c = newComp('c1', 'Shot', 400, 300, 12);
  const board = drawingsLayer(
    'B',
    'Board',
    [
      { drawing: 'p1', length: 24 },
      { drawing: 'p2', length: 24 },
    ],
    400,
    300,
  );
  board.guide = true;
  const anim = drawingsLayer(
    'A',
    'Anim',
    [
      { drawing: 'a1', length: 12 },
      { drawing: 'a2', length: 12 },
      { drawing: 'a3', length: 24 },
    ],
    400,
    300,
  );
  anim.transform.position = setKey(setKey(staticProp<Vec2>([0, 0]), 0, [0, 0]), 30, [100, 0]);
  const late = drawingsLayer('L', 'Late', [{ drawing: 'l1', length: 6 }], 400, 300);
  late.start = 30;
  late.in = 30;
  const early = drawingsLayer('E', 'Early', [{ drawing: 'e1', length: 10 }], 400, 300);
  const cam = cameraLayer('cam', c);
  cam.zoom = setKey(setKey(staticProp(100), 0, 100), 40, 150);
  c.layers.push(cam, board, anim, late, early);
  return { c, comps: new Map<string, Comp>([['c1', c]]) };
}

describe('ripple pieces', () => {
  it('keys after the edit point move; removed spans collapse onto it', () => {
    const p = setKey(setKey(setKey(staticProp(0), 0, 0), 10, 1), 20, 2);
    expect(rippleProp(p, 10, 5).keys.map((k) => k.f)).toEqual([0, 15, 25]);
    expect(rippleProp(p, 8, -5).keys.map((k) => k.f)).toEqual([0, 8, 15]);
    expect(rippleProp(p, 30, 5)).toBe(p);
  });

  it('adding frames holds the drawing on screen longer; removing cuts from the edit point', () => {
    const ex = [
      { drawing: 'a', length: 4 },
      { drawing: 'b', length: 4 },
    ];
    expect(names(rippleExposures(ex, 4, 3))).toBe('a7 b4'); // at a boundary: the drawing before it holds
    expect(names(rippleExposures(ex, 6, 2))).toBe('a4 b6');
    expect(names(rippleExposures(ex, 2, -4))).toBe('a2 b2');
    expect(names(rippleExposures(ex, 0, 3))).toBe('a4 b4'); // nothing before the layer's first frame
  });

  it('finds the edit point of an add, a delete and a hold change', () => {
    const ex = [
      { drawing: 'a', length: 4 },
      { drawing: 'b', length: 4 },
    ];
    expect(editPoint(ex, [...ex, { drawing: 'c', length: 2 }])).toEqual({ at: 8, delta: 2 });
    expect(editPoint(ex, [ex[0]!, { drawing: 'n', length: 1 }, ex[1]!])).toEqual({ at: 4, delta: 1 });
    expect(editPoint(ex, [ex[1]!])).toEqual({ at: 0, delta: -4 });
    expect(editPoint(ex, [{ drawing: 'a', length: 6 }, ex[1]!])).toEqual({ at: 4, delta: 2 });
    expect(editPoint(ex, [{ drawing: 'a', length: 1 }, ex[1]!])).toEqual({ at: 1, delta: -3 });
    expect(editPoint(ex, [ex[1]!, ex[0]!])).toBeNull(); // same length: no ripple
  });
});

describe('ripple across a shot', () => {
  it('a board panel made 6 frames longer at frame 24: later layers move, spanning ones stretch, keys follow', () => {
    const { c, comps } = shot();
    const r = rippleComp(c, comps, 'B', 24, 6);
    const L = Object.fromEntries(r.layers.map((l) => [l.id, l]));
    // the animation holds the drawing on screen at frame 23 (a2) six frames longer
    expect(L.A!.kind === 'drawings' && names(L.A!.exposures)).toBe('a112 a218 a324');
    expect(L.A!.transform.position.keys.map((k) => k.f)).toEqual([0, 36]);
    // a layer that started after the edit moves
    expect([L.L!.start, L.L!.in]).toEqual([36, 36]);
    // a layer that ended before it does not
    expect(L.E).toBe(c.layers.find((l) => l.id === 'E'));
    // the camera's keys after the edit move, so the framing stays with the picture
    expect(L.cam!.kind === 'camera' && L.cam!.zoom.keys.map((k) => k.f)).toEqual([0, 46]);
    // the edited board keeps the exposures it was given
    expect(L.B!.kind === 'drawings' && names(L.B!.exposures)).toBe('p124 p224');
  });

  it('removing frames pulls later layers back and cuts spanning ones', () => {
    const { c, comps } = shot();
    const r = rippleComp(c, comps, 'B', 24, -6);
    const L = Object.fromEntries(r.layers.map((l) => [l.id, l]));
    expect(L.A!.kind === 'drawings' && names(L.A!.exposures)).toBe('a112 a212 a318');
    expect([L.L!.start, L.L!.in]).toEqual([24, 24]);
  });

  it('a set comp duration grows or shrinks with the edit; a trim in Motion only moves later layers', () => {
    const { c, comps } = shot();
    c.duration = 60;
    expect(rippleComp(c, comps, 'B', 24, 6).duration).toBe(66);
    const moved = shiftLater(c.layers, 'A', 30, 4);
    expect(moved.find((l) => l.id === 'L')!.start).toBe(34);
    expect(moved.find((l) => l.id === 'A')).toBe(c.layers.find((l) => l.id === 'A'));
  });
});

describe('ripple: removing frames never pushes a layer before the edit', () => {
  it('deleting the first board panel keeps the animation at frame 0', async () => {
    const { rippleComp } = await import('./ripple');
    const { drawingsLayer } = await import('./comp');
    const board = drawingsLayer('B', 'Board', [{ drawing: 'p2', length: 12 }], 100, 100);
    board.guide = true;
    const anim = drawingsLayer(
      'A',
      'Animation',
      [
        { drawing: 'a1', length: 10 },
        { drawing: 'a2', length: 12 },
      ],
      100,
      100,
    );
    const comp = { id: 'c', name: 'c', width: 100, height: 100, fps: 24, duration: null, background: null, folder: null, layers: [board, anim], pins: [] };
    // the board's first panel (10 frames at 0) was deleted: P = 0, delta = -10
    const r = rippleComp(comp as never, new Map(), 'B', 0, -10);
    const a = r.layers.find((l) => l.id === 'A')!;
    expect(a.start).toBe(0);
    expect(a.in).toBe(0);
    // the animation drawn for the deleted panel goes with it; the rest stays in step
    expect(a.kind === 'drawings' && a.exposures).toEqual([{ drawing: 'a2', length: 12 }]);
    // a layer that started after the removed span moves back by the full amount
    const late = drawingsLayer('L', 'Late', [{ drawing: 'x', length: 5 }], 100, 100);
    late.start = 20;
    late.in = 20;
    const r2 = rippleComp({ ...comp, layers: [board, late] } as never, new Map(), 'B', 0, -10);
    expect(r2.layers.find((l) => l.id === 'L')!.start).toBe(10);
  });
});
