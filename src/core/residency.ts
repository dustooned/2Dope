import type { Drawing, PlaneRef, Project } from './project';

/**
 * Keeps memory flat however long the shot is.
 *
 * A 1920×1080 plane is 8.3 MB of canvas memory, so sixty drawings with fills used ~1 GB and an
 * iPad would reload the tab long before that. Instead, only the drawings that matter right now
 * keep live canvases: the current one, the onion-skin neighbours, the next few during playback,
 * and whatever was used most recently within a memory budget. The rest are **parked**: their
 * pixels are compressed to PNG (or point at the asset autosave already stored) and their
 * canvases shrink to 0×0, which hands the memory back to the browser.
 *
 * A parked drawing comes back with `ensure()` before anything reads or writes its pixels. Canvas
 * objects are kept (only resized), so undo commands that captured them stay valid.
 */

/** The canvas operations residency needs (injected so the logic can be tested without a browser). */
export interface PlaneOps {
  isBlank(c: HTMLCanvasElement): boolean;
  /** PNG bytes; the pixels are snapshotted when called. */
  encode(c: HTMLCanvasElement): Promise<Uint8Array>;
  decodeInto(c: HTMLCanvasElement, bytes: Uint8Array): Promise<void>;
  /** Resize (which also clears) a canvas. 0×0 frees its memory. */
  resize(c: HTMLCanvasElement, w: number, h: number): void;
  newCanvas(w: number, h: number): HTMLCanvasElement;
  /** Draw a small preview of a resident drawing, reusing `into` when given. */
  thumb(d: Drawing, into: HTMLCanvasElement | null): HTMLCanvasElement;
  /** Run soon, after the current work (lets the UI breathe between heavy steps). */
  defer(fn: () => void): void;
}

export type AssetSource = (key: string) => Promise<Uint8Array | null>;

/** A memory budget for live drawing canvases that suits the device. */
export function defaultBudget(): number {
  const MB = 1024 * 1024;
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { deviceMemory?: number });
  const ios = !!nav && (/iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1));
  if (ios) return 200 * MB;
  const mem = nav?.deviceMemory;
  if (mem !== undefined && mem <= 4) return 300 * MB;
  return 900 * MB;
}

/** Bytes of canvas memory a resident drawing holds. */
export function residentBytes(d: Drawing): number {
  if (d.parked) return 0;
  const plane = (c: HTMLCanvasElement | null) => (c ? c.width * c.height * 4 : 0);
  return plane(d.line) + plane(d.fill);
}

/**
 * Record where autosave stored a drawing's planes. A parked drawing holding PNG bytes in memory
 * swaps them for the stored keys, so its memory drops to almost nothing.
 */
export function recordSaved(d: Drawing, rev: number, line: string | null, fill: string | null): void {
  d.saved = { rev, line, fill };
  const p = d.parked;
  if (!p || p.rev !== rev) return;
  if (p.line && line) p.line = { key: line, bytes: null };
  if (p.fill && fill) p.fill = { key: fill, bytes: null };
}

/** Asset keys the drawings in memory still point at (autosave's clean-up must keep these). */
export function referencedKeys(project: Project): Set<string> {
  const keys = new Set<string>();
  for (const d of project.drawings.values()) {
    if (d.saved?.line) keys.add(d.saved.line);
    if (d.saved?.fill) keys.add(d.saved.fill);
    if (d.parked?.line?.key) keys.add(d.parked.line.key);
    if (d.parked?.fill?.key) keys.add(d.parked.fill.key);
  }
  return keys;
}

export class Residency {
  /** A parked drawing came back (render it, refresh thumbnails). */
  onReady: (d: Drawing) => void = () => {};
  /** A thumbnail was (re)drawn. */
  onThumb: (d: Drawing) => void = () => {};
  /** Something could not be read; the plane was left blank. */
  onWarning: (message: string) => void = () => {};

  private project: Project | null = null;
  private wanted = new Set<Drawing>();
  /** Most recently used last. */
  private readonly recent = new Map<Drawing, true>();
  private readonly loading = new Map<Drawing, Promise<void>>();
  private readonly parking = new Set<Drawing>();
  private readonly pins = new Map<Drawing, number>();
  private readonly thumbQueue: Drawing[] = [];
  private pumpScheduled = false;
  private pumping = false;
  private thumbing = false;

