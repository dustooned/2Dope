import { describe, expect, it } from 'vitest';
import { setKey, staticProp, type Vec2 } from './anim';
import {
  activeCamera,
  apply,
  cameraLayer,
  compLayer,
  compLength,
  drawingOf,
  drawingsLayer,
  invert,
  defaultPart,
  isDefaultPart,
  isPlainFlipbook,
  partOf,
  partsActive,
  layerEnd,
  mul,
  nestedFrame,
  newComp,
  nullLayer,
  setParent,
  viewMatrix,
  worldMatrix,
  wouldCycle,
  type Comp,
} from './comp';

const close = (a: Vec2, b: Vec2) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

function shot(): { c: Comp; comps: Map<string, Comp> } {
  const c = newComp('c1', 'Shot', 1920, 1080, 24);
  c.layers.push(
    drawingsLayer(
      'L1',
      'Ball',
      [
        { drawing: 'a', length: 2 },
        { drawing: 'b', length: 3 },
      ],
      1920,
      1080,
    ),
  );
  return { c, comps: new Map([[c.id, c]]) };
}

describe('comps and layers', () => {
  it('a fresh drawings layer sits exactly on the comp (identity) and is a plain flipbook', () => {
    const { c } = shot();
    const m = worldMatrix(c, c.layers[0]!, 0);
    close(apply(m, [10, 20]), [10, 20]);
    expect(isPlainFlipbook(c)).toBe(true);
  });

  it('drawings follow layer time, start offset, in/out and loop', () => {
    const { c, comps } = shot();
    const l = c.layers[0]! as ReturnType<typeof drawingsLayer>;
    expect([0, 1, 2, 4, 5].map((f) => drawingOf(l, f))).toEqual(['a', 'a', 'b', 'b', null]);
    l.start = 10;
    expect(drawingOf(l, 9)).toBeNull();
    expect(drawingOf(l, 12)).toBe('b');
    expect(layerEnd(l, comps)).toBe(15);
    l.play = 'loop';
    expect(drawingOf(l, 15)).toBe('a');
    expect(layerEnd(l, comps)).toBe(Infinity);
    l.out = 20;
    expect(drawingOf(l, 20)).toBeNull();
  });

  it('comp length is its duration or the end of its last layer', () => {
    const { c, comps } = shot();
    expect(compLength(c, comps)).toBe(5);
    c.layers[0]!.start = 7;
    expect(compLength(c, comps)).toBe(12);
    c.duration = 48;
    expect(compLength(c, comps)).toBe(48);
  });

  it('transform: position moves the anchor, rotation and scale happen around it', () => {
    const { c } = shot();
    const l = c.layers[0]!;
    l.transform.rotation = staticProp(90);
    // the anchor (page centre) stays put; a point right of it rotates to below it
    close(apply(worldMatrix(c, l, 0), [960, 540]), [960, 540]);
    close(apply(worldMatrix(c, l, 0), [1060, 540]), [960, 640]);
    l.transform.rotation = staticProp(0);
    l.transform.scale = staticProp<Vec2>([50, 50]);
    close(apply(worldMatrix(c, l, 0), [1060, 540]), [1010, 540]);
  });

  it('keys are in layer time: moving the layer moves its animation', () => {
    const { c } = shot();
    const l = c.layers[0]!;
    l.transform.position = setKey(setKey(staticProp<Vec2>([960, 540]), 0, [960, 540]), 10, [1060, 540]);
    close(apply(worldMatrix(c, l, 10), [960, 540]), [1060, 540]);
    l.start = 5;
    close(apply(worldMatrix(c, l, 10), [960, 540]), [1010, 540]);
  });

  it('parenting keeps the child in place, then the parent carries it; loops are refused', () => {
    const { c } = shot();
    const n = nullLayer('N', 'Null', c);
    n.transform.position = staticProp<Vec2>([1060, 540]);
    n.transform.rotation = staticProp(30);
    c.layers.unshift(n);
    const l = c.layers[1]!;
    const before = apply(worldMatrix(c, l, 0), [100, 200]);
    expect(setParent(c, l, 'N', 0)).toBe(true);
    close(apply(worldMatrix(c, l, 0), [100, 200]), before);
    // move the parent 50 right (unrotate it first to keep the arithmetic simple)
    n.transform.position = staticProp<Vec2>([1110, 540]);
    const moved = apply(worldMatrix(c, l, 0), [100, 200]);
    close(moved, [before[0] + 50, before[1]]);
    expect(setParent(c, n, l.id, 0)).toBe(false); // would loop
    expect(setParent(c, l, null, 0)).toBe(true);
    close(apply(worldMatrix(c, l, 0), [100, 200]), moved);
    l.parent = 'N';
    n.parent = l.id; // a loop written by hand
    expect(() => worldMatrix(c, l, 0)).not.toThrow();
  });

  it('a centred camera is the identity; moving it right moves the picture left; zoom scales about the centre', () => {
    const { c, comps } = shot();
    expect(activeCamera(c, 0, comps)).toBeNull();
    const cam = cameraLayer('cam', c);
    c.layers.unshift(cam);
    close(apply(viewMatrix(c, 0, comps), [100, 100]), [100, 100]);
    cam.transform.position = staticProp<Vec2>([1060, 540]);
    close(apply(viewMatrix(c, 0, comps), [1060, 540]), [960, 540]);
    cam.transform.position = staticProp<Vec2>([960, 540]);
    cam.zoom = staticProp(200);
    close(apply(viewMatrix(c, 0, comps), [1060, 540]), [1160, 540]);
    cam.visible = false;
    expect(activeCamera(c, 0, comps)).toBeNull();
  });

  it('precomps map time (and fps) into the nested comp, and loops repeat it', () => {
    const { c: inner, comps } = shot(); // 5 frames at 24 fps
    const outer = newComp('c2', 'Outer', 1920, 1080, 12);
    comps.set(outer.id, outer);
    const pl = compLayer('P', 'Ball', inner, outer);
    outer.layers.push(pl);
    expect(nestedFrame(pl, 0, 12, inner, comps)).toBe(0);
    expect(nestedFrame(pl, 1, 12, inner, comps)).toBe(2); // one 12 fps frame = two 24 fps frames
    expect(nestedFrame(pl, 3, 12, inner, comps)).toBeNull(); // past the end (frame 6 of 5)
    pl.play = 'loop';
    expect(nestedFrame(pl, 3, 12, inner, comps)).toBe(1);
  });

  it('refuses a comp inside itself, directly or through another', () => {
    const { c: a, comps } = shot();
    const b = newComp('c2', 'B', 100, 100, 24);
    comps.set(b.id, b);
    b.layers.push(compLayer('x', 'A', a, b));
    expect(wouldCycle('c1', 'c2', comps)).toBe(true); // putting B in A: B already holds A
    expect(wouldCycle('c2', 'c1', comps)).toBe(false);
    expect(wouldCycle('c1', 'c1', comps)).toBe(true);
  });

  it('matrix inverse undoes the matrix', () => {
    const m = mul([2, 0.5, -0.3, 1.5, 10, -4], [0.8, 0, 0, 1.2, 3, 3]);
    close(apply(mul(invert(m), m), [12, -7]), [12, -7]);
  });
});

