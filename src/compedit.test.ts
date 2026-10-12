import { describe, expect, it } from 'vitest';
import { CompEditor } from './compedit';
import { setKey, staticProp, valueAt, type Vec2 } from './core/anim';
import { apply, cameraLayer, compLength, drawingsLayer, instanceComp, newComp, nullLayer, worldMatrix, type Comp, type CompLayer } from './core/comp';
import { History } from './core/history';
import type { App } from './app';

/** The few parts of the App the editor uses, without a browser. */
function rig() {
  const comp = newComp('c1', 'Shot', 400, 300, 12);
  comp.layers.push(drawingsLayer('L1', 'Ball', [{ drawing: 'd1', length: 12 }], 400, 300));
  const comps = new Map([[comp.id, comp]]);
  let n = 1;
  const project = {
    comps,
    drawings: new Map<string, unknown>(),
    main: 'c1',
    activeComp: 'c1',
    activeLayer: 'L1',
    width: 400,
    height: 300,
    get comp() {
      return comps.get(this.activeComp)!;
    },
    newId: (p: string) => `${p}${++n + 10}`,
    newDrawing: () => ({ id: `d${++n + 10}` }),
  };
  const app = {
    project,
    frame: 0,
    history: new History(),
    requestRender() {},
    onFrameChange() {},
    onDocChanged() {},
    focusLayer(id: string) {
      project.activeLayer = id;
    },
    get compEnd() {
      return Math.max(1, compLength(project.comp, comps));
    },
    onCompChange() {},
  };
  const ed = new CompEditor(app as unknown as App);
  return { app, ed, comp: comp as Comp, project };
}

const close = (a: Vec2, b: Vec2) => {
  expect(a[0]).toBeCloseTo(b[0], 4);
  expect(a[1]).toBeCloseTo(b[1], 4);
};

describe('layers', () => {
  it('adds a null and a camera on top, selects them, and undoes', () => {
    const { ed, comp, app } = rig();
    ed.addLayer('null');
    ed.addLayer('camera');
    expect(comp.layers.map((l) => l.kind)).toEqual(['camera', 'null', 'drawings']);
    expect(ed.primary?.kind).toBe('camera');
    app.history.undo();
    expect(ed.comp.layers.map((l) => l.kind)).toEqual(['null', 'drawings']);
    app.history.redo();
    expect(ed.comp.layers).toHaveLength(3);
  });

  it('delete removes the layer and frees its children', () => {
    const { ed, comp } = rig();
    ed.addLayer('null');
    const id = ed.primary!.id;
    ed.setParentOf('L1', id);
    expect(comp.layers.find((l) => l.id === 'L1')!.parent).toBe(id);
    ed.deleteLayers([id]);
    expect(ed.comp.layers.find((l) => l.id === 'L1')!.parent).toBeNull();
  });

  it('reorders, renames, hides and trims', () => {
    const { ed } = rig();
    ed.addLayer('null');
    ed.reorder(ed.primary!.id, 1);
    expect(ed.comp.layers[1]!.kind).toBe('null');
    ed.rename('L1', '  Hero  ');
    expect(ed.layer('L1')!.name).toBe('Hero');
    ed.setFlag('L1', 'visible', false);
    expect(ed.layer('L1')!.visible).toBe(false);
    ed.setTiming('L1', { start: 4 });
    expect([ed.layer('L1')!.start, ed.layer('L1')!.in]).toEqual([4, 4]);
    ed.setTiming('L1', { out: 6 });
    ed.setTiming('L1', { in: 9 });
    expect(ed.layer('L1')!.out).toBe(10); // the end never crosses the start
  });
});