  constructor(
    private readonly ops: PlaneOps,
    private readonly source: AssetSource,
    public budget: number = defaultBudget(),
  ) {}

  /** Start managing a (new) project. Forgets everything about the previous one. */
  setProject(p: Project): void {
    const old = this.project;
    if (old && old !== p) {
      // The old project is closed (and saved): hand its canvas memory back now, not at the next GC.
      for (const d of old.drawings.values()) {
        this.ops.resize(d.line, 0, 0);
        if (d.fill) this.ops.resize(d.fill, 0, 0);
      }
    }
    this.project = p;
    this.pins.clear();
    this.wanted = new Set();
    this.recent.clear();
    this.thumbQueue.length = 0;
    // Missing thumbnails get drawn in the background, oldest work first.
    for (const d of p.drawings.values()) if (d.thumbRev !== d.rev) this.thumbQueue.push(d);
    this.schedule();
  }

  isReady(d: Drawing): boolean {
    return d.parked === null;
  }

  /**
   * The drawings that must stay live now, most important first (current, onion neighbours,
   * playback look-ahead). Parked ones among them start loading.
   */
  use(ds: Drawing[]): void {
    this.wanted = new Set(ds);
    for (let i = ds.length - 1; i >= 0; i--) this.touch(ds[i]!);
    for (const d of ds) if (d.parked) void this.ensure(d);
    this.schedule();
  }

  /**
   * Bring a drawing back and keep it live until `unpin` (export, scripted work). Pins nest.
   * Resolves once its pixels are live.
   */
  async pin(d: Drawing): Promise<void> {
    this.pins.set(d, (this.pins.get(d) ?? 0) + 1);
    await this.ensure(d);
  }

  unpin(d: Drawing): void {
    const n = (this.pins.get(d) ?? 0) - 1;
    if (n > 0) this.pins.set(d, n);
    else this.pins.delete(d);
    this.schedule();
  }

  /** Mark a drawing as just used (it will be parked last). */
  touch(d: Drawing): void {
    this.recent.delete(d);
    this.recent.set(d, true);
  }

  /** Bring a drawing's pixels back. Resolves at once if they are already live. */
  ensure(d: Drawing): Promise<void> {
    if (!d.parked) return Promise.resolve();
    const busy = this.loading.get(d);
    if (busy) return busy;
    const job = this.load(d).finally(() => this.loading.delete(d));
    this.loading.set(d, job);
    return job;
  }

  /** Total canvas memory held by live drawings. */
  liveBytes(): number {
    let n = 0;
    if (this.project) for (const d of this.project.drawings.values()) n += residentBytes(d);
    return n;
  }

  /** Park drawings until the live set fits the budget (runs in the background). */
  schedule(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    this.ops.defer(() => {
      this.pumpScheduled = false;
      void this.pump();
      void this.drainThumbs();
    });
  }

