import type { Capture } from './projectio';
import { assetsOf, metaFromFile, newId, unreferencedAssets, versionsToPrune, type ProjectMeta, type Store, type VersionRecord } from './persist';
import { stringifyProjectFile } from './schema';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface AutosaveOptions {
  /** Wait this long after the last change before saving. */
  debounceMs: number;
  /** But never wait longer than this while changes keep coming. */
  maxWaitMs: number;
  /** Automatic restore points: at most this often, only when something changed. */
  versionEveryMs: number;
  maxAutoVersions: number;
  gcEveryMs: number;
}

export const DEFAULTS: AutosaveOptions = {
  debounceMs: 1200,
  maxWaitMs: 5000,
  versionEveryMs: 10 * 60_000,
  maxAutoVersions: 10,
  gcEveryMs: 60_000,
};

/** What the autosaver needs from the app besides the capture. */
export interface AutosaveHooks {
  /** True while the user is mid-stroke: wait for it to end. */
  busy(): boolean;
  /** A small PNG for the gallery card, or null to keep the previous one. */
  thumb(): Promise<Uint8Array | null>;
  /** Asset keys still used by drawings in memory (e.g. deleted but undoable). Never cleaned up. */
  keep(): Set<string>;
}

const NO_HOOKS: AutosaveHooks = { busy: () => false, thumb: async () => null, keep: () => new Set() };

/**
 * Saves the open project into the library after changes, and keeps restore points.
 *
 * Crash safety: a save writes the new assets, the project card, the project and its asset list in
 * one transaction. Assets are content-addressed (immutable), so projects and versions share them
 * and nothing is ever overwritten in place. All writes run one at a time on a queue.
 */
export class Autosaver {
  state: SaveState = 'idle';
  lastSavedAt: number | null = null;
  error: string | null = null;
  /** Counts every change; the UI uses it to decide whether a backup is overdue. */
  changes = 0;
  onStatus: () => void = () => {};
  /** The open project's library card. Set with `open()`. */
  meta: ProjectMeta | null = null;

  private queue: Promise<void> = Promise.resolve();
  private timer: unknown = null;
  private firstDirtyAt = 0;
  private savedChanges = 0;
  private versionChanges = 0;
  private lastVersionAt: number;
  private lastGcAt = 0;
  private versionTimer: unknown = null;

  constructor(
    private readonly store: Store,
    private readonly capture: () => Capture,
    private readonly hooks: AutosaveHooks = NO_HOOKS,
    private readonly opt: AutosaveOptions = DEFAULTS,
    private readonly clock: Clock = realClock,
  ) {
    this.lastVersionAt = clock.now();
  }

  /**
   * Switch to another project. Call after flushing the previous one. `saved` = the project is
   * already stored as it is now (opened from the library), so nothing needs saving yet.
   */
  open(meta: ProjectMeta, saved: boolean): void {
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.meta = meta;
    this.savedChanges = saved ? this.changes : -1;
    this.versionChanges = this.changes;
    this.lastVersionAt = this.clock.now();
    this.lastSavedAt = saved ? meta.modified : null;
    this.set(saved ? 'saved' : 'dirty');
    if (!saved) this.markDirty();
  }

  /** Begin the periodic restore-point timer. */
  start(): void {
    const tick = () => {
      this.versionTimer = this.clock.setTimeout(() => {
        void this.maybeAutoVersion();
        tick();
      }, 60_000);
    };
    tick();
  }

  stop(): void {
    if (this.timer) this.clock.clearTimeout(this.timer);
    if (this.versionTimer) this.clock.clearTimeout(this.versionTimer);
    this.timer = this.versionTimer = null;
  }

  private set(state: SaveState, error: string | null = null): void {
    this.state = state;
    this.error = error;
    this.onStatus();
  }