describe('values and keys', () => {
  it('a still property changes its value; with auto-key (or once animated) it writes keys at the playhead', () => {
    const { ed, app } = rig();
    app.frame = 4;
    ed.setValue('L1', 'rotation', 30);
    expect(ed.layer('L1')!.transform.rotation).toEqual({ value: 30, keys: [] });
    ed.autoKey = true;
    ed.setValue('L1', 'rotation', 60);
    const keys = ed.layer('L1')!.transform.rotation.keys;
    expect(keys.map((k) => [k.f, k.v])).toEqual([
      [0, 30], // "key at start" keeps the old value at the start
      [4, 60],
    ]);
    ed.autoKey = false;
    app.frame = 8;
    ed.setValue('L1', 'rotation', 90); // animated now, so it keys even with auto-key off
    expect(ed.layer('L1')!.transform.rotation.keys.map((k) => k.f)).toEqual([0, 4, 8]);
  });

  it('keys are in layer time: moving the layer does not move them, the playhead maps through', () => {
    const { ed, app } = rig();
    ed.setTiming('L1', { start: 5 });
    app.frame = 7; // layer frame 2
    ed.autoKey = true;
    ed.keyAtStart = false;
    ed.setValue('L1', 'opacity', 50);
    expect(ed.layer('L1')!.transform.opacity.keys.map((k) => k.f)).toEqual([2]);
  });

  it('the diamond adds a key holding the current value, then removes it; undo works', () => {
    const { ed, app } = rig();
    ed.keyAtStart = false;
    app.frame = 3;
    ed.toggleKey('L1', 'scale');
    expect(ed.layer('L1')!.transform.scale.keys.map((k) => [k.f, k.v])).toEqual([[3, [100, 100]]]);
    ed.toggleKey('L1', 'scale');
    expect(ed.layer('L1')!.transform.scale.keys).toHaveLength(0);
    app.history.undo();
    expect(ed.layer('L1')!.transform.scale.keys).toHaveLength(1);
  });

  it('easing applies to the segment from each selected key and is remembered for new keys', () => {
    const { ed, app } = rig();
    ed.keyAtStart = false;
    ed.autoKey = true;
    app.frame = 0;
    ed.setValue('L1', 'opacity', 0);
    app.frame = 10;
    ed.setValue('L1', 'opacity', 100);
    ed.selectKey({ layer: 'L1', prop: 'opacity', f: 0 });
    ed.setEasing('easeInOut');
    expect(ed.easingOfSelection()).toBe('easeInOut');
    expect(ed.lastEase).toBe('easeInOut');
    expect(valueAt(ed.layer('L1')!.transform.opacity, 2)).toBeLessThan(20);
    app.frame = 20;
    ed.setValue('L1', 'opacity', 0);
    const k = ed.layer('L1')!.transform.opacity.keys;
    expect(k[2]!.in.interp).toBe('bezier'); // the new key inherited the easing
  });

  it('retimes, deletes and reverses keys', () => {
    const { ed, app } = rig();
    ed.keyAtStart = false;
    ed.autoKey = true;
    for (const [f, v] of [
      [0, 0],
      [4, 40],
      [8, 100],
    ] as const) {
      app.frame = f;
      ed.setValue('L1', 'opacity', v);
    }
    ed.selectKey({ layer: 'L1', prop: 'opacity', f: 8 });
    ed.nudgeKeys(2);
    expect(ed.layer('L1')!.transform.opacity.keys.map((k) => k.f)).toEqual([0, 4, 10]);
    expect([...ed.keys]).toEqual(['L1|opacity|10']);
    ed.reverse([
      { layer: 'L1', prop: 'opacity', f: 0 },
      { layer: 'L1', prop: 'opacity', f: 10 },
    ]);
    expect(ed.layer('L1')!.transform.opacity.keys.map((k) => [k.f, k.v])).toEqual([
      [0, 100],
      [6, 40],
      [10, 0],
    ]);
    ed.deleteKeys([{ layer: 'L1', prop: 'opacity', f: 6 }]);
    expect(ed.layer('L1')!.transform.opacity.keys).toHaveLength(2);
    app.history.undo();
    expect(ed.layer('L1')!.transform.opacity.keys).toHaveLength(3);
  });
});

