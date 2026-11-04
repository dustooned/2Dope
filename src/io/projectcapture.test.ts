import { describe, expect, it, vi } from 'vitest';
vi.mock('../brush/raster', () => ({ makeCanvas: (width: number, height: number) => ({ width, height }) }));
import { Project } from '../core/project';
import { newComp, drawingsLayer } from '../core/comp';
import { captureProject } from './projectio';
const rig = () => {
  const p = new Project(64, 64, false), comp = newComp('c1', 'Shot', 64, 64, 12); p.comps.set(comp.id, comp);
  for (let i = 1; i <= 3; i++) p.adopt(`d${i}`, i, [], null, { rev: 0, line: { key: `assets/source${i}.png`, bytes: null }, fill: null });
  comp.layers.push(drawingsLayer('art', 'Art', [1, 2, 3].map(i => ({ drawing: `d${i}`, length: 1 })), 64, 64)); return p;
};
describe('bounded immutable archive capture', () => {
  it('loads source planes lazily and stops before fetching the rest of an oversized archive', async () => {
    const loaded: string[] = [], pending = captureProject(rig(), { mode: 'archive', maxAssetBytes: 10, source: async key => { loaded.push(key); return new Uint8Array(8).fill(loaded.length); } });
    expect(loaded).toEqual([]); await expect(pending.settle()).rejects.toThrow('snapshot exceeds'); expect(loaded).toEqual(['assets/source1.png', 'assets/source2.png']);
  });
  it('counts shared immutable images once against the byte limit', async () => {
    const result = await captureProject(rig(), { mode: 'archive', maxAssetBytes: 8, source: async () => new Uint8Array(8).fill(1) }).settle();
    expect(result.assets.size).toBe(1); expect(new Set(Object.values(result.file.drawings).map(d => d.line)).size).toBe(1);
  });
  it('refuses a missing referenced image instead of saving a blank replacement', async () => {
    await expect(captureProject(rig(), { mode: 'archive', source: async () => null }).settle()).rejects.toThrow('image asset is missing');
  });
});
