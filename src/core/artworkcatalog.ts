import type { ArtworkCard } from '../io/artworkstore';
import type { ArtworkPackage } from '../io/artwork';

export type ArtworkKind = 'drawing' | 'vector' | 'clip';
export const artworkKind = (card: ArtworkCard): ArtworkKind => card.kind ?? (card.frames > 1 ? 'clip' : 'drawing');
export function packageKind(bundle: ArtworkPackage, frames: number): ArtworkKind {
  if (frames > 1) return 'clip';
  const drawings = Object.values(bundle.file.drawings);
  return drawings.some(d => d.vectors.length) && drawings.every(d => !d.line && !d.fill) ? 'vector' : 'drawing';
}
export function filterArtwork(cards: ArtworkCard[], query: string, kind: string, collection: string, sort: string): ArtworkCard[] {
  const words = query.trim().normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter(c => words.every(w => `${c.name} ${c.collection ?? ''}`.normalize('NFKC').toLocaleLowerCase().includes(w)) &&
    (kind === 'all' || artworkKind(c) === kind) && (collection === '*' || (c.collection ?? '') === collection))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      : sort === 'duration' ? b.frames / b.fps - a.frames / a.fps || a.name.localeCompare(b.name)
      : (sort === 'created' ? b.created - a.created : (b.updated ?? b.created) - (a.updated ?? a.created)) || a.name.localeCompare(b.name));
}