describe('canvas gestures', () => {
  it('dragging moves the layer by the same amount on screen; it is one undo step', () => {
    const { ed, app } = rig();
    expect(ed.gestureStart([200, 150], 1)).toBe(true);
    ed.gestureMove([230, 160]);
    ed.gestureMove([250, 170]);
    ed.gestureEnd();
    close(ed.layer('L1')!.transform.position.value, [250, 170]);
    expect(app.history.canUndo).toBe(true);
    app.history.undo();
    close(ed.layer('L1')!.transform.position.value, [200, 150]);
    expect(app.history.canUndo).toBe(false);
  });

  it('with keys it writes one key at the playhead, however many moves the drag had', () => {
    const { ed, app } = rig();
    ed.autoKey = true;
    ed.keyAtStart = false;
    app.frame = 5;
    ed.gestureStart([200, 150], 1);
    for (let i = 1; i <= 20; i++) ed.gestureMove([200 + i * 5, 150]);
    ed.gestureEnd();
    const p = ed.layer('L1')!.transform.position;
    expect(p.keys.map((k) => [k.f, Math.round((k.v as Vec2)[0])])).toEqual([[5, 300]]);
  });

  it('a child under a rotated parent follows the pointer anyway', () => {
    const { ed, comp } = rig();
    const n = nullLayer('N', 'Spin', comp);
    n.transform.rotation = staticProp(40);
    n.transform.position = staticProp<Vec2>([100, 100]);
    comp.layers.unshift(n);
    ed.setParentOf('L1', 'N');
    const anchorBefore = apply(worldMatrix(comp, ed.layer('L1')!, 0), [200, 150]);
    ed.select('L1');
    ed.gestureStart([200, 150], 1);
    ed.gestureMove([260, 170]);
    ed.gestureEnd();
    const anchorAfter = apply(worldMatrix(comp, ed.layer('L1')!, 0), [200, 150]);
    close(anchorAfter, [anchorBefore[0] + 60, anchorBefore[1] + 20]);
  });

  it('the rotate handle turns the layer and a corner scales it about the anchor', () => {
    const { ed } = rig();
    ed.select('L1');
    const h = ed.rotateHandle(ed.layer('L1')!, 1);
    expect(ed.gestureStart(h, 1)).toBe(true);
    // swing the handle a quarter turn clockwise about the page centre
    ed.gestureMove([200 + (150 + 34), 150 - 0]);
    ed.gestureEnd();
    expect(ed.layer('L1')!.transform.rotation.value).toBeCloseTo(90, 3);
    const c = ed.corners(ed.layer('L1')!)[2]!;
    ed.gestureStart(c, 1);
    ed.gestureMove([200 + (c[0] - 200) * 2, 150 + (c[1] - 150) * 2]);
    ed.gestureEnd();
    close(ed.layer('L1')!.transform.scale.value, [200, 200]);
  });

  it('a click on empty space deselects; a second finger (cancel) puts everything back', () => {
    const { ed } = rig();
    ed.select('L1');
    expect(ed.gestureStart([1000, 1000], 1)).toBe(false);
    expect(ed.selected).toEqual([]);
    ed.gestureStart([200, 150], 1);
    ed.gestureMove([300, 250]);
    ed.gestureEnd(true);
    close(ed.layer('L1')!.transform.position.value, [200, 150]);
  });

  it('a camera moves opposite to the drag, so the picture follows the finger', () => {
    const { ed, comp } = rig();
    comp.layers.unshift(cameraLayer('cam', comp));
    ed.select('cam');
    ed.throughCamera = true;
    ed.gestureStart([200, 150], 1);
    ed.gestureMove([240, 150]);
    ed.gestureEnd();
    close(ed.layer('cam')!.transform.position.value, [160, 150]);
  });

  it('locked and hidden layers are not grabbed', () => {
    const { ed } = rig();
    ed.setFlag('L1', 'locked', true);
    expect(ed.gestureStart([200, 150], 1)).toBe(false);
    ed.setFlag('L1', 'locked', false);
    ed.setFlag('L1', 'visible', false);
    expect(ed.gestureStart([200, 150], 1)).toBe(false);
  });
});

