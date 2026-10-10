import { assetPaths, parseProjectFile, type ProjectFile } from './schema';

export interface AutosaveRecord {
  json: string;
  savedAt: number;
}

export interface VersionRecord {
  id: string;
  name: string;
  /** Made automatically (timer, before a risky edit) rather than by the user. */
  auto: boolean;
  at: number;
  json: string;
}

/** Where project data lives on this device. IndexedDB in the browser, memory in tests/fallback. */
export interface Store {
  getAutosave(): Promise<AutosaveRecord | null>;
  putAutosave(r: AutosaveRecord): Promise<void>;
  putAssets(assets: Map<string, Uint8Array>): Promise<void>;
  getAsset(key: string): Promise<Uint8Array | null>;
  assetKeys(): Promise<string[]>;
  deleteAssets(keys: string[]): Promise<void>;
  putVersion(v: VersionRecord): Promise<void>;
  listVersions(): Promise<VersionRecord[]>;
  getVersion(id: string): Promise<VersionRecord | null>;
  deleteVersion(id: string): Promise<void>;
}

export class MemoryStore implements Store {
  autosave: AutosaveRecord | null = null;
  assets = new Map<string, Uint8Array>();
  versions = new Map<string, VersionRecord>();
  async getAutosave() {
    return this.autosave;
  }
  async putAutosave(r: AutosaveRecord) {
    this.autosave = r;
  }
  async putAssets(a: Map<string, Uint8Array>) {
    for (const [k, v] of a) this.assets.set(k, v);
  }
  async getAsset(key: string) {
    return this.assets.get(key) ?? null;
  }
  async assetKeys() {
    return [...this.assets.keys()];
  }
  async deleteAssets(keys: string[]) {
    for (const k of keys) this.assets.delete(k);
  }
  async putVersion(v: VersionRecord) {
    this.versions.set(v.id, v);
  }
  async listVersions() {
    return [...this.versions.values()].sort((a, b) => b.at - a.at);
  }
  async getVersion(id: string) {
    return this.versions.get(id) ?? null;
  }
  async deleteVersion(id: string) {
    this.versions.delete(id);
  }
}

const DB_NAME = '2dope';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted (storage may be full)'));
  });
}

export class IdbStore implements Store {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbStore> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets');
        if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('could not open the local database'));
      r.onblocked = () => reject(new Error('the local database is blocked by another 2Dope tab'));
    });
    return new IdbStore(db);
  }

  async getAutosave(): Promise<AutosaveRecord | null> {
    const v = await req(this.db.transaction('meta').objectStore('meta').get('autosave'));
    return (v as AutosaveRecord | undefined) ?? null;
  }

  async putAutosave(r: AutosaveRecord): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(r, 'autosave');
    await done(tx);
  }

  async putAssets(assets: Map<string, Uint8Array>): Promise<void> {
    if (!assets.size) return;
    const tx = this.db.transaction('assets', 'readwrite');
    const s = tx.objectStore('assets');
    for (const [k, v] of assets) s.put(v, k);
    await done(tx);
  }

  async getAsset(key: string): Promise<Uint8Array | null> {
    const v = await req(this.db.transaction('assets').objectStore('assets').get(key));
    return v ? new Uint8Array(v as ArrayBuffer | Uint8Array) : null;
  }

  async assetKeys(): Promise<string[]> {
    return (await req(this.db.transaction('assets').objectStore('assets').getAllKeys())) as string[];
  }

  async deleteAssets(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const tx = this.db.transaction('assets', 'readwrite');
    const s = tx.objectStore('assets');
    for (const k of keys) s.delete(k);
    await done(tx);
  }

  async putVersion(v: VersionRecord): Promise<void> {
    const tx = this.db.transaction('versions', 'readwrite');
    tx.objectStore('versions').put(v);
    await done(tx);
  }

  async listVersions(): Promise<VersionRecord[]> {
    const all = (await req(this.db.transaction('versions').objectStore('versions').getAll())) as VersionRecord[];
    return all.sort((a, b) => b.at - a.at);
  }

  async getVersion(id: string): Promise<VersionRecord | null> {
    return ((await req(this.db.transaction('versions').objectStore('versions').get(id))) as VersionRecord | undefined) ?? null;
  }

  async deleteVersion(id: string): Promise<void> {
    const tx = this.db.transaction('versions', 'readwrite');
    tx.objectStore('versions').delete(id);
    await done(tx);
  }
}

/** Open IndexedDB, or fall back to memory (autosave then only lasts until the tab closes). */
export async function openStore(): Promise<{ store: Store; persistent: boolean }> {
  try {
    return { store: await IdbStore.open(), persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}

/** Ask the browser not to clear our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && typeof e.usage === 'number' && typeof e.quota === 'number' ? { used: e.usage, quota: e.quota } : null;
  } catch {
    return null;
  }
}

/** Does a saved project have anything worth offering to restore? */
export function hasContent(file: ProjectFile): boolean {
  const layer = file.layers[0];
  if (!layer) return false;
  if (layer.exposures.length > 1 || (layer.exposures[0]?.length ?? 0) > 1) return true;
  return Object.values(file.drawings).some((d) => d.line || d.fill || d.vectors.length > 0);
}

/** Which automatic versions to delete so only the newest `maxAuto` remain. Manual versions are never pruned. */
export function versionsToPrune(list: VersionRecord[], maxAuto: number): string[] {
  return list
    .filter((v) => v.auto)
    .sort((a, b) => b.at - a.at)
    .slice(maxAuto)
    .map((v) => v.id);
}

/** Asset keys no autosave or version refers to any more. */
export function unreferencedAssets(allKeys: string[], autosave: AutosaveRecord | null, versions: VersionRecord[]): string[] {
  const used = new Set<string>();
  const add = (json: string) => {
    try {
      for (const p of assetPaths(parseProjectFile(json))) used.add(p);
    } catch {
      // A record we cannot read keeps nothing alive; it will fail loudly if someone tries to restore it.
    }
  };
  if (autosave) add(autosave.json);
  for (const v of versions) add(v.json);
  return allKeys.filter((k) => !used.has(k));
}
