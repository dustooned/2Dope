import { describe, expect, it } from 'vitest';
import { drawingsLayer } from '../core/comp';
import { clipGroups } from './composite';

const layer = (id: string, clip = false) => {
  const l = drawingsLayer(id, id, [{ drawing: 'd', length: 1 }], 10, 10, 10, 10);
  if (clip) l.clip = true;
  return l;
};

describe('clipping groups', () => {
  it('clipped layers stack on the first unclipped layer below them (layers[0] is the top)', () => {
    // top to bottom: C2 (clip), C1 (clip), Base, Free
    const g = clipGroups([layer('C2', true), layer('C1', true), layer('Base'), layer('Free')]);
    expect([...g.entries()]).toEqual([[2, [1, 0]]]);
  });

  it('a clipped layer at the bottom has nothing to clip to, and plain stacks make no groups', () => {
    expect(clipGroups([layer('A'), layer('B', true)]).size).toBe(0);
    expect(clipGroups([layer('A'), layer('B')]).size).toBe(0);
  });

  it('a storyboard guide never clips', () => {
    const guide = layer('G', true);
    guide.guide = true;
    expect(clipGroups([guide, layer('Base')]).size).toBe(0);
  });
});
