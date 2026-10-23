import { describe, expect, it, vi } from 'vitest';
vi.mock('../brush/raster', () => ({ makeCanvas: (width: number, height: number) => ({ width, height }) }));
import { Project } from '../core/project';
import { compLayer, drawingsLayer, newComp } from '../core/comp';
import { captureArtwork, packArtwork, readArtwork, libraryArtwork } from './artwork';
import { MemoryArtworkStore, type ArtworkEntry } from './artworkstore';
import { readZip, writeZip } from './zip';

function source() {
  const p = new Project(64, 64), c = newComp('c2', 'Landscape', 64, 64, 12), child = newComp('c3', 'Clouds', 64, 64, 6);
  c.asset = true; c.folder = 'folder'; p.folders.push({ id: 'folder', name: 'Sources', parent: null });
  const d = p.adopt('d2', 2, [], 'key', { rev: 0, line: { key: 'assets/ink.png', bytes: null }, fill: null });
  const mask = p.adopt('d3', 3, [], null, { rev: 0, line: { key: 'assets/mask.png', bytes: new Uint8Array([4, 5]) }, fill: null });
  const l = drawingsLayer('L2', 'Paint', [{ drawing: d.id, length: 2 }, { drawing: d.id, length: 3 }], 64, 64);
  l.mask = mask.id; l.visible = false; child.layers.push(l);
  child.audio = [{ id: 'a1', asset: 's1', name: 'Wind', start: 0, trimIn: 0, trimOut: 1, gain: 1, muted: false, link: { layer: l.id, drawing: d.id, occurrence: 0, offset: 0 } }];
  p.sounds.set('s1', { name: 'Wind', path: 'assets/wind.wav', duration: 1, bytes: new Uint8Array([6, 7]) });
  c.layers.push(compLayer('L3', 'Clouds', child, c), compLayer('L4', 'Clouds again', child, c));
  p.comps.set(c.id, c); p.comps.set(child.id, child);
  return { p, c, child, d, bytes: new Uint8Array([1, 2, 3]) };
}