describe('line and fill parts', () => {
  it('default parts change nothing; changed parts make the layer more than a plain flipbook', () => {
    const c = newComp('c1', 'Shot', 400, 300, 12);
    const l = drawingsLayer('L', 'A', [{ drawing: 'd1', length: 2 }], 400, 300);
    c.layers.push(l);
    expect(isPlainFlipbook(c)).toBe(true);
    l.parts = { line: defaultPart() };
    expect(partsActive(l)).toBe(false);
    expect(isPlainFlipbook(c)).toBe(true);
    l.parts.fill = { ...defaultPart(), tint: '#123456' };
    expect(partsActive(l)).toBe(true);
    expect(isPlainFlipbook(c)).toBe(false);
    expect(partOf(l, 'fill').tint).toBe('#123456');
    expect(isDefaultPart(partOf(l, 'line'))).toBe(true);
  });

  it('a part gradient counts as a change, and part looks are in the frame key', async () => {
    const { frameContent, partsKey } = await import('./comp');
    const c = newComp('c1', 'Shot', 400, 300, 12);
    const l = drawingsLayer('L', 'A', [{ drawing: 'd1', length: 4 }], 400, 300);
    c.layers.push(l);
    const comps = new Map([[c.id, c]]);
    const plain = frameContent(comps, c, 0).key;
    expect(partsKey(l, 0)).toBe('');
    l.parts = { fill: { ...defaultPart(), grad: { kind: 'radial', color2: '#ffffff', angle: 0 } } };
    expect(isDefaultPart(partOf(l, 'fill'))).toBe(false);
    l.parts.fill!.tint = '#000000';
    const tinted = frameContent(comps, c, 0).key;
    expect(tinted).not.toBe(plain);
    l.parts.fill!.grad = { kind: 'linear', color2: '#ffffff', angle: 90 };
    expect(frameContent(comps, c, 0).key).not.toBe(tinted);
    // the same look on a held frame shares the key
    expect(frameContent(comps, c, 1).key).toBe(frameContent(comps, c, 0).key);
  });
});