  /** Call after any change to the project. */
  markDirty(): void {
    this.changes += 1;
    if (this.state !== 'saving') this.set('dirty');
    const now = this.clock.now();
    if (!this.timer) this.firstDirtyAt = now;
    if (this.timer) this.clock.clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.opt.debounceMs, this.firstDirtyAt + this.opt.maxWaitMs - now));
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (this.hooks.busy()) {
        // mid-stroke: try again shortly rather than encoding while the pen is down
        this.markDirty();
        this.changes -= 1;
        return;
      }
      void this.flush();
    }, wait);
  }

  /** Save now (also used before the tab hides or another project opens). */
  flush(): Promise<void> {
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    const meta = this.meta;
    if (!meta) return this.queue;
    return this.enqueue(async () => {
      if (this.savedChanges === this.changes) return;
      const at = this.changes;
      this.set('saving');
      try {
        const settled = await this.capture().settle();
        const json = stringifyProjectFile(settled.file);
        const now = this.clock.now();
        const thumb = (await this.hooks.thumb().catch(() => null)) ?? meta.thumb;
        // the card may have been renamed or moved meanwhile: keep those fields from the live card
        const live = this.meta?.id === meta.id ? this.meta : meta;
        const card = metaFromFile(meta.id, settled.file, { folder: live.folder, created: live.created, opened: live.opened, modified: now, thumb });
        await this.store.saveHead(card, { id: meta.id, json, savedAt: now }, settled.assets, [...assetsOf(settled.file)]);
        settled.commit();
        if (this.meta?.id === meta.id) this.meta = card;
        this.savedChanges = at;
        this.lastSavedAt = now;
        this.set(this.changes === at ? 'saved' : 'dirty');
        if (this.changes !== at) this.markDirty();
        await this.maybeGc();
      } catch (e) {
        this.set('error', e instanceof Error ? e.message : String(e));
        // try again in a while; a full disk may have been freed
        this.timer = this.clock.setTimeout(() => {
          this.timer = null;
          void this.flush();
        }, 15_000);
      }
    });
  }

  /**
   * Save a restore point of the open project. The project is captured immediately (before this
   * returns), so calling it right before a destructive edit stores the state from before that edit.
   */
  saveVersion(name: string, auto: boolean): Promise<VersionRecord | null> {
    const meta = this.meta;
    if (!meta) return Promise.resolve(null);
    const cap = this.capture();
    const at = this.clock.now();
    const changesNow = this.changes;
    return new Promise((resolve) => {
      void this.enqueue(async () => {
        try {
          const settled = await cap.settle();
          const json = stringifyProjectFile(settled.file);
          const rec: VersionRecord = { id: newId('v'), project: meta.id, name, auto, at, json };
          await this.store.putVersion(rec, settled.assets, [...assetsOf(settled.file)]);
          settled.commit();
          this.lastVersionAt = at;
          this.versionChanges = changesNow;
          for (const id of versionsToPrune(await this.store.listVersions(meta.id), this.opt.maxAutoVersions)) await this.store.deleteVersion(id);
          resolve(rec);
        } catch (e) {
          this.set('error', e instanceof Error ? e.message : String(e));
          resolve(null);
        }
      });
    });
  }

  /** Called by the timer: an automatic restore point if enough time passed and something changed. */
  async maybeAutoVersion(): Promise<void> {
    if (this.changes === this.versionChanges) return;
    if (this.clock.now() - this.lastVersionAt < this.opt.versionEveryMs) return;
    if (this.hooks.busy()) return;
    await this.saveVersion('Automatic', true);
  }

  /** Wait for queued writes (tests, and "save then switch"). */
  idle(): Promise<void> {
    return this.queue;
  }

  /** Run something after every queued write (e.g. delete a project only once it stopped saving). */
  then(op: () => Promise<void>): Promise<void> {
    return this.enqueue(op);
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => {});
    return next;
  }

  private async maybeGc(): Promise<void> {
    const now = this.clock.now();
    if (now - this.lastGcAt < this.opt.gcEveryMs) return;
    this.lastGcAt = now;
    const dead = unreferencedAssets(await this.store.assetKeys(), await this.store.referencedAssets(), this.hooks.keep());
    await this.store.deleteAssets(dead);
  }
}