/** A drawing whose line plane has ink in one rectangle (enough of a canvas for contentbox.ts). */
function inked(id: string, w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * w + x) * 4 + 3] = 255;
  const line = { width: w, height: h, getContext: () => ({ getImageData: () => ({ data }) }) };
  return { id, line, fill: null, vectors: [], rev: 1, parked: null };
}

describe('the box hugs the drawing', () => {
  it('handles and hit tests follow the ink, not the page', () => {
    const { ed, project } = rig();
    project.drawings.set('d1', inked('d1', 400, 300, 100, 50, 149, 79));
    const [a, , c] = ed.corners(ed.layer('L1')!);
    close(a!, [94, 44]); // 6 px of breathing room
    close(c!, [156, 86]);
    ed.select(null);
    expect(ed.gestureStart([300, 250], 1)).toBe(false); // empty paper is not the drawing
    expect(ed.gestureStart([120, 60], 1)).toBe(true);
    ed.gestureEnd();
  });

  it('scale and rotate pivot on the drawing; nothing jumps; undo restores the old pivot', () => {
    const { ed, project, app } = rig();
    project.drawings.set('d1', inked('d1', 400, 300, 100, 50, 149, 79));
    ed.select('L1');
    const corner = ed.corners(ed.layer('L1')!)[2]!;
    ed.gestureStart(corner, 1);
    const l = ed.layer('L1')!;
    close(l.transform.anchor.value, [125, 65]);
    close(apply(worldMatrix(ed.comp, l, 0), [100, 50]), [100, 50]); // the ink did not move
    ed.gestureMove([125 + (corner[0] - 125) * 2, 65 + (corner[1] - 65) * 2]);
    ed.gestureEnd();
    close(ed.layer('L1')!.transform.scale.value, [200, 200]);
    close(apply(worldMatrix(ed.comp, ed.layer('L1')!, 0), [125, 65]), [125, 65]); // grew around its centre
    app.history.undo();
    close(ed.layer('L1')!.transform.anchor.value, [200, 150]);
  });
});

describe('line and fill parts', () => {
  it('part opacity and offset key like any property; visibility and tint are one undo step each', () => {
    const { ed, app } = rig();
    ed.autoKey = true;
    ed.setValue('L1', 'fill.opacity', 40);
    app.frame = 6;
    ed.setValue('L1', 'fill.opacity', 80);
    const l = ed.layer('L1')!;
    expect(l.kind === 'drawings' && l.parts?.fill?.opacity.keys.map((k) => [k.f, k.v])).toEqual([
      [0, 40],
      [6, 80],
    ]);
    expect(ed.rowProp('fill.offset')).toBe('position');
    ed.setPart('L1', 'line', { tint: '#00ff00' });
    ed.setPart('L1', 'line', { visible: false });
    const m = ed.layer('L1')!;
    expect(m.kind === 'drawings' && [m.parts?.line?.tint, m.parts?.line?.visible]).toEqual(['#00ff00', false]);
    app.history.undo();
    const u = ed.layer('L1')!;
    expect(u.kind === 'drawings' && [u.parts?.line?.tint, u.parts?.line?.visible]).toEqual(['#00ff00', true]);
    ed.resetPart('L1', 'line');
    const r = ed.layer('L1')!;
    expect(r.kind === 'drawings' && r.parts?.line).toBeUndefined();
  });
});

describe('keys survive a layer moving in time', () => {
  it('uses frames of the layer, not of the comp', () => {
    const { comp } = rig();
    const l = comp.layers[0]!;
    l.transform.position = setKey(setKey(staticProp<Vec2>([0, 0]), 0, [0, 0]), 10, [100, 0]);
    l.start = 20;
    expect(valueAt(l.transform.position, 25 - l.start)[0]).toBeCloseTo(50);
  });
});

