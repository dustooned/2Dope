import type { Capture } from './projectio';
import { unreferencedAssets, versionsToPrune, type Store, type VersionRecord } from './persist';
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

/**
 * Saves the project to local storage after changes and keeps restore points.
 *
 * Crash safety: new assets are written first, then the project record that refers to them, so a
 * crash mid-save leaves the previous complete save intact. Assets are content-addressed
 * (immutable), so autosave and versions share them and nothing is ever overwritten in place.
 * All writes run one at a time on a queue.
 */
export class Autosaver {
  state: SaveState = 'idle';
  lastSavedAt: number | null = null;
  error: string | null = null;
  /** Counts every change; the UI uses it to decide whether a backup is overdue. */
  changes = 0;
  onStatus: () => void = () => {};

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
    /** True while the user is mid-stroke: wait for it to end. */
    private readonly busy: () => boolean = () => false,
    private readonly opt: AutosaveOptions = DEFAULTS,
    private readonly clock: Clock = realClock,
  ) {
    this.lastVersionAt = clock.now();
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
      if (this.busy()) {
        // mid-stroke: try again shortly rather than encoding while the pen is down
        this.markDirty();
        this.changes -= 1;
        return;
      }
      void this.flush();
    }, wait);
  }

  /** Save now (also used before the tab hides). Resolves when the write finished or failed. */
  flush(): Promise<void> {
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    return this.enqueue(async () => {
      if (this.savedChanges === this.changes && this.lastSavedAt !== null) return;
      const at = this.changes;
      this.set('saving');
      try {
        const settled = await this.capture().settle();
        const json = stringifyProjectFile(settled.file);
        await this.store.putAssets(settled.assets);
        await this.store.putAutosave({ json, savedAt: this.clock.now() });
        settled.commit();
        this.savedChanges = at;
        this.lastSavedAt = this.clock.now();
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
   * Save a restore point. The project is captured immediately (before this returns), so calling
   * it right before a destructive edit stores the state from before that edit.
   */
  saveVersion(name: string, auto: boolean): Promise<VersionRecord | null> {
    const cap = this.capture();
    const at = this.clock.now();
    const changesNow = this.changes;
    return new Promise((resolve) => {
      void this.enqueue(async () => {
        try {
          const settled = await cap.settle();
          const json = stringifyProjectFile(settled.file);
          await this.store.putAssets(settled.assets);
          const rec: VersionRecord = { id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, auto, at, json };
          await this.store.putVersion(rec);
          settled.commit();
          this.lastVersionAt = at;
          this.versionChanges = changesNow;
          for (const id of versionsToPrune(await this.store.listVersions(), this.opt.maxAutoVersions)) await this.store.deleteVersion(id);
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
    if (this.busy()) return;
    await this.saveVersion('Automatic', true);
  }

  /** Wait for queued writes (tests, and "save then close"). */
  idle(): Promise<void> {
    return this.queue;
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
    const dead = unreferencedAssets(await this.store.assetKeys(), await this.store.getAutosave(), await this.store.listVersions());
    await this.store.deleteAssets(dead);
  }
}