describe('frame content', () => {
  it('held frames share a key; motion or another drawing changes it; precomp drawings are found', async () => {
    const { frameContent } = await import('./comp');
    const { c, comps } = shot();
    expect(frameContent(comps, 'c1', 0).key).toBe(frameContent(comps, 'c1', 1).key);
    expect(frameContent(comps, 'c1', 1).key).not.toBe(frameContent(comps, 'c1', 2).key);
    c.layers[0]!.transform.position = setKey(setKey(staticProp<Vec2>([960, 540]), 0, [960, 540]), 1, [970, 540]);
    expect(frameContent(comps, 'c1', 0).key).not.toBe(frameContent(comps, 'c1', 1).key);
    const outer = newComp('c2', 'Outer', 1920, 1080, 24);
    comps.set('c2', outer);
    outer.layers.push(compLayer('P', 'Shot', c, outer));
    expect([...frameContent(comps, 'c2', 3).drawings]).toEqual(['b']);
  });
});

describe('play modes and frame picking', () => {
  async function mk() {
    const C = await import('./comp');
    const A = await import('./anim');
    const c = C.newComp('c1', 'S', 100, 100, 12);
    // 4 drawings, one frame each: a b c d
    const l = C.drawingsLayer(
      'L',
      'x',
      ['a', 'b', 'c', 'd'].map((d) => ({ drawing: d, length: 1 })),
      100,
      100,
    );
    c.layers.push(l);
    return { C, A, c, l, comps: new Map([[c.id, c]]) };
  }
  const seq = (l: Parameters<typeof drawingOf>[0], n: number) => Array.from({ length: n }, (_, f) => drawingOf(l, f) ?? '-').join('');

  it('once ends after its content, or holds the last frame when made longer', async () => {
    const { l, C, comps } = await mk();
    expect(seq(l, 6)).toBe('abcd--');
    expect(C.layerEnd(l, comps, 12)).toBe(4);
    l.out = 6;
    expect(seq(l, 7)).toBe('abcddd-');
  });

  it('loop repeats, ping-pong bounces without doubling the ends, single holds one frame', async () => {
    const { l, C, comps } = await mk();
    l.play = 'loop';
    expect(seq(l, 9)).toBe('abcdabcda');
    l.play = 'pingpong';
    expect(seq(l, 10)).toBe('abcdcbabcd');
    expect(C.layerEnd(l, comps, 12)).toBe(Infinity);
    l.play = 'single';
    l.single = 2;
    expect(seq(l, 3)).toBe('ccc');
  });

  it('speed stretches time (and the layer end with it)', async () => {
    const { l, C, comps, c } = await mk();
    l.speed = 0.5;
    expect(seq(l, 9)).toBe('aabbccdd-');
    expect(C.layerEnd(l, comps, 12)).toBe(8);
    expect(C.compLength(c, comps)).toBe(8);
  });

  it('frame picking (time remap with hold keys) swaps frames and wins over the play mode', async () => {
    const { l, A } = await mk();
    l.play = 'loop';
    let r = A.setKey(A.staticProp(0), 0, 3, 'hold');
    r = A.setKey(r, 2, 0, 'hold');
    r = A.setKey(r, 4, 2, 'hold');
    l.timeRemap = r;
    expect(seq(l, 7)).toBe('ddaaccc');
  });

  it('a precomp at another fps and speed maps its frames', async () => {
    const { C, c, comps } = await mk();
    const outer = C.newComp('o', 'O', 100, 100, 24);
    comps.set('o', outer);
    const pl = C.compLayer('P', 'p', c, outer);
    outer.layers.push(pl);
    // inner runs at 12 fps inside a 24 fps shot: each inner frame shows twice
    expect([0, 1, 2, 3].map((f) => C.nestedFrame(pl, f, 24, c, comps))).toEqual([0, 0, 1, 1]);
    expect(C.compLength(outer, comps)).toBe(8);
    pl.speed = 2;
    expect([0, 1, 2, 3].map((f) => C.nestedFrame(pl, f, 24, c, comps))).toEqual([0, 1, 2, 3]);
  });
});