  /** Wait until background parking is done (tests). */
  async settle(): Promise<void> {
    for (let i = 0; i < 1000; i++) {
      if (!this.pumping && !this.thumbing && !this.pumpScheduled && !this.loading.size && !this.parking.size) return;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // -------------------------------------------------------------------------------------------

  private async load(d: Drawing): Promise<void> {
    const p = d.parked;
    const proj = this.project;
    if (!p || !proj) return;
    const read = async (ref: PlaneRef | null, what: string): Promise<Uint8Array | null> => {
      if (!ref) return null;
      try {
        const bytes = ref.bytes ?? (ref.key ? await this.source(ref.key) : null);
        if (!bytes) this.onWarning(`Drawing ${d.num}: the ${what} image is missing, so it was left blank.`);
        return bytes;
      } catch {
        this.onWarning(`Drawing ${d.num}: the ${what} image could not be read, so it was left blank.`);
        return null;
      }
    };
    const [line, fill] = await Promise.all([read(p.line, 'line'), read(p.fill, 'fill')]);
    if (d.parked !== p) return; // someone else finished first
    this.ops.resize(d.line, proj.width, proj.height);
    if (line) await this.decode(d, d.line, line, 'line');
    if (p.fill || d.fill) {
      d.fill ??= this.ops.newCanvas(proj.width, proj.height);
      this.ops.resize(d.fill, proj.width, proj.height);
      if (fill) await this.decode(d, d.fill, fill, 'fill');
    }
    d.parked = null;
    // What we just decoded is exactly what is stored, so the next save can skip it.
    if (!d.saved || d.saved.rev !== d.rev) {
      const k = (r: PlaneRef | null) => r?.key ?? null;
      if ((!p.line || p.line.key) && (!p.fill || p.fill.key)) d.saved = { rev: d.rev, line: k(p.line), fill: k(p.fill) };
    }
    this.refreshThumb(d);
    this.onReady(d);
    this.schedule();
  }

  private async decode(d: Drawing, c: HTMLCanvasElement, bytes: Uint8Array, what: string): Promise<void> {
    try {
      await this.ops.decodeInto(c, bytes);
    } catch {
      this.onWarning(`Drawing ${d.num}: the ${what} image could not be read, so it was left blank.`);
    }
  }

  private refreshThumb(d: Drawing): void {
    if (d.parked || d.thumbRev === d.rev) return;
    d.thumb = this.ops.thumb(d, d.thumb);
    d.thumbRev = d.rev;
    this.onThumb(d);
  }

  /** Redraw a live drawing's thumbnail if it changed (call after edits settle). */
  updateThumb(d: Drawing): void {
    this.refreshThumb(d);
  }

  private canPark(d: Drawing): boolean {
    return !d.parked && !this.wanted.has(d) && !this.pins.has(d) && !this.loading.has(d) && !this.parking.has(d);
  }

  private async pump(): Promise<void> {
    const proj = this.project;
    if (this.pumping || !proj) return;
    this.pumping = true;
    try {
      // Drawings no longer in the project's map are gone for good.
      for (const d of this.recent.keys()) if (!proj.drawings.has(d.id)) this.recent.delete(d);
      // A drawing that changed while it was being compressed is skipped this round.
      const skipped = new Set<Drawing>();
      while (this.liveBytes() > this.budget) {
        // Least recently used first; drawings never touched this session count as oldest.
        const order = [...proj.drawings.values()].filter((d) => !this.recent.has(d)).concat([...this.recent.keys()]);
        const victim = order.find((d) => !skipped.has(d) && this.canPark(d));
        if (!victim) break;
        const ok = await this.park(victim);
        if (this.project !== proj) return;
        if (!ok) skipped.add(victim);
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Compress a drawing and free its canvases. False if it changed or became needed meanwhile. */
  private async park(d: Drawing): Promise<boolean> {
    this.parking.add(d);
    try {
      const rev = d.rev;
      this.refreshThumb(d);
      const saved = d.saved && d.saved.rev === rev ? d.saved : null;
      const plane = async (c: HTMLCanvasElement | null, key: string | null | undefined): Promise<PlaneRef | null> => {
        if (!c) return null;
        if (saved) return key ? { key, bytes: null } : null;
        if (this.ops.isBlank(c)) return null;
        return { key: null, bytes: await this.ops.encode(c) };
      };
      const [line, fill] = await Promise.all([plane(d.line, saved?.line), plane(d.fill, saved?.fill)]);
      this.parking.delete(d);
      if (d.rev !== rev || !this.canPark(d)) return false;
      d.parked = { rev, line, fill };
      this.ops.resize(d.line, 0, 0);
      if (d.fill) this.ops.resize(d.fill, 0, 0);
      return true;
    } finally {
      this.parking.delete(d);
    }
  }

  /** Give every drawing a thumbnail, one at a time, parking each again afterwards. */
  private async drainThumbs(): Promise<void> {
    if (this.thumbing) return;
    this.thumbing = true;
    try {
      while (this.thumbQueue.length) {
        const d = this.thumbQueue.shift()!;
        const proj = this.project;
        if (!proj || !proj.drawings.has(d.id) || d.thumbRev === d.rev) continue;
        if (d.parked) await this.ensure(d);
        else this.refreshThumb(d);
        if (this.project !== proj) return;
        // keep memory flat while working through a long shot
        if (this.liveBytes() > this.budget) await this.pump();
      }
    } finally {
      this.thumbing = false;
    }
  }
}
