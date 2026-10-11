import type { App } from '../app';
import { Project } from '../core/project';
import { referencedKeys } from '../core/residency';
import { Autosaver } from '../io/autosave';
import { encodePng } from '../io/codec';
import { assetsOf, hasContent, metaFromFile, newId, requestPersistence, storageEstimate, type FolderRecord, type ProjectMeta, type Store, type VersionRecord } from '../io/persist';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, SchemaError, stringifyProjectFile, type ProjectFile } from '../io/schema';
import { readZip, writeZip, ZipError } from '../io/zip';
import { THUMB_H, THUMB_W } from '../view/planeops';

const BACKUP_AFTER_MS = 30 * 60_000;
const BACKUP_MIN_CHANGES = 15;
const RISKY_VERSION_GAP_MS = 30_000;
const LAST_PROJECT = 'lastProject';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 1e7 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function fileName(name: string, ext: string): string {
  const base = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'untitled';
  return `${base}.${ext}`;
}

/** Options for a new project (the New dialog fills these in; defaults match the app today). */
export interface NewProjectOptions {
  name?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** How many frames the first drawing is held (default 1). */
  frames?: number;
  folder?: string | null;
}

/**
 * The project library: every project lives on this device and is always saved (like Procreate
 * Dreams' Theater). This class opens, creates, imports, exports, duplicates and deletes projects,
 * shows autosave status, and keeps restore points. The gallery screen builds on its methods.
 */
export class FileUI {
  readonly autosaver: Autosaver;
  /** Fires when the library changed (a project was added, renamed, moved, deleted). */
  onLibraryChanged: () => void = () => {};
  /** Fires after a project was opened or created (the gallery closes itself). */
  onOpened: () => void = () => {};
  private readonly status = document.querySelector<HTMLElement>('#savestatus');
  private readonly storageEl = document.querySelector<HTMLElement>('#storage');
  private readonly nameInput = document.querySelector<HTMLInputElement>('#pname');
  private readonly toasts = document.querySelector<HTMLElement>('#toasts');
  private readonly dialog = document.querySelector<HTMLDialogElement>('#versions');
  private lastRiskyAt = 0;
  private lastExportAt = Date.now();
  private lastExportChanges = 0;
  private remindedAt = 0;
  private persisted = false;
  private tabs: BroadcastChannel | null = null;
  private readonly tabId = Math.random().toString(36).slice(2);

