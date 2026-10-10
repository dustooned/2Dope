import type { App } from '../app';
import { Project } from '../core/project';
import { Autosaver } from '../io/autosave';
import { hasContent, requestPersistence, storageEstimate, type Store, type VersionRecord } from '../io/persist';
import { captureProject, loadProjectFile, type PlaneCache } from '../io/projectio';
import { parseProjectFile, SchemaError, stringifyProjectFile, type ProjectFile } from '../io/schema';
import { readZip, writeZip, ZipError } from '../io/zip';

const BACKUP_AFTER_MS = 30 * 60_000;
const BACKUP_MIN_CHANGES = 15;
const RISKY_VERSION_GAP_MS = 30_000;

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

/** Save/open, autosave status, versions, recovery and backup prompts. */
export class FileUI {
  readonly autosaver: Autosaver;
  private readonly cache: PlaneCache = new WeakMap();
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

  constructor(
    private readonly app: App,
    private readonly store: Store,
    private readonly durable: boolean,
  ) {
    this.autosaver = new Autosaver(
      store,
      () => captureProject(app.project, this.cache),
      () => app.strokeActive,
    );
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

  // -------------------------------------------------------------------------------------------

  private bind(): void {
    const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
    q('[data-file="save"]')?.addEventListener('click', () => void this.exportProject());
    q('[data-file="new"]')?.addEventListener('click', () => void this.newProject());
    q('[data-file="versions"]')?.addEventListener('click', () => void this.openVersions());
    const input = q<HTMLInputElement>('#openfile');
    q('[data-file="open"]')?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (f) void this.openFile(f);
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
            ? `Could not autosave: ${a.error ?? 'unknown error'}`
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
    el.textContent = e ? `${bytes(e.used)} of ${bytes(e.quota)}` : '';
    el.title = `Local storage: ${where}. Export a .2dope file for a backup you control.`;
    el.dataset.risk = this.durable && this.persisted ? 'ok' : 'warn';
  }

  // -------------------------------------------------------------------------------------------
  // Export / open

  /** Build the files of a .2dope archive (everything re-encoded, so it never depends on local storage). */
  private async buildArchive(): Promise<{ file: ProjectFile; zip: Uint8Array }> {
    const settled = await captureProject(this.app.project, null).settle();
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

  private async exportJson(): Promise<void> {
    try {
      const settled = await captureProject(this.app.project, null).settle();
      download(new Blob([stringifyProjectFile(settled.file)], { type: 'application/json' }), fileName(this.app.project.name, 'json'));
    } catch (e) {
      this.toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async openFile(f: File): Promise<void> {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let file: ProjectFile;
      let getAsset: (p: string) => Promise<Uint8Array | null>;
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        const zip = await readZip(buf);
        const json = zip.get('project.json');
        if (!json) throw new SchemaError('this zip has no project.json, so it is not a 2Dope project');
        file = parseProjectFile(new TextDecoder().decode(json));
        getAsset = async (p) => zip.get(p) ?? null;
      } else {
        file = parseProjectFile(new TextDecoder().decode(buf));
        getAsset = async () => null;
      }
      const { project, warnings } = await loadProjectFile(file, getAsset);
      await this.keepCurrent(`Before opening ${f.name}`);
      this.app.loadProject(project);
      this.toast(`Opened ${f.name}.`, [], 4000);
      for (const w of warnings.slice(0, 3)) this.toast(w);
    } catch (e) {
      const why = e instanceof SchemaError || e instanceof ZipError ? e.message : e instanceof Error ? e.message : String(e);
      this.toast(`Could not open ${f.name}: ${why}`);
    }
  }

  /** Keep the current work as a restore point before it is replaced. Skips an untouched project. */
  private async keepCurrent(label: string): Promise<void> {
    const cap = captureProject(this.app.project, this.cache);
    const settled = await cap.settle();
    if (!hasContent(settled.file)) return;
    await this.autosaver.saveVersion(label, true);
  }

  async newProject(): Promise<void> {
    if (!window.confirm('Start a new project? Your current one is kept under Versions.')) return;
    await this.keepCurrent('Before new project');
    this.app.loadProject(new Project(this.app.docW, this.app.docH));
  }

  // -------------------------------------------------------------------------------------------
  // Versions

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
    if (!list) return;
    const versions = await this.store.listVersions();
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
      const file = parseProjectFile(v.json);
      const { project, warnings } = await loadProjectFile(file, (p) => this.store.getAsset(p));
      await this.keepCurrent(`Before restoring "${v.name}"`);
      this.app.loadProject(project);
      this.dialog?.close();
      this.toast(`Restored "${v.name}". What you had before is saved as a version.`, [], 5000);
      for (const w of warnings.slice(0, 3)) this.toast(w);
    } catch (e) {
      this.toast(`Could not restore that version: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Recovery and reminders

  /** On startup: offer to bring back the last autosave if it has real work in it. */
  async offerRecovery(): Promise<void> {
    try {
      const rec = await this.store.getAutosave();
      if (!rec) return;
      const file = parseProjectFile(rec.json);
      if (!hasContent(file)) return;
      this.toast(
        `Restore your last session? (“${file.name}”, saved ${ago(rec.savedAt)})`,
        [
          {
            label: 'Restore',
            run: async () => {
              try {
                const { project, warnings } = await loadProjectFile(file, (p) => this.store.getAsset(p));
                this.app.loadProject(project);
                this.autosaver.markDirty();
                for (const w of warnings.slice(0, 3)) this.toast(w);
              } catch (e) {
                this.toast(`Could not restore: ${e instanceof Error ? e.message : String(e)}`);
              }
            },
          },
          {
            label: 'Start fresh',
            run: async () => {
              // not lost: kept as a version before the next autosave replaces it
              await this.store.putVersion({ id: `prev-${rec.savedAt}`, name: `Previous session (${file.name})`, auto: true, at: rec.savedAt, json: rec.json });
            },
          },
        ],
      );
    } catch (e) {
      this.toast(`The last session could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private maybeRemindBackup(): void {
    const a = this.autosaver;
    const now = Date.now();
    if (a.changes - this.lastExportChanges < BACKUP_MIN_CHANGES) return;
    if (now - this.lastExportAt < BACKUP_AFTER_MS || now - this.remindedAt < BACKUP_AFTER_MS) return;
    this.remindedAt = now;
    this.toast('It has been a while since you saved a backup file. Browsers can clear local storage, especially on shared computers.', [{ label: 'Save .2dope', run: () => void this.exportProject() }, ]);
  }

  /** Two tabs autosaving into the same slot would overwrite each other: warn the second one. */
  private watchOtherTabs(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('2dope-tabs');
    const me = Math.random().toString(36).slice(2);
    ch.onmessage = (e: MessageEvent<{ type: string; from: string }>) => {
      if (e.data.from === me) return;
      if (e.data.type === 'hello') ch.postMessage({ type: 'here', from: me });
      else if (e.data.type === 'here') this.toast('2Dope is already open in another tab. Both tabs autosave to the same place and will overwrite each other: close one of them.');
    };
    ch.postMessage({ type: 'hello', from: me });
  }
}