describe('precomps', () => {
  /** A shot with two drawing layers and a null. */
  function three() {
    const r = rig();
    r.comp.layers.push(drawingsLayer('L2', 'Leg', [{ drawing: 'd2', length: 8 }], 400, 300));
    r.comp.layers.unshift(nullLayer('N', 'Handle', r.comp));
    return r;
  }

  it('group puts the layers in a new comp, in place of one layer, and nothing moves', () => {
    const { ed, project } = three();
    const before = apply(worldMatrix(ed.comp, ed.layer('L2')!, 0), [10, 10]);
    const id = ed.group(['L1', 'L2'], 'Walk')!;
    const c = ed.comp;
    expect(c.layers.map((l) => l.kind)).toEqual(['null', 'comp']);
    const pl = c.layers[1] as CompLayer;
    expect(pl.id).toBe(id);
    const nested = project.comps.get(pl.comp)!;
    expect(nested.name).toBe('Walk');
    expect(nested.layers.map((l) => l.id)).toEqual(['L1', 'L2']);
    // the precomp layer sits exactly over the comp, so the drawing lands where it was
    const after = apply(worldMatrix(c, pl, 0), apply(worldMatrix(nested, nested.layers[1]!, 0), [10, 10]));
    close(after, before);
  });

  it('group is one undo step and undo restores the old layers and no new comp', () => {
    const { ed, project, app } = three();
    ed.group(['L1', 'L2']);
    expect(project.comps.size).toBe(2);
    app.history.undo();
    expect(project.comps.size).toBe(1);
    expect(ed.comp.layers.map((l) => l.id)).toEqual(['N', 'L1', 'L2']);
    app.history.redo();
    expect(project.comps.size).toBe(2);
  });

  it('enter goes inside at the frame the layer shows; exit comes back to the matching frame', () => {
    const { ed, app, project } = three();
    const id = ed.group(['L1', 'L2'])!;
    ed.setTiming(id, { start: 5 });
    app.frame = 8;
    expect(ed.enter(id)).toBe(true);
    expect(project.activeComp).not.toBe('c1');
    expect(app.frame).toBe(3);
    expect(ed.crumbs().map((c) => c.comp.id)).toEqual(['c1', project.activeComp]);
    expect(ed.context()?.frame).toBe(8);
    app.frame = 4;
    expect(ed.exit()).toBe(true);
    expect(project.activeComp).toBe('c1');
    expect(app.frame).toBe(9);
  });

  it('the breadcrumb is rebuilt when undo changes which comp is open', () => {
    const { ed, project } = three();
    const id = ed.group(['L1'])!;
    const inner = (ed.layer(id) as CompLayer).comp;
    project.activeComp = inner; // as an undo of an edit inside it would do
    expect(ed.crumbs().map((c) => c.comp.id)).toEqual(['c1', inner]);
    expect(ed.context()?.layer.id).toBe(id);
  });

  it('ungroup puts the layers back, shifted by the precomp start, and keeps a moved precomp on a null', () => {
    const { ed } = three();
    const id = ed.group(['L1', 'L2'])!;
    ed.setTiming(id, { start: 4 });
    expect(ed.ungroup(id)).toBe(true);
    let kinds = ed.comp.layers.map((l) => l.kind);
    expect(kinds).toEqual(['null', 'drawings', 'drawings']);
    expect(ed.comp.layers[1]!.start).toBe(4);
    // moved: the layers ride a new null so they stay put
    const id2 = ed.group([ed.comp.layers[1]!.id])!;
    ed.setValue(id2, 'position', [260, 150]);
    const before = apply(worldMatrix(ed.comp, ed.layer(id2)!, 4), [200, 150]);
    ed.ungroup(id2);
    kinds = ed.comp.layers.map((l) => l.kind);
    expect(kinds).toEqual(['null', 'null', 'drawings', 'drawings']);
    const kid = ed.comp.layers[2]!;
    close(apply(worldMatrix(ed.comp, kid, 4), [200, 150]), before);
  });

  it('instances share the comp; make unique gives one its own copy', () => {
    const { ed, project } = three();
    const id = ed.group(['L1'])!;
    ed.duplicate(id);
    expect(ed.comp.layers.filter((l) => l.kind === 'comp')).toHaveLength(2);
    const shared = (ed.layer(id) as CompLayer).comp;
    expect(ed.instances(shared)).toBe(2);
    ed.makeUnique(id);
    expect((ed.layer(id) as CompLayer).comp).not.toBe(shared);
    expect(ed.instances(shared)).toBe(1);
    expect(project.comps.size).toBe(3);
  });

  it('a pinned property shows on each instance and can differ per instance; reset goes back', () => {
    const { ed, app, project } = three();
    const id = ed.group(['L1'])!;
    const inner = (ed.layer(id) as CompLayer).comp;
    ed.enter(id);
    ed.togglePin('L1', 'rotation');
    expect(ed.isPinned('L1', 'rotation')).toBe(true);
    ed.exit();
    ed.duplicate(id);
    const other = ed.selected[0]!;
    const rows = ed.rowsOf(ed.layer(id)!);
    expect(rows).toContain('pin:L1:rotation');
    expect(ed.rowLabel(ed.layer(id)!, 'pin:L1:rotation')).toBe('★ Ball Rotation');
    ed.setValue(id, 'pin:L1:rotation', 45);
    expect(ed.valueNow(ed.layer(id)!, 'pin:L1:rotation')).toBe(45);
    expect(ed.valueNow(ed.layer(other)!, 'pin:L1:rotation')).toBe(0);
    // what renders: the instance's comp has the override
    const n = project.comps.get(inner)!;
    expect(instanceComp(n, ed.layer(id) as CompLayer).layers[0]!.transform.rotation.value).toBe(45);
    expect(instanceComp(n, ed.layer(other) as CompLayer)).toBe(n);
    expect(ed.isOverridden(ed.layer(id)!, 'pin:L1:rotation')).toBe(true);
    ed.resetPin(id, 'pin:L1:rotation');
    expect(ed.valueNow(ed.layer(id)!, 'pin:L1:rotation')).toBe(0);
    void app;
  });

  it('an unpinned property stops overriding even if a value was stored', () => {
    const { ed, project } = three();
    const id = ed.group(['L1'])!;
    ed.setValue(id, 'pin:L1:opacity' as never, 20);
    const l = ed.layer(id) as CompLayer;
    const n = project.comps.get(l.comp)!;
    expect(instanceComp(n, l)).toBe(n); // not pinned: ignored
  });
});

describe('frame picking in the editor', () => {
  it('typing a frame at the playhead writes a hold key (a swap); the first one also keys the start', () => {
    const { ed, app, comp } = rig();
    const l = comp.layers[0]!;
    if (l.kind === 'drawings') l.exposures = ['a', 'b', 'c'].map((d) => ({ drawing: d, length: 1 }));
    app.frame = 2;
    ed.setValue('L1', 'remap', 0);
    const r = (ed.layer('L1') as { timeRemap: { keys: { f: number; v: number; out: { interp: string } }[] } }).timeRemap;
    expect(r.keys.map((k) => [k.f, k.v, k.out.interp])).toEqual([
      [0, 0, 'hold'],
      [2, 0, 'hold'],
    ]);
    app.frame = 1;
    expect(ed.contentFrame(ed.layer('L1')!)).toBe(0);
  });

  it('play modes are one undo step', () => {
    const { ed, app } = rig();
    ed.setPlay('L1', 'pingpong', { speed: 2 });
    expect([(ed.layer('L1') as { play: string }).play, (ed.layer('L1') as { speed: number }).speed]).toEqual(['pingpong', 2]);
    app.history.undo();
    expect((ed.layer('L1') as { play: string }).play).toBe('once');
  });
});