  constructor(
    private readonly app: App,
    readonly store: Store,
    private readonly durable: boolean,
  ) {
    app.assets = (k) => store.getAsset(k);
    app.residency.onWarning = (m) => this.toast(m);
    this.autosaver = new Autosaver(store, () => captureProject(app.project), {
      busy: () => app.strokeActive,
      thumb: () => this.makeThumb(),
      keep: () => referencedKeys(app.project),
    });
    this.autosaver.onStatus = () => this.renderStatus();
    app.onDocChanged = () => this.autosaver.markDirty();
    app.onRisky = (label) => {
      const now = Date.now();
      if (now - this.lastRiskyAt < RISKY_VERSION_GAP_MS) return;
      this.lastRiskyAt = now;
      void this.autosaver.saveVersion(label, true);
    };
    const prevLoaded = app.onProjectLoaded;
    app.onProjectLoaded = () => {
      prevLoaded();
      if (this.nameInput) this.nameInput.value = app.project.name === 'Untitled' ? '' : app.project.name;
    };
    this.bind();
    this.autosaver.start();
    this.renderStatus();
    void this.refreshStorage();
    setInterval(() => void this.refreshStorage(), 30_000);
    setInterval(() => this.maybeRemindBackup(), 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.autosaver.flush();
    });
    window.addEventListener('pagehide', () => void this.autosaver.flush());
    window.addEventListener('beforeunload', (e) => {
      if (this.autosaver.state === 'dirty' || this.autosaver.state === 'saving' || this.autosaver.state === 'error') e.preventDefault();
    });
    this.watchOtherTabs();
  }

  /** The open project's library card. */
  get current(): ProjectMeta | null {
    return this.autosaver.meta;
  }

  // -------------------------------------------------------------------------------------------

  private bind(): void {
    const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
    q('[data-file="save"]')?.addEventListener('click', () => void this.exportProject());
    q('[data-file="versions"]')?.addEventListener('click', () => void this.openVersions());
    const input = q<HTMLInputElement>('#openfile');
    q('[data-file="open"]')?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (f) void this.importFile(f);
    });
    this.nameInput?.addEventListener('input', () => {
      this.app.project.name = this.nameInput?.value.trim() || 'Untitled';
      this.autosaver.markDirty();
    });
    // Versions dialog
    this.dialog?.querySelector('[data-v="close"]')?.addEventListener('click', () => this.dialog?.close());
    this.dialog?.querySelector('[data-v="save"]')?.addEventListener('click', () => void this.saveNamedVersion());
    this.dialog?.querySelector('[data-v="json"]')?.addEventListener('click', () => void this.exportJson());
  }

  toast(message: string, actions: { label: string; run: () => void }[] = [], ms = 0): HTMLElement {
    const t = el('div', { class: 'toast', role: 'status' });
    t.append(el('span', {}, message));
    for (const a of actions) {
      const b = el('button', { type: 'button' }, a.label);
      b.addEventListener('click', () => {
        t.remove();
        a.run();
      });
      t.append(b);
    }
    const x = el('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss' }, '×');
    x.addEventListener('click', () => t.remove());
    t.append(x);
    this.toasts?.append(t);
    // Messages with no buttons go away on their own; ones that ask something stay until answered.
    const life = ms || (actions.length ? 0 : 12_000);
    if (life) setTimeout(() => t.remove(), life);
    return t;
  }

  private renderStatus(): void {
    const s = this.status;
    if (!s) return;
    const a = this.autosaver;
    s.dataset.state = a.state;
    s.textContent =
      a.state === 'saving'
        ? 'Saving…'
        : a.state === 'dirty'
          ? 'Unsaved changes'
          : a.state === 'error'
            ? `Could not save: ${a.error ?? 'unknown error'}`
            : a.state === 'saved' && a.lastSavedAt
              ? `Saved ${clock(a.lastSavedAt)}`
              : 'Autosave on';
    if (a.state === 'saved') void this.refreshStorage();
  }

  private async refreshStorage(): Promise<void> {
    const el = this.storageEl;
    if (!el) return;
    if (!this.persisted && this.durable) this.persisted = await requestPersistence();
    const e = await storageEstimate();
    const where = this.durable ? (this.persisted ? 'protected' : 'may be cleared by the browser') : 'NOT saved (private mode?)';
    el.textContent = e ? `${bytes(e.used)} of ${bytes(e.quota)} used on this device` : '';
    el.title = `Local storage: ${where}. Export a .2dope file for a backup you control.`;
    el.dataset.risk = this.durable && this.persisted ? 'ok' : 'warn';
  }

  /** The gallery card picture: the current drawing on white. */
  private async makeThumb(): Promise<Uint8Array | null> {
    const t = this.app.drawing.thumb;
    if (!t) return null;
    const c = el('canvas', { width: String(THUMB_W), height: String(THUMB_H) });
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, THUMB_W, THUMB_H);
    const s = Math.min(THUMB_W / t.width, THUMB_H / t.height);
    g.drawImage(t, (THUMB_W - t.width * s) / 2, (THUMB_H - t.height * s) / 2, t.width * s, t.height * s);
    return encodePng(c);
  }

  // -------------------------------------------------------------------------------------------
  // The library

  /** On start: reopen the last project, or start the first one. Nothing to "restore": it is all saved. */
  async start(): Promise<void> {
    try {
      const last = await this.store.getSetting<string>(LAST_PROJECT);
      const all = await this.store.listProjects();
      const pick = all.find((p) => p.id === last) ?? all.sort((a, b) => b.opened - a.opened)[0];
      if (pick && (await this.openProject(pick.id, true))) return;
    } catch (e) {
      this.toast(`The library could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
    await this.createProject({});
  }

  /** Open a project from the library. Saves the current one first. False if it could not be read. */
  async openProject(id: string, quiet = false): Promise<boolean> {
    try {
      await this.autosaver.flush();
      const meta = await this.store.getProject(id);
      const head = await this.store.getHead(id);
      if (!meta || !head) throw new Error('it is not in the library any more');
      const file = parseProjectFile(head.json);
      const { project, warnings } = loadProjectFile(file);
      const card = { ...meta, opened: Date.now() };
      // load first, then tell the autosaver: loading counts as a change, opening must not
      this.app.loadProject(project);
      this.autosaver.open(card, true);
      await this.store.putProjectMeta(card);
      await this.store.putSetting(LAST_PROJECT, id);
      this.announceOpen();
      if (!quiet) this.toast(`Opened “${meta.name}”.`, [], 3000);
      for (const w of warnings.slice(0, 3)) this.toast(w);
      this.onLibraryChanged();
      this.onOpened();
      return true;
    } catch (e) {
      this.toast(`Could not open that project: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** Start a new project in the library (the current one stays, saved). An untouched one is removed. */
  async newProject(opts: NewProjectOptions = {}): Promise<void> {
    await this.createProject(opts);
  }

  private async createProject(opts: NewProjectOptions): Promise<void> {
    const prev = this.current;
    const prevEmpty = prev ? !(await this.projectHasContent()) : false;
    await this.autosaver.flush();
    const p = new Project(opts.width ?? this.app.docW, opts.height ?? this.app.docH);
    p.name = opts.name?.trim() || 'Untitled';
    if (opts.fps) p.fps = opts.fps;
    if (opts.frames && opts.frames > 1) p.exposures = [{ drawing: p.exposures[0]!.drawing, length: opts.frames }];
    const now = Date.now();
    const meta: ProjectMeta = {
      id: newId('p'),
      name: p.name,
      folder: opts.folder ?? null,
      created: now,
      modified: now,
      opened: now,
      frames: opts.frames && opts.frames > 1 ? opts.frames : 1,
      drawings: 1,
      fps: p.fps,
      width: p.width,
      height: p.height,
      thumb: null,
    };
    this.app.loadProject(p);
    this.autosaver.open(meta, false);
    await this.store.putSetting(LAST_PROJECT, meta.id);
    await this.autosaver.flush();
    if (prev && prevEmpty) await this.autosaver.then(() => this.store.deleteProject(prev.id));
    this.announceOpen();
    this.onLibraryChanged();
    this.onOpened();
  }

  private async projectHasContent(): Promise<boolean> {
    try {
      return hasContent((await captureProject(this.app.project).settle()).file);
    } catch {
      return true;
    }
  }

  /** Bring a .2dope (or project.json) into the library as a new project and open it. */
  async importFile(f: File): Promise<void> {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let file: ProjectFile;
      const assets = new Map<string, Uint8Array>();
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        const zip = await readZip(buf);
        const json = zip.get('project.json');
        if (!json) throw new SchemaError('this zip has no project.json, so it is not a 2Dope project');
        file = parseProjectFile(new TextDecoder().decode(json));
        for (const path of assetsOf(file)) {
          const b = zip.get(path);
          if (b) assets.set(path, b);
        }
      } else {
        file = parseProjectFile(new TextDecoder().decode(buf));
      }
      const missing = [...assetsOf(file)].filter((p) => !assets.has(p));
      const id = newId('p');
      const now = Date.now();
      const meta = metaFromFile(id, file, { folder: null, created: now, modified: now, opened: now });
      await this.store.saveHead(meta, { id, json: stringifyProjectFile(file), savedAt: now }, assets, [...assetsOf(file)]);
      if (await this.openProject(id, true)) this.toast(`Imported ${f.name} into your projects.`, [], 4000);
      if (missing.length) this.toast(`${missing.length} image${missing.length === 1 ? ' is' : 's are'} missing from ${f.name}; those drawings open blank.`);
    } catch (e) {
      const why = e instanceof SchemaError || e instanceof ZipError ? e.message : e instanceof Error ? e.message : String(e);
      this.toast(`Could not open ${f.name}: ${why}`);
    }
  }

  async renameProject(id: string, name: string): Promise<void> {
    const clean = name.trim().slice(0, 120) || 'Untitled';
    if (this.current?.id === id) {
      this.app.project.name = clean;
      if (this.nameInput) this.nameInput.value = clean === 'Untitled' ? '' : clean;
      this.autosaver.meta = { ...this.current, name: clean };
      this.autosaver.markDirty();
    }
    const m = await this.store.getProject(id);
    if (m) await this.store.putProjectMeta({ ...m, name: clean });
    this.onLibraryChanged();
  }

  async moveProject(id: string, folder: string | null): Promise<void> {
    if (this.current?.id === id) this.autosaver.meta = { ...this.current, folder };
    const m = await this.store.getProject(id);
    if (m) await this.store.putProjectMeta({ ...m, folder });
    this.onLibraryChanged();
  }

  /** A copy that shares the same stored images (no extra space until you change it). */
  async duplicateProject(id: string): Promise<void> {
    if (this.current?.id === id) await this.autosaver.flush();
    const m = await this.store.getProject(id);
    const head = await this.store.getHead(id);
    if (!m || !head) return;
    const file = parseProjectFile(head.json);
    file.name = `${m.name} copy`;
    const nid = newId('p');
    const now = Date.now();
    const meta: ProjectMeta = { ...m, id: nid, name: file.name, created: now, modified: now, opened: 0 };
    await this.store.saveHead(meta, { id: nid, json: stringifyProjectFile(file), savedAt: now }, new Map(), [...assetsOf(file)]);
    this.onLibraryChanged();
  }

  /** Delete a project for good. Opening another first when it is the open one. */
  async deleteProject(id: string): Promise<void> {
    if (this.current?.id === id) {
      const others = (await this.store.listProjects()).filter((p) => p.id !== id).sort((a, b) => b.opened - a.opened);
      const next = others[0];
      if (!next || !(await this.openProject(next.id, true))) await this.createProject({});
    }
    await this.autosaver.then(() => this.store.deleteProject(id));
    this.onLibraryChanged();
  }

  async newFolder(name: string): Promise<FolderRecord> {
    const f: FolderRecord = { id: newId('f'), name: name.trim().slice(0, 80) || 'New folder', created: Date.now() };
    await this.store.putFolder(f);
    this.onLibraryChanged();
    return f;
  }

  async renameFolder(f: FolderRecord, name: string): Promise<void> {
    await this.store.putFolder({ ...f, name: name.trim().slice(0, 80) || f.name });
    this.onLibraryChanged();
  }

  async deleteFolder(id: string): Promise<void> {
    if (this.current?.folder === id) this.autosaver.meta = { ...this.current, folder: null };
    await this.store.deleteFolder(id);
    this.onLibraryChanged();
  }

  // -------------------------------------------------------------------------------------------
  // Export

  /** Build the files of a .2dope archive (every image included, so it never depends on this device). */
  private async buildArchive(): Promise<{ file: ProjectFile; zip: Uint8Array }> {
    const settled = await captureProject(this.app.project, { mode: 'archive', source: (k) => this.store.getAsset(k) }).settle();
    const text = stringifyProjectFile(settled.file);
    const files = [{ name: 'project.json', data: new TextEncoder().encode(text) }, ...[...settled.assets].map(([name, data]) => ({ name, data }))];
    return { file: settled.file, zip: writeZip(files) };
  }

  async exportProject(): Promise<void> {
    try {
      const { zip } = await this.buildArchive();
      download(new Blob([zip as BlobPart], { type: 'application/zip' }), fileName(this.app.project.name, '2dope'));
      this.lastExportAt = Date.now();
      this.lastExportChanges = this.autosaver.changes;
      this.toast('Saved a .2dope file to your downloads. Keep it somewhere safe.', [], 5000);
    } catch (e) {
      this.toast(`Could not save the file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Download any project in the library as a .2dope file (it does not have to be open). */
  async exportStored(id: string): Promise<void> {
    try {
      if (this.current?.id === id) {
        await this.exportProject();
        return;
      }
      const head = await this.store.getHead(id);
      if (!head) throw new Error('it is not in the library any more');
      const file = parseProjectFile(head.json);
      const files: { name: string; data: Uint8Array }[] = [{ name: 'project.json', data: new TextEncoder().encode(stringifyProjectFile(file)) }];
      for (const path of assetsOf(file)) {
        const data = await this.store.getAsset(path);
        if (data) files.push({ name: path, data });
      }
      download(new Blob([writeZip(files) as BlobPart], { type: 'application/zip' }), fileName(file.name, '2dope'));
      this.toast('Saved a .2dope file to your downloads.', [], 4000);
    } catch (e) {
      this.toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async exportJson(): Promise<void> {
    try {
      const settled = await captureProject(this.app.project).settle();
      download(new Blob([stringifyProjectFile(settled.file)], { type: 'application/json' }), fileName(this.app.project.name, 'json'));
    } catch (e) {
      this.toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Keep the current work as a restore point before it is replaced. Skips an untouched project. */
  private async keepCurrent(label: string): Promise<void> {
    if (!(await this.projectHasContent())) return;
    await this.autosaver.saveVersion(label, true);
  }

  // -------------------------------------------------------------------------------------------
  // Versions (restore points of the open project)

  private async saveNamedVersion(): Promise<void> {
    const input = this.dialog?.querySelector<HTMLInputElement>('[data-v="name"]');
    const name = input?.value.trim() || `Version ${new Date().toLocaleString()}`;
    await this.autosaver.saveVersion(name, false);
    if (input) input.value = '';
    await this.renderVersions();
  }

  private async openVersions(): Promise<void> {
    await this.renderVersions();
    this.dialog?.showModal();
  }

  private async renderVersions(): Promise<void> {
    const list = this.dialog?.querySelector<HTMLElement>('[data-v="list"]');
    const meta = this.current;
    if (!list || !meta) return;
    const versions = await this.store.listVersions(meta.id);
    list.replaceChildren();
    if (!versions.length) list.append(el('p', { class: 'hint' }, 'No versions yet. 2Dope saves one every 10 minutes while you work and before risky edits, or save your own with a name.'));
    for (const v of versions) list.append(this.versionRow(v));
  }

  private versionRow(v: VersionRecord): HTMLElement {
    const row = el('div', { class: 'vrow' });
    const info = el('div', { class: 'vinfo' });
    info.append(el('strong', {}, v.name), el('span', { class: 'hint' }, `${v.auto ? 'automatic · ' : ''}${ago(v.at)} (${new Date(v.at).toLocaleString()})`));
    const restore = el('button', { type: 'button' }, 'Restore');
    restore.addEventListener('click', () => void this.restoreVersion(v));
    const del = el('button', { type: 'button', title: 'Delete this version' }, 'Delete');
    del.addEventListener('click', async () => {
      await this.store.deleteVersion(v.id);
      await this.renderVersions();
    });
    row.append(info, restore, del);
    return row;
  }

  private async restoreVersion(v: VersionRecord): Promise<void> {
    try {
      const { project, warnings } = loadProjectFile(parseProjectFile(v.json));
      await this.keepCurrent(`Before restoring "${v.name}"`);
      this.app.loadProject(project);
      this.autosaver.markDirty();
      this.dialog?.close();
      this.toast(`Restored "${v.name}". What you had before is saved as a version.`, [], 5000);
      for (const w of warnings.slice(0, 3)) this.toast(w);
    } catch (e) {
      this.toast(`Could not restore that version: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Reminders and other tabs

  private maybeRemindBackup(): void {
    const a = this.autosaver;
    const now = Date.now();
    if (a.changes - this.lastExportChanges < BACKUP_MIN_CHANGES) return;
    if (now - this.lastExportAt < BACKUP_AFTER_MS || now - this.remindedAt < BACKUP_AFTER_MS) return;
    this.remindedAt = now;
    this.toast('It has been a while since you saved a backup file. Browsers can clear local storage, especially on shared computers.', [{ label: 'Export .2dope', run: () => void this.exportProject() }]);
  }

  /** Two tabs autosaving the same project would overwrite each other: warn when that happens. */
  private watchOtherTabs(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('2dope-tabs');
    this.tabs = ch;
    ch.onmessage = (e: MessageEvent<{ type: string; from: string; project?: string }>) => {
      if (e.data.from === this.tabId) return;
      const mine = this.current?.id;
      if (e.data.type === 'open' && mine && e.data.project === mine) {
        ch.postMessage({ type: 'here', from: this.tabId, project: mine });
        this.warnSameProject();
      } else if (e.data.type === 'here' && mine && e.data.project === mine) {
        this.warnSameProject();
      }
    };
  }

  private announceOpen(): void {
    this.tabs?.postMessage({ type: 'open', from: this.tabId, project: this.current?.id });
  }

  private warnSameProject(): void {
    this.toast('This project is also open in another 2Dope tab. Both save to the same place and will overwrite each other: close one of them, or open a different project there.');
  }
}
