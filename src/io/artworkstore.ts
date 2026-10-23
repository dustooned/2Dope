/** Separate snapshot packages cannot be collected with deleted project heads/versions. */
export interface ArtworkCard {
  id: string; name: string; created: number; width: number; height: number;
  fps: number; frames: number; layers: number; thumb: Uint8Array | null;
}
export interface ArtworkEntry { card: ArtworkCard; archive: Uint8Array }
export interface ArtworkStore {
  list(): Promise<ArtworkCard[]>;
  get(id: string): Promise<ArtworkEntry | null>;
  put(entry: ArtworkEntry): Promise<void>;
  rename(id: string, name: string): Promise<ArtworkCard | null>;
  remove(id: string): Promise<ArtworkEntry | null>;
}

export function artworkName(value: string): string {
  const name = value.trim().slice(0, 80);
  if (!name) throw new Error('Give this artwork a name.');
  return name;
}

export class MemoryArtworkStore implements ArtworkStore {
  private entries = new Map<string, ArtworkEntry>();
  async list() { return [...this.entries.values()].map(e => structuredClone(e.card)).sort((a, b) => b.created - a.created); }
  async get(id: string) { return structuredClone(this.entries.get(id) ?? null); }
  async put(entry: ArtworkEntry) { this.entries.set(entry.card.id, structuredClone(entry)); }
  async rename(id: string, value: string) {
    const name = artworkName(value), entry = this.entries.get(id);
    if (!entry) return null;
    entry.card.name = name; return structuredClone(entry.card);
  }
  async remove(id: string) {
    const entry = this.entries.get(id); this.entries.delete(id);
    return structuredClone(entry ?? null);
  }
}

export class DeviceArtworkStore implements ArtworkStore {
  constructor(private readonly name = '2dope-artwork') {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('cards', { keyPath: 'id' });
        req.result.createObjectStore('packages');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Artwork storage is unavailable.'));
      req.onblocked = () => reject(new Error('Close other 2Dope tabs and try opening My Assets again.'));
    });
  }
  async list(): Promise<ArtworkCard[]> {
    const db = await this.open();
    try { return await new Promise((resolve, reject) => {
      const req = db.transaction('cards', 'readonly').objectStore('cards').getAll();
      req.onsuccess = () => resolve((req.result as ArtworkCard[]).sort((a, b) => b.created - a.created));
      req.onerror = () => reject(req.error);
    }); } finally { db.close(); }
  }
  async get(id: string): Promise<ArtworkEntry | null> {
    const db = await this.open();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(['cards', 'packages'], 'readonly');
      const card = tx.objectStore('cards').get(id), archive = tx.objectStore('packages').get(id);
      tx.oncomplete = () => resolve(card.result && archive.result ? { card: card.result, archive: archive.result } : null);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }
  async put(entry: ArtworkEntry): Promise<void> {
    const db = await this.open();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['cards', 'packages'], 'readwrite');
      tx.objectStore('cards').put(entry.card); tx.objectStore('packages').put(entry.archive, entry.card.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save this artwork.'));
      tx.onabort = () => reject(tx.error ?? new Error('Artwork storage is full or unavailable. Export the artwork instead.'));
    }); } finally { db.close(); }
  }
  /** Rename only the card; portable/reused packages adopt this name when read. */
  async rename(id: string, value: string): Promise<ArtworkCard | null> {
    const name = artworkName(value), db = await this.open();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction('cards', 'readwrite'), cards = tx.objectStore('cards');
      const req = cards.get(id); let card: ArtworkCard | null = null;
      req.onsuccess = () => { if (req.result) { card = { ...req.result, name }; cards.put(card); } };
      tx.oncomplete = () => resolve(card);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not rename this artwork.'));
    }); } finally { db.close(); }
  }
  /** Read and remove both records atomically, returning the complete snapshot for Undo. */
  async remove(id: string): Promise<ArtworkEntry | null> {
    const db = await this.open();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(['cards', 'packages'], 'readwrite');
      const cards = tx.objectStore('cards'), packages = tx.objectStore('packages');
      const card = cards.get(id), archive = packages.get(id);
      cards.delete(id); packages.delete(id);
      tx.oncomplete = () => resolve(card.result && archive.result ? { card: card.result, archive: archive.result } : null);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not remove this artwork.'));
    }); } finally { db.close(); }
  }
}