describe('portable artwork snapshots', () => {
  it('stores only the source graph, including hidden frames, masks, internal sharing and audio', async () => {
    const { p, c, bytes } = source();
    const saved = await captureArtwork(p, c.id, async () => bytes);
    expect(saved.file.main).toBe(c.id); expect(Object.keys(saved.file.comps).sort()).toEqual(['c2', 'c3']);
    expect(saved.file.comps.c2!.folder).toBeNull(); expect(saved.file.folders).toEqual({});
    expect(Object.keys(saved.file.drawings).sort()).toEqual(['d2', 'd3']);
    expect(saved.file.comps.c3!.layers[0]!.visible).toBe(false);
    expect(saved.file.comps.c3!.layers[0]!.exposures?.map(e => e.length)).toEqual([2, 3]);
    expect(saved.file.comps.c2!.layers.map(l => l.comp)).toEqual(['c3', 'c3']);
    expect(saved.file.sounds?.s1?.name).toBe('Wind'); expect(saved.assets.size).toBe(3);
    const restored = await readArtwork(packArtwork(saved)); expect(restored.file).toEqual(saved.file);
    for (const [path, bytes] of saved.assets) expect(restored.assets.get(path)).toEqual(bytes);
    expect(p.comp.name).toBe('Shot'); expect(p.drawings.get('d2')!.saved).toBeNull();
  });
  it('captures metadata before waiting for stored pixels and supports native artwork projects', async () => {
    const { p, c, child, d, bytes } = source();
    const pending = captureArtwork(p, c.id, async () => bytes);
    c.name = 'Changed'; child.layers[0]!.name = 'Changed'; d.role = 'breakdown';
    const snapshot = await pending;
    expect(snapshot.file.name).toBe('Landscape'); expect(snapshot.file.comps.c3!.layers[0]!.name).toBe('Paint');
    expect(snapshot.file.drawings.d2!.role).toBe('key');
    p.main = c.id; expect((await captureArtwork(p, c.id, async () => bytes)).file.main).toBe(c.id);
  });
  it('refuses missing stored pixels rather than saving blank replacements', async () => {
    const { p, c } = source();
    await expect(captureArtwork(p, c.id, async () => null)).rejects.toThrow('missing');
    expect(() => captureArtwork(p, p.main, async () => null)).toThrow('Choose an artwork');
  });
  it('refuses incomplete, corrupt and ordinary project archives', async () => {
    const { p, c, bytes } = source(), bundle = await captureArtwork(p, c.id, async () => bytes);
    const incomplete = { ...bundle, assets: new Map<string, Uint8Array>() };
    expect(() => packArtwork(incomplete)).toThrow('missing');
    const zip = await readZip(packArtwork(bundle)); zip.delete([...bundle.assets.keys()][0]!);
    await expect(readArtwork(writeZip([...zip].map(([name, data]) => ({ name, data }))))).rejects.toThrow('missing');
    await expect(readArtwork(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    bundle.file.comps[bundle.file.main]!.asset = false; expect(() => packArtwork(bundle)).toThrow('saved artwork');
  });
  it('keeps library snapshots independent of returned objects and project storage', async () => {
    const store = new MemoryArtworkStore();
    const entry: ArtworkEntry = { card: { id: 'art1', name: 'Sky', created: 1, width: 64, height: 64, layers: 2, frames: 3, fps: 12, thumb: new Uint8Array([1]) }, archive: new Uint8Array([2, 3]) };
    await store.put(entry); entry.archive[0] = 9;
    const loaded = (await store.get('art1'))!; expect(loaded.archive[0]).toBe(2); loaded.card.name = 'Changed'; loaded.archive[1] = 8;
    expect((await store.list())[0]!.name).toBe('Sky'); expect((await store.get('art1'))!.archive[1]).toBe(3);
    expect(await store.get('missing')).toBeNull();
  });
  it('renames future artwork copies and portable files without rewriting saved content', async () => {
    const { p, c, bytes } = source(), store = new MemoryArtworkStore();
    const archive = packArtwork(await captureArtwork(p, c.id, async () => bytes));
    const card = { id: 'art1', name: c.name, created: 1, width: 64, height: 64, layers: 2, frames: 3, fps: 12, thumb: null };
    await store.put({ card, archive });
    const renamed = await store.rename('art1', '  Evening sky  '); expect(renamed!.name).toBe('Evening sky'); renamed!.name = 'Unstored';
    const entry = (await store.get('art1'))!, bundle = await libraryArtwork(entry);
    const portable = await readArtwork(packArtwork(bundle));
    expect(portable.file.name).toBe('Evening sky'); expect(portable.file.comps[portable.file.main]!.name).toBe('Evening sky');
    expect(portable.file.comps.c3!.name).toBe('Clouds'); expect(entry.archive).toEqual(archive);
    expect((await readArtwork(archive)).file.name).toBe('Landscape'); expect(c.name).toBe('Landscape');
    await expect(store.rename('art1', '  ')).rejects.toThrow('name'); expect((await store.get('art1'))!.card.name).toBe('Evening sky');
    await store.rename('art1', 'A'.repeat(100)); expect((await store.list())[0]!.name.length).toBe(80);
    expect(await store.rename('missing', 'Name')).toBeNull();
  });
  it('removes complete library entries and restores their exact independent snapshot', async () => {
    const store = new MemoryArtworkStore(), entry: ArtworkEntry = { card: { id: 'art1', name: 'Sky', created: 1, width: 64, height: 64, layers: 2, frames: 3, fps: 12, thumb: new Uint8Array([1]) }, archive: new Uint8Array([2, 3]) };
    await store.put(entry); const removed = (await store.remove('art1'))!;
    expect(removed).toEqual(entry); expect(await store.get('art1')).toBeNull(); expect(await store.list()).toEqual([]);
    expect(await store.remove('missing')).toBeNull(); await store.put(removed); removed.archive[0] = 9;
    expect(await store.get('art1')).toEqual(entry);
  });
});
