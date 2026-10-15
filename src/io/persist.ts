import { mainLength, parseProjectFile, type ProjectFile } from './schema';

/**
 * The project library on this device: many projects, folders, restore points, and one shared pool
 * of content-addressed images (a drawing stored once is shared by every project and version that
 * uses it).
 *
 * Records:
 * - `projects`: the card the gallery shows (name, folder, dates, size, small thumbnail). Small.
 * - `heads`:    the latest autosaved project.json of each project. Loaded only when opened.
 * - `versions`: named and automatic restore points, per project.
 * - `refs`:     which assets each head/version uses, so clean-up never has to parse JSON.
 * - `assets`:   PNG bytes by content hash.
 * - `meta`:     small settings (last opened project...).
 *
 * Crash safety: a head or version is written in ONE transaction together with its new assets and
 * its refs, so a crash leaves either the old save or the new one, never a half.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  /** Folder id, or null for the top level. */
  folder: string | null;
  created: number;
  modified: number;
  opened: number;
  frames: number;
  drawings: number;
  fps: number;
  width: number;
  height: number;
  /** Small PNG preview, or null. */
  thumb: Uint8Array | null;
}

export interface FolderRecord {
  id: string;
  name: string;
  created: number;
}

export interface HeadRecord {
  id: string;
  json: string;
  savedAt: number;
}

export interface VersionRecord {
  id: string;
  /** The project this restore point belongs to. */
  project: string;
  name: string;
  /** Made automatically (timer, before a risky edit) rather than by the user. */
  auto: boolean;
  at: number;
  json: string;
}

export interface Store {
  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<ProjectMeta | null>;
  /** Update a project's card only (rename, move to a folder, opened time). */
  putProjectMeta(m: ProjectMeta): Promise<void>;
  getHead(id: string): Promise<HeadRecord | null>;
  /** Save a project: new assets, its card, its head and its refs, all-or-nothing. */
  saveHead(meta: ProjectMeta, head: HeadRecord, assets: Map<string, Uint8Array>, refs: string[]): Promise<void>;
  /** Delete a project with its head, versions and refs (assets are cleaned up later). */
  deleteProject(id: string): Promise<void>;

  listFolders(): Promise<FolderRecord[]>;
  putFolder(f: FolderRecord): Promise<void>;
  /** Delete a folder; its projects move to the top level. */
  deleteFolder(id: string): Promise<void>;

  getSetting<T>(key: string): Promise<T | null>;
  putSetting(key: string, value: unknown): Promise<void>;

  putAssets(assets: Map<string, Uint8Array>): Promise<void>;
  getAsset(key: string): Promise<Uint8Array | null>;
  assetKeys(): Promise<string[]>;
  deleteAssets(keys: string[]): Promise<void>;
  /** Every asset key a head or version uses. */
  referencedAssets(): Promise<Set<string>>;

  putVersion(v: VersionRecord, assets: Map<string, Uint8Array>, refs: string[]): Promise<void>;
  listVersions(project: string): Promise<VersionRecord[]>;
  getVersion(id: string): Promise<VersionRecord | null>;
  deleteVersion(id: string): Promise<void>;
}

