import { describe, expect, it } from 'vitest';
import { artworkKind, filterArtwork, packageKind } from './artworkcatalog';
import { MemoryArtworkStore, type ArtworkCard } from '../io/artworkstore';
import type { ArtworkPackage } from '../io/artwork';

const card = (id: string, extra: Partial<ArtworkCard> = {}): ArtworkCard => ({ id, name: id, created: 1, width: 64, height: 64, frames: 1, fps: 12, layers: 1, thumb: null, ...extra });
describe('saved artwork catalog', () => {
  it('filters names/collections/types without mutating or opening saved packages', () => {
    const cards = [card('Sky', { kind: 'vector', collection: 'Backgrounds' }), card('Walk', { frames: 24, collection: 'Characters' }), card('Tree')];
    expect(filterArtwork(cards, 'ｓｋｙ background', 'vector', '*', 'name').map(c => c.id)).toEqual(['Sky']);
    expect(filterArtwork(cards, '', 'clip', 'Characters', 'name').map(c => c.id)).toEqual(['Walk']);
    expect(filterArtwork(cards, '', 'all', '', 'name').map(c => c.id)).toEqual(['Tree']);
    expect(cards.map(c => c.id)).toEqual(['Sky', 'Walk', 'Tree']); expect(artworkKind(card('Old clip', { frames: 2 }))).toBe('clip');
  });
  it('sorts by actual duration and uses update dates with old-card fallbacks', () => {
    const cards = [card('A', { frames: 60, fps: 60, created: 9 }), card('B', { frames: 24, fps: 12, updated: 15 }), card('C', { created: 10 })];
    expect(filterArtwork(cards, '', 'all', '*', 'duration').map(c => c.id)).toEqual(['B', 'A', 'C']);
    expect(filterArtwork(cards, '', 'all', '*', 'updated').map(c => c.id)).toEqual(['B', 'C', 'A']);
    expect(filterArtwork(cards, '', 'all', '*', 'created').map(c => c.id)).toEqual(['C', 'A', 'B']);
  });
  it('classifies editable vector-only sources separately from mixed raster art and clips', () => {
    const bundle = { file: { drawings: { d1: { vectors: [{}], line: null, fill: null } } } } as unknown as ArtworkPackage;
    expect(packageKind(bundle, 1)).toBe('vector'); expect(packageKind(bundle, 2)).toBe('clip');
    bundle.file.drawings.d1!.line = 'ink.png'; expect(packageKind(bundle, 1)).toBe('drawing');
  });
  it('replaces only an existing snapshot while preserving its identity, collection, date and name', async () => {
    const store = new MemoryArtworkStore(), first = { card: card('art', { name: 'Walk', collection: 'Characters', created: 4 }), archive: new Uint8Array([1]) };
    await store.put(first);
    const result = await store.replace('art', { card: card('incoming', { name: 'Updated source', frames: 24 }), archive: new Uint8Array([2]) });
    expect(result).toMatchObject({ id: 'art', name: 'Walk', collection: 'Characters', created: 4, frames: 24 });
    expect((await store.get('art'))!.archive).toEqual(new Uint8Array([2])); expect((await store.list()).length).toBe(1);
    await store.remove('art'); expect(await store.replace('art', first)).toBeNull(); expect(await store.move('art', 'Props')).toBeNull();
  });
});
