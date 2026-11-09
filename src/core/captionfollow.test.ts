import { describe, expect, it } from 'vitest';
import { captionAtFrame, drawingsLayer, newComp, frameContent } from './comp';
import { LINEAR, type Vec2 } from './anim';
import { defaultCaption } from '../lettering/spec';

describe('a caption tail following a layer', () => {
  const setup = () => {
    const comp = newComp('c', 'Shot', 400, 300, 24);
    const hero = drawingsLayer('hero', 'Hero', [{ drawing: 'd1', length: 24 }], 400, 300);
    hero.transform.position = { value: [200, 150], keys: [{ f: 0, v: [200, 150] as Vec2, in: LINEAR, out: LINEAR }, { f: 10, v: [300, 150] as Vec2, in: LINEAR, out: LINEAR }] };
    const cap = drawingsLayer('cap', 'Caption', [{ drawing: 'd2', length: 1 }], 400, 300);
    cap.still = true;
    cap.caption = { ...defaultCaption(100, 60), text: 'Hi', tails: [{ x: 0, y: 0, join: 'merged', width: 1.2, follow: { layer: 'hero', at: [220, 170] } }] };
    comp.layers.push(cap, hero);
    return { comp, cap, hero };
  };
  it('points at the same spot on the layer as it moves', () => {
    const { comp, cap } = setup();
    const at0 = captionAtFrame(comp, cap, 0)!.tails[0]!, at10 = captionAtFrame(comp, cap, 10)!.tails[0]!;
    // the hero's anchor is its page centre, so its spot (220,170) shows 20,20 from its position
    expect([at0.x, at0.y]).toEqual([220, 170]);
    expect([at10.x, at10.y]).toEqual([320, 170]);
  });
  it('turns with the layer, and keeps its stored place when the layer is gone', () => {
    const { comp, cap, hero } = setup();
    hero.transform.position = { value: [200, 150], keys: [] };
    hero.transform.rotation = { value: 90, keys: [] };
    const t = captionAtFrame(comp, cap, 0)!.tails[0]!;
    expect(t.x).toBeCloseTo(180, 6);
    expect(t.y).toBeCloseTo(170, 6);
    comp.layers = comp.layers.filter(l => l.id !== 'hero');
    expect(captionAtFrame(comp, cap, 0)!.tails[0]).toMatchObject({ x: 0, y: 0 });
  });
  it('is part of what a frame shows, so caches redraw when the layer moves', () => {
    const { comp } = setup();
    const comps = new Map([[comp.id, comp]]);
    expect(frameContent(comps, comp, 0).key).not.toBe(frameContent(comps, comp, 10).key);
  });
});