const headRef = (id: string) => `h:${id}`;
const versionRef = (id: string) => `v:${id}`;

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** A project card describing a project file. */
export function metaFromFile(id: string, file: ProjectFile, base: Partial<ProjectMeta> = {}): ProjectMeta {
  const now = Date.now();
  return {
    id,
    name: file.name,
    folder: base.folder ?? null,
    created: base.created ?? (Date.parse(file.created) || now),
    modified: base.modified ?? (Date.parse(file.modified) || now),
    opened: base.opened ?? now,
    frames: mainLength(file),
    drawings: Object.keys(file.drawings).length,
    fps: file.fps,
    width: file.canvas.width,
    height: file.canvas.height,
    thumb: base.thumb ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// In memory (tests, and browsers without IndexedDB)

export class MemoryStore implements Store {
  projects = new Map<string, ProjectMeta>();
  heads = new Map<string, HeadRecord>();
  folders = new Map<string, FolderRecord>();
  settings = new Map<string, unknown>();
  assets = new Map<string, Uint8Array>();
  versions = new Map<string, VersionRecord>();
  refs = new Map<string, string[]>();

  async listProjects() {
    return [...this.projects.values()];
  }
  async getProject(id: string) {
    return this.projects.get(id) ?? null;
  }
  async putProjectMeta(m: ProjectMeta) {
    this.projects.set(m.id, m);
  }
  async getHead(id: string) {
    return this.heads.get(id) ?? null;
  }
  async saveHead(meta: ProjectMeta, head: HeadRecord, assets: Map<string, Uint8Array>, refs: string[]) {
    for (const [k, v] of assets) this.assets.set(k, v);
    this.projects.set(meta.id, meta);
    this.heads.set(head.id, head);
    this.refs.set(headRef(head.id), refs);
  }
  async deleteProject(id: string) {
    this.projects.delete(id);
    this.heads.delete(id);
    this.refs.delete(headRef(id));
    for (const v of [...this.versions.values()]) if (v.project === id) await this.deleteVersion(v.id);
  }
  async listFolders() {
    return [...this.folders.values()];
  }
  async putFolder(f: FolderRecord) {
    this.folders.set(f.id, f);
  }
  async deleteFolder(id: string) {
    this.folders.delete(id);
    for (const p of this.projects.values()) if (p.folder === id) p.folder = null;
  }
  async getSetting<T>(key: string) {
    return (this.settings.get(key) as T | undefined) ?? null;
  }
  async putSetting(key: string, value: unknown) {
    this.settings.set(key, value);
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
  async referencedAssets() {
    return new Set([...this.refs.values()].flat());
  }
  async putVersion(v: VersionRecord, assets: Map<string, Uint8Array>, refs: string[]) {
    for (const [k, b] of assets) this.assets.set(k, b);
    this.versions.set(v.id, v);
    this.refs.set(versionRef(v.id), refs);
  }
  async listVersions(project: string) {
    return [...this.versions.values()].filter((v) => v.project === project).sort((a, b) => b.at - a.at);
  }
  async getVersion(id: string) {
    return this.versions.get(id) ?? null;
  }
  async deleteVersion(id: string) {
    this.versions.delete(id);
    this.refs.delete(versionRef(id));
  }
}

// ---------------------------------------------------------------------------------------------
// IndexedDB

const DB_NAME = '2dope';
const DB_VERSION = 2;

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
      r.onupgradeneeded = (ev) => {
        const d = r.result;
        const tx = r.transaction;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets');
        if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id' });
        if (ev.oldVersion < 2) {
          d.createObjectStore('projects', { keyPath: 'id' });
          d.createObjectStore('heads', { keyPath: 'id' });
          d.createObjectStore('folders', { keyPath: 'id' });
          d.createObjectStore('refs');
          tx?.objectStore('versions').createIndex('project', 'project');
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('could not open the local database'));
      r.onblocked = () => reject(new Error('the local database is blocked by another 2Dope tab'));
    });
    const s = new IdbStore(db);
    await s.migrateSingleProject();
    return s;
  }

  /**
   * Before the library, 2Dope kept one autosaved project plus versions. Turn that into the first
   * project of the library so nothing is lost.
   */
  private async migrateSingleProject(): Promise<void> {
    const legacy = (await req(this.db.transaction('meta').objectStore('meta').get('autosave'))) as { json: string; savedAt: number } | undefined;
    const versions = (await req(this.db.transaction('versions').objectStore('versions').getAll())) as (VersionRecord & { project?: string })[];
    const orphans = versions.filter((v) => !v.project);
    if (!legacy && !orphans.length) return;
    const id = newId('p');
    let meta: ProjectMeta | null = null;
    let refs: string[] = [];
    const source = legacy?.json ?? orphans.sort((a, b) => b.at - a.at)[0]?.json;
    if (source) {
      try {
        const file = parseProjectFile(source);
        meta = metaFromFile(id, file, { modified: legacy?.savedAt });
        refs = [...assetsOf(file)];
      } catch {
        meta = null; // unreadable: keep the versions, they will say so when restored
      }
    }
    const tx = this.db.transaction(['meta', 'projects', 'heads', 'refs', 'versions'], 'readwrite');
    if (meta && source) {
      tx.objectStore('projects').put(meta);
      tx.objectStore('heads').put({ id, json: source, savedAt: legacy?.savedAt ?? Date.now() } satisfies HeadRecord);
      tx.objectStore('refs').put(refs, headRef(id));
      tx.objectStore('meta').put(id, 'lastProject');
    }
    for (const v of orphans) {
      v.project = id;
      tx.objectStore('versions').put(v);
      try {
        tx.objectStore('refs').put([...assetsOf(parseProjectFile(v.json))], versionRef(v.id));
      } catch {
        // unreadable version: no refs
      }
    }
    tx.objectStore('meta').delete('autosave');
    await done(tx);
  }

  async listProjects(): Promise<ProjectMeta[]> {
    return (await req(this.db.transaction('projects').objectStore('projects').getAll())) as ProjectMeta[];
  }

  async getProject(id: string): Promise<ProjectMeta | null> {
    return ((await req(this.db.transaction('projects').objectStore('projects').get(id))) as ProjectMeta | undefined) ?? null;
  }

  async putProjectMeta(m: ProjectMeta): Promise<void> {
    const tx = this.db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(m);
    await done(tx);
  }

  async getHead(id: string): Promise<HeadRecord | null> {
    return ((await req(this.db.transaction('heads').objectStore('heads').get(id))) as HeadRecord | undefined) ?? null;
  }

  async saveHead(meta: ProjectMeta, head: HeadRecord, assets: Map<string, Uint8Array>, refs: string[]): Promise<void> {
    const tx = this.db.transaction(['assets', 'projects', 'heads', 'refs'], 'readwrite');
    const a = tx.objectStore('assets');
    for (const [k, v] of assets) a.put(v, k);
    tx.objectStore('projects').put(meta);
    tx.objectStore('heads').put(head);
    tx.objectStore('refs').put(refs, headRef(head.id));
    await done(tx);
  }

  async deleteProject(id: string): Promise<void> {
    const vs = await this.listVersions(id);
    const tx = this.db.transaction(['projects', 'heads', 'refs', 'versions'], 'readwrite');
    tx.objectStore('projects').delete(id);
    tx.objectStore('heads').delete(id);
    tx.objectStore('refs').delete(headRef(id));
    for (const v of vs) {
      tx.objectStore('versions').delete(v.id);
      tx.objectStore('refs').delete(versionRef(v.id));
    }
    await done(tx);
  }

  async listFolders(): Promise<FolderRecord[]> {
    return (await req(this.db.transaction('folders').objectStore('folders').getAll())) as FolderRecord[];
  }

  async putFolder(f: FolderRecord): Promise<void> {
    const tx = this.db.transaction('folders', 'readwrite');
    tx.objectStore('folders').put(f);
    await done(tx);
  }

  async deleteFolder(id: string): Promise<void> {
    const projects = await this.listProjects();
    const tx = this.db.transaction(['folders', 'projects'], 'readwrite');
    tx.objectStore('folders').delete(id);
    for (const p of projects) if (p.folder === id) tx.objectStore('projects').put({ ...p, folder: null });
    await done(tx);
  }

  async getSetting<T>(key: string): Promise<T | null> {
    return ((await req(this.db.transaction('meta').objectStore('meta').get(key))) as T | undefined) ?? null;
  }

  async putSetting(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
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

  async referencedAssets(): Promise<Set<string>> {
    const all = (await req(this.db.transaction('refs').objectStore('refs').getAll())) as string[][];
    return new Set(all.flat());
  }

  async putVersion(v: VersionRecord, assets: Map<string, Uint8Array>, refs: string[]): Promise<void> {
    const tx = this.db.transaction(['assets', 'versions', 'refs'], 'readwrite');
    const a = tx.objectStore('assets');
    for (const [k, b] of assets) a.put(b, k);
    tx.objectStore('versions').put(v);
    tx.objectStore('refs').put(refs, versionRef(v.id));
    await done(tx);
  }

  async listVersions(project: string): Promise<VersionRecord[]> {
    const all = (await req(this.db.transaction('versions').objectStore('versions').index('project').getAll(project))) as VersionRecord[];
    return all.sort((a, b) => b.at - a.at);
  }

  async getVersion(id: string): Promise<VersionRecord | null> {
    return ((await req(this.db.transaction('versions').objectStore('versions').get(id))) as VersionRecord | undefined) ?? null;
  }

  async deleteVersion(id: string): Promise<void> {
    const tx = this.db.transaction(['versions', 'refs'], 'readwrite');
    tx.objectStore('versions').delete(id);
    tx.objectStore('refs').delete(versionRef(id));
    await done(tx);
  }
}

/** Open IndexedDB, or fall back to memory (work then only lasts until the tab closes). */
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

/** Every asset path a project file uses. */
export function assetsOf(p: ProjectFile): Set<string> {
  const s = new Set<string>();
  for (const d of Object.values(p.drawings)) {
    if (d.line) s.add(d.line);
    if (d.fill) s.add(d.fill);
  }
  for (const sound of Object.values(p.sounds ?? {})) s.add(sound.path);
  return s;
}

/** Does a saved project have anything worth keeping? */
export function hasContent(file: ProjectFile): boolean {
  if (Object.keys(file.sounds ?? {}).length) return true;
  const comps = Object.values(file.comps);
  if (comps.length > 1 || comps.some((c) => c.layers.length > 1)) return true;
  if (mainLength(file) > 1) return true;
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

/** Asset keys nothing refers to: not a head, not a version, not a drawing still in memory. */
export function unreferencedAssets(allKeys: string[], referenced: Set<string>, keep: Set<string> = new Set()): string[] {
  return allKeys.filter((k) => !referenced.has(k) && !keep.has(k));
}
