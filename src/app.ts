import { cloneBrush, PRESETS, type BrushSettings } from './core/brush';
import { History } from './core/history';
import { newSeed } from './core/rng';
import { newStrokeId, strokeLength, type StrokePoint, type StrokeRecord, type Tool } from './core/stroke';
import { DabWalker } from './brush/dabs';
import { makeCanvas, putPixels, RasterEngine } from './brush/raster';
import { paintDrawing, planeCanvas, Project, type Drawing, type Plane, type Role } from './core/project';
import { Residency, type AssetSource } from './core/residency';
import { domPlaneOps } from './view/planeops';
import { brushMask, DEFAULT_FILL, fillFrom, lassoFill, leftoverHoles, polygonMask, prepareFill, type Area, type FillMap, type FillOptions } from './fill/fill';
import { currentProfile, type Profile } from './core/device';
import { editPoint, rippleComp, shiftLater } from './core/ripple';
import { durationLabel, frameLabel, type FrameFormat } from './core/timecode';
import { compLength, drawingsLayer, frameContent, invert, partOf, worldMatrix, type Comp, type DrawingsLayer, type Layer, type PartName } from './core/comp';
import { valueAt } from './core/anim';
import { HOLD_MS, HOLD_SLOP, showContextMenu, swallowNextClick, type CtxItem } from './ui/contextmenu';
import { CompEditor } from './compedit';
import { drawComp, drawLayersAround } from './view/composite';
import { drawMotionOverlay } from './view/overlay';
import {
  addAfter,
  adjustHolds,
  drawingAt,
  duplicateAt,
  duplicateBlock,
  exposeAt,
  insertAt,
  moveBlock,
  setNote,
  locate,
  neighborDrawings,
  nextDrawing,
  prevDrawing,
  removeAt,
  removeIndices,
  setHolds,
  shiftBlock,
  setCaption,
  startOf,
  type CaptionField,
  totalFrames,
  type Edit,
  type Exposure,
} from './core/timeline';
import { Smoother, smoothStroke } from './brush/smoothing';
import { eraseVectors, type VectorErase } from './core/vectorcut';
import { drawVectorStroke } from './brush/vector';
import { DEFAULT_ONION, OnionCache, type OnionSettings } from './view/onion';
import { snapRotation, Viewport } from './view/viewport';

const BRUSH_KEY = '2dope.m0.brush';
const COLOR_KEY = '2dope.m0.color';
const ONION_KEY = '2dope.m1.onion';
const FILL_KEY = '2dope.m1.fill';
const FLIPBOOK_KEY = '2dope.flipbook';
const FILL_MODE_KEY = '2dope.fill.mode';
const LAYERS_KEY = '2dope.draw.layers';
const BOARD_ALPHA_KEY = '2dope.draw.boardAlpha';
const RIPPLE_KEY = '2dope.ripple';
/** Shared with the X-sheet's frame-number setting (it was there first). */
const TIME_FORMAT_KEY = '2dope.m1.framefmt';
const LAYERS_ALPHA_KEY = '2dope.draw.layersAlpha';
const VECTOR_ERASE_KEY = '2dope.eraser.vector';
const FILL_ACROSS_KEY = '2dope.fill.across';

/** Fill tool: tap or drag across areas, lasso around areas, or scrub up leftovers. */
export type FillMode = 'tap' | 'lasso' | 'leftover';

/** An inclusive pixel box (x1 < 0 = empty). */
interface Box4 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const emptyBox = (): Box4 => ({ x0: Infinity, y0: Infinity, x1: -1, y1: -1 });
function grow4(b: Box4, r: Box4): void {
  b.x0 = Math.min(b.x0, r.x0);
  b.y0 = Math.min(b.y0, r.y0);
  b.x1 = Math.max(b.x1, r.x1);
  b.y1 = Math.max(b.y1, r.y1);
}

/** One drawing's part of a fill's undo step. */
interface FillEntry {
  d: Drawing;
  target: HTMLCanvasElement;
  rect: { x: number; y: number; w: number; h: number };
  before: ImageData;
  after: ImageData;
}

interface LiveStroke {
  record: StrokeRecord;
  /** The drawing being painted (fixed for the whole stroke). */
  drawing: Drawing;
  /** The plane canvas being painted, and which plane it is. */
  canvas: HTMLCanvasElement;
  plane: Plane;
  pointerId: number;
  t0: number;
  smoother: Smoother;
  walker: DabWalker;
  lastRaw: StrokePoint;
  predicted: StrokePoint[];
}

interface TouchInfo {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

interface PinchState {
  a: number;
  b: number;
  startDist: number;
  startAng: number;
  startZoom: number;
  startRot: number;
  anchor: DOMPoint;
}

type NavMode = 'pan' | 'rotate' | 'zoom';

interface NavDrag {
  mode: NavMode;
  pointerId: number;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  startRot: number;
  startAng: number;
}

export interface InputStats {
  pointerType: string;
  pressure: number;
  tilt: number;
  hz: number;
  coalesced: number;
}

/** Draw: the canvas and flipbook strip. Time: the X-sheet. Motion: layers, keys and the comp's result. */
export type Workspace = 'board' | 'draw' | 'time' | 'motion';

export class App {
  project = new Project(1920, 1080);
  workspace: Workspace = 'draw';
  /** Edits to layers and keys (the Motion workspace). */
  readonly editor = new CompEditor(this);
  onWorkspaceChange: () => void = () => {};
  private motionPointer: number | null = null;
  readonly raster = new RasterEngine(1920, 1080);
  /** What the canvas shows, in pixels: the comp in Motion, the drawing page otherwise. */
  get docW(): number {
    return this.workspace === 'motion' ? this.project.comp.width : this.project.width;
  }

  get docH(): number {
    return this.workspace === 'motion' ? this.project.comp.height : this.project.height;
  }

  /** UI hook: a different comp is open (entered or left a precomp). */
  onCompChanged: () => void = () => {};

  /** Called by the editor after it opened another comp. */
  onCompChange(): void {
    this.selection = [];
    this.lockFrame = null;
    this.onionCache.clear();
    if (this.workspace === 'motion') this.fit();
    this.onCompChanged();
  }

  /** Switch workspace (Draw / Time / Motion): the same project, a different arrangement. */
  setWorkspace(w: Workspace): void {
    if (w === this.workspace || this.live) return;
    if (this.playing) this.togglePlay();
    if (w === 'motion') this.leaveBlankPage();
    this.editor.gestureEnd(true);
    const was = this.workspace;
    this.workspace = w;
    if (w === 'board') this.enterBoard();
    else if (was === 'board') this.leaveBoard();
    // Draw and Time look at the same page; Motion looks at the comp
    if ((was === 'motion') !== (w === 'motion')) this.fit();
    this.requestRender();
    this.onFrameChange();
    this.onWorkspaceChange();
  }

  /** Current frame, 0-based. */
  frame = 0;
  playing = false;
  /** Selected exposures (indices into the timeline); empty means "the current drawing". */
  selection: number[] = [];
  /** Onion skin settings (saved per device). */
  onion: OnionSettings = { ...DEFAULT_ONION, ...(loadJSON<Partial<OnionSettings>>(ONION_KEY) ?? {}) };
  /** Scrub lock: the home frame to snap back to after flipping, or null. */
  lockFrame: number | null = null;
  /** True while the user is scrubbing or flipping (strip drag, Shift+arrows). */
  scrubbing = false;
  /** Fires when the frame or the timeline changes. */
  onFrameChange: () => void = () => {};
  /** Fires when the document itself changed (drawing, timeline, fps): autosave listens. */
  onDocChanged: () => void = () => {};
  /** Fires right before a destructive edit, while the old state is still intact. */
  onRisky: (label: string) => void = () => {};
  /** Fires when a stroke starts or ends (Quick Animate hides its controls while drawing). */
  onStrokeState: (active: boolean) => void = () => {};
  /** Keyboard hooks owned by the layout: Quick Animate (Tab) and the X-sheet (Shift+X). */
  onToggleQuick: () => void = () => {};
  onToggleXSheet: () => void = () => {};
  /** Fires after a different project replaced the current one. */
  onProjectLoaded: () => void = () => {};
  /** What this device can take (phone / weak tablet → Lite). Read once at start; see core/device.ts. */
  readonly device: Profile = currentProfile();
  readonly history = new History(this.device.limits.undoDepth);
  readonly view = new Viewport();
  /** Where parked drawings' stored images are read from (the library sets this). */
  assets: AssetSource = async () => null;
  /** Keeps only the drawings that matter in memory (see core/residency.ts). */
  readonly residency = new Residency(domPlaneOps, (k) => this.assets(k), this.device.limits.budget);
  /** Fires when timeline thumbnails changed (a parked drawing came back or was redrawn). */
  onThumbs: () => void = () => {};

  brush: BrushSettings;
  color: string;
  tool: Tool = 'brush';
  /** Which pixel plane brushes and the eraser write to. Fill always sits under line. */
  plane: Plane = 'line';
  fillOptions: FillOptions = { ...DEFAULT_FILL, ...(loadJSON<Partial<FillOptions>>(FILL_KEY) ?? {}) };
  fingerPaint = false;
  uiHidden = false;

  readonly stats: InputStats = { pointerType: '-', pressure: 0, tilt: 0, hz: 0, coalesced: 1 };
  onStats: () => void = () => {};
  onToolChange: () => void = () => {};
  onBrushChange: () => void = () => {};

  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private fitted = false;
  private needsRender = true;
  private live: LiveStroke | null = null;
  private readonly touches = new Map<number, TouchInfo>();
  private pinch: PinchState | null = null;
  private tapSession: { start: number; maxTouches: number; moved: boolean } | null = null;
  private nav: NavDrag | null = null;
  private readonly held = new Set<string>();
  private readonly lengthCache = new WeakMap<StrokeRecord, number>();
  private moveCount = 0;
  private coalescedCount = 0;
  private statsWindow = performance.now();
  private playClock = { t0: 0, f0: 0 };
  private spacePanned = false;
  private fillScratch: HTMLCanvasElement | null = null;
  private readonly onionCache = new OnionCache(1920, 1080);
  private thumbsChanged = false;
  /** Undo/redo wait for parked drawings to come back; this keeps them in order. */
  private historyChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stage: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.clampOnion();
    // Merge over the default so brushes saved by older builds gain new fields.
    this.brush = { ...cloneBrush(PRESETS[0]!), ...(loadJSON<Partial<BrushSettings>>(BRUSH_KEY) ?? {}) };
    this.color = loadJSON<string>(COLOR_KEY) ?? '#1d1d24';
    this.bindEvents();
    this.resize();
    this.residency.onReady = () => this.requestRender();
    this.residency.onThumb = () => (this.thumbsChanged = true);
    this.residency.setProject(this.project);
    const loop = (now: number) => {
      if (this.playing) this.tickPlayback(now);
      if (this.needsRender) this.render();
      if (this.thumbsChanged) {
        this.thumbsChanged = false;
        this.onThumbs();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** True while a stroke is being drawn (autosave waits for it to end). */
  get strokeActive(): boolean {
    return this.live !== null;
  }

  get viewW(): number {
    return this.stage.clientWidth;
  }

  get viewH(): number {
    return this.stage.clientHeight;
  }

  requestRender(): void {
    this.needsRender = true;
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.onToolChange();
  }

  setPlane(p: Plane): void {
    this.plane = p;
    this.onToolChange();
  }

  togglePlane(): void {
    this.setPlane(this.plane === 'line' ? 'fill' : 'line');
  }

  fillOptionsChanged(): void {
    saveJSON(FILL_KEY, this.fillOptions);
  }

  // -------------------------------------------------------------------------------------------
  // Fill tool: tap or drag across areas, lasso around areas, or scrub up leftovers. The line art
  // is read once per drawing (a prepared map) and reused until the lines change.

  /** What the eraser does to vector lines on the Line plane: cut up to crossings, remove whole lines, or nothing. */
  vectorErase: VectorErase = loadJSON<VectorErase>(VECTOR_ERASE_KEY) ?? 'crossing';

  setVectorErase(m: VectorErase): void {
    this.vectorErase = m;
    saveJSON(VECTOR_ERASE_KEY, m);
    this.onToolChange();
  }

  /** How the fill tool works: tap / drag across areas, lasso around them, or scrub up leftovers. */
  fillMode: FillMode = loadJSON<FillMode>(FILL_MODE_KEY) ?? 'tap';
  /** Also fill the same spot on this many following drawings (0 = this drawing only). */
  fillAcross = Math.max(0, Math.min(12, loadJSON<number>(FILL_ACROSS_KEY) ?? 0));

  setFillMode(m: FillMode): void {
    this.fillMode = m;
    saveJSON(FILL_MODE_KEY, m);
    this.onToolChange();
  }

  setFillAcross(n: number): void {
    this.fillAcross = Math.max(0, Math.min(12, Math.round(n)));
    saveJSON(FILL_ACROSS_KEY, this.fillAcross);
    this.onToolChange();
  }

  private fillMapCache: { d: Drawing; rev: number; key: string; map: FillMap } | null = null;
  private fillG: {
    pointerId: number;
    d: Drawing;
    mode: FillMode;
    /** Path of the lasso / leftover brush, or the drag's last point. */
    points: [number, number][];
    /** Seeds that filled something (replayed on the following drawings). */
    seeds: [number, number][];
    /** The fill plane before the gesture (for one undo step and for cancelling). */
    before: ImageData;
    /** Pixels filled so far in this gesture (a drag does not refill them). */
    painted: Uint8Array;
    box: Box4;
  } | null = null;
  private fillBusy = false;

  /** The line art of a drawing as a fill map (line plane + vector strokes). */
  private fillMapOf(d: Drawing): FillMap {
    this.fillScratch ??= makeCanvas(this.docW, this.docH);
    const sg = this.fillScratch.getContext('2d', { willReadFrequently: true })!;
    sg.clearRect(0, 0, this.docW, this.docH);
    sg.drawImage(d.line, 0, 0);
    for (const v of d.vectors) drawVectorStroke(sg, v, this.lengthOf(v));
    const px = sg.getImageData(0, 0, this.docW, this.docH).data;
    const alpha = new Uint8Array(this.docW * this.docH);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3]!;
    return prepareFill(alpha, this.docW, this.docH, this.fillOptions);
  }

  /** The current drawing's fill map, reused while its lines stay the same. */
  private fillMapFor(d: Drawing): FillMap {
    const key = `${JSON.stringify(this.fillOptions)}|${d.vectors.length}`;
    const c = this.fillMapCache;
    if (c && c.d === d && c.rev === d.rev && c.key === key) return c.map;
    const map = this.fillMapOf(d);
    this.fillMapCache = { d, rev: d.rev, key, map };
    return map;
  }

  /** Mark a drawing changed by a fill: its lines did not change, so its fill map stays valid. */
  private touchFill(d: Drawing): void {
    const c = this.fillMapCache;
    const keep = c !== null && c.d === d && c.rev === d.rev;
    this.touch(d);
    if (keep && c) c.rev = d.rev;
  }

  private rgbOf(color: string): number {
    return parseInt(color.replace('#', ''), 16) & 0xffffff;
  }

  /** Paint mask pixels (inside `box`) in one colour on a drawing's fill plane; returns the changed box. */
  private paintMask(d: Drawing, mask: Uint8Array, box: Box4, rgb: number): void {
    const target = planeCanvas(d, 'fill');
    const tg = target.getContext('2d')!;
    const rect = { x: box.x0, y: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 };
    const img = tg.getImageData(rect.x, rect.y, rect.w, rect.h);
    const [r, g, b] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
    for (let yy = 0; yy < rect.h; yy++) {
      for (let xx = 0; xx < rect.w; xx++) {
        if (!mask[(rect.y + yy) * this.docW + rect.x + xx]) continue;
        const o = (yy * rect.w + xx) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    putPixels(target, rect, img);
  }

  private beginFill(e: PointerEvent): void {
    if (this.fillBusy) return;
    if (this.project.isPlaceholder) this.project.editLayer();
    const d = this.drawing;
    if (!this.residency.isReady(d)) return;
    const p = this.toPoint(e, e.timeStamp);
    const target = planeCanvas(d, 'fill');
    const before = target.getContext('2d')!.getImageData(0, 0, this.docW, this.docH);
    this.fillG = { pointerId: e.pointerId, d, mode: this.fillMode, points: [[p.x, p.y]], seeds: [], before, painted: new Uint8Array(this.docW * this.docH), box: emptyBox() };
    if (this.fillMode === 'tap') this.fillSeed(p.x, p.y, false);
    this.onStrokeState(true);
    this.requestRender();
  }

  /** One seed of a tap or drag fill (skipped where this gesture already filled). */
  private fillSeed(fx: number, fy: number, exact: boolean): void {
    const g = this.fillG;
    if (!g) return;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= this.docW || y >= this.docH || g.painted[y * this.docW + x]) return;
    const r = fillFrom(this.fillMapFor(g.d), x, y, exact);
    if (!r) return;
    this.paintMask(g.d, r.mask, r, this.rgbOf(this.color));
    for (let yy = r.y0; yy <= r.y1; yy++) for (let xx = r.x0; xx <= r.x1; xx++) if (r.mask[yy * this.docW + xx]) g.painted[yy * this.docW + xx] = 1;
    grow4(g.box, r);
    g.seeds.push([x, y]);
    this.touchFill(g.d);
  }

  private fillMove(e: PointerEvent): void {
    const g = this.fillG;
    if (!g) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      const p = this.toPoint(ev, ev.timeStamp);
      const last = g.points[g.points.length - 1]!;
      if (g.mode === 'tap') {
        // drag fill: every area the finger passes over, sampled every 2 px so thin areas are not skipped
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last[0], p.y - last[1]) / 2));
        for (let k = 1; k <= steps; k++) this.fillSeed(last[0] + ((p.x - last[0]) * k) / steps, last[1] + ((p.y - last[1]) * k) / steps, true);
        g.points[g.points.length - 1] = [p.x, p.y];
      } else if (Math.hypot(p.x - last[0], p.y - last[1]) >= 1.5 / this.view.zoom) g.points.push([p.x, p.y]);
    }
    this.requestRender();
  }

  /** Radius of the leftover brush (document px): half the brush size, at least 4. */
  private leftoverRadius(): number {
    return Math.max(4, this.brush.size / 2);
  }

  private endFill(cancel: boolean): void {
    const g = this.fillG;
    if (!g) return;
    this.fillG = null;
    this.onStrokeState(false);
    const d = g.d;
    const target = planeCanvas(d, 'fill');
    if (cancel) {
      target.getContext('2d')!.putImageData(g.before, 0, 0);
      this.touchFill(d);
      return;
    }
    const color = this.rgbOf(this.color);
    let poly: Area | null = null;
    if (g.mode === 'lasso') {
      poly = polygonMask(g.points, this.docW, this.docH);
      const r = poly ? lassoFill(this.fillMapFor(d), poly) : null;
      if (r) {
        this.paintMask(d, r.mask, r, color);
        grow4(g.box, r);
      }
    } else if (g.mode === 'leftover') {
      const brush = brushMask(g.points, this.leftoverRadius(), this.docW, this.docH);
      if (brush) {
        const rad = this.leftoverRadius();
        const fillPx = target.getContext('2d')!.getImageData(0, 0, this.docW, this.docH).data;
        const holes = leftoverHoles(fillPx, this.fillMapFor(d).alpha, this.docW, this.docH, brush, {
          threshold: this.fillOptions.threshold,
          maxArea: Math.max(64, Math.round(Math.PI * rad * rad * 3)),
          under: this.fillOptions.under,
          fallback: color,
        });
        for (const hole of holes) {
          const m = new Uint8Array(this.docW * this.docH);
          const box = emptyBox();
          for (const i of hole.pixels) {
            m[i] = 1;
            const x = i % this.docW;
            grow4(box, { x0: x, y0: (i - x) / this.docW, x1: x, y1: (i - x) / this.docW });
          }
          this.paintMask(d, m, box, hole.rgb);
          grow4(g.box, box);
        }
      }
    }
    if (g.box.x1 < 0) {
      this.requestRender();
      return;
    }
    this.touchFill(d);
    const entries = [this.fillEntry(d, g.before, g.box)];
    const label = g.mode === 'lasso' ? 'Lasso fill' : g.mode === 'leftover' ? 'Fill leftovers' : g.seeds.length > 1 ? 'Drag fill' : 'Fill';
    if (this.fillAcross > 0 && g.mode !== 'leftover') void this.fillFollowing(d, g.seeds, poly, color, entries, label);
    else this.pushFill(label, entries);
  }

  /** Before / after of the changed box of a drawing's fill plane (the plane already shows "after"). */
  private fillEntry(d: Drawing, before: ImageData, box: Box4): FillEntry {
    const target = planeCanvas(d, 'fill');
    const rect = { x: box.x0, y: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 };
    const b = new ImageData(rect.w, rect.h);
    for (let y = 0; y < rect.h; y++) {
      const from = ((rect.y + y) * before.width + rect.x) * 4;
      b.data.set(before.data.subarray(from, from + rect.w * 4), y * rect.w * 4);
    }
    return { d, target, rect, before: b, after: target.getContext('2d')!.getImageData(rect.x, rect.y, rect.w, rect.h) };
  }

  private pushFill(label: string, entries: FillEntry[]): void {
    this.history.push({
      label,
      drawings: entries.map((e) => e.d),
      do: () => {
        for (const e of entries) {
          putPixels(e.target, e.rect, e.after);
          this.touchFill(e.d);
        }
      },
      undo: () => {
        for (const e of entries) {
          putPixels(e.target, e.rect, e.before);
          this.touchFill(e.d);
        }
      },
    });
  }

  /** Repeat a fill at the same spot on the next drawings (distinct, holds skipped). One undo step for all. */
  private async fillFollowing(first: Drawing, seeds: [number, number][], poly: Area | null, rgb: number, entries: FillEntry[], label: string): Promise<void> {
    this.fillBusy = true;
    try {
      const ex = this.project.exposures;
      const next = neighborDrawings(ex, this.lf, 0, this.fillAcross)
        .after.map((n) => this.project.drawing(n.drawing))
        .filter((x) => x !== first);
      for (const d of next) {
        await this.residency.pin(d);
        try {
          const map = this.fillMapOf(d);
          const target = planeCanvas(d, 'fill');
          const before = target.getContext('2d')!.getImageData(0, 0, this.docW, this.docH);
          const box = emptyBox();
          const painted = new Uint8Array(this.docW * this.docH);
          const results = poly ? [lassoFill(map, poly)] : seeds.map(([x, y], k) => (painted[y * this.docW + x] ? null : fillFrom(map, x, y, k > 0)));
          for (const r of results) {
            if (!r) continue;
            this.paintMask(d, r.mask, r, rgb);
            for (let yy = r.y0; yy <= r.y1; yy++) for (let xx = r.x0; xx <= r.x1; xx++) if (r.mask[yy * this.docW + xx]) painted[yy * this.docW + xx] = 1;
            grow4(box, r);
          }
          if (box.x1 >= 0) {
            this.touch(d);
            entries.push(this.fillEntry(d, before, box));
          }
        } finally {
          this.residency.unpin(d);
        }
      }
    } finally {
      this.fillBusy = false;
      this.pushFill(entries.length > 1 ? `${label} (${entries.length} drawings)` : label, entries);
    }
  }

  /** The lasso or leftover path while the pen is down (document space, on top of the drawing). */
  private drawFillPath(g: CanvasRenderingContext2D): void {
    const f = this.fillG;
    if (!f || f.mode === 'tap' || f.points.length < 2) return;
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(f.points[0]![0], f.points[0]![1]);
    for (const p of f.points) g.lineTo(p[0], p[1]);
    if (f.mode === 'lasso') {
      g.closePath();
      g.fillStyle = 'rgba(255, 90, 138, 0.12)';
      g.fill();
      g.setLineDash([6 / this.view.zoom, 4 / this.view.zoom]);
      g.lineWidth = 1.5 / this.view.zoom;
      g.strokeStyle = '#ff5a8a';
    } else {
      g.lineWidth = this.leftoverRadius() * 2;
      g.strokeStyle = 'rgba(255, 90, 138, 0.3)';
    }
    g.stroke();
    g.restore();
  }

  setBrush(b: BrushSettings): void {
    this.brush = b;
    saveJSON(BRUSH_KEY, b);
    this.onBrushChange();
  }

  brushChanged(): void {
    saveJSON(BRUSH_KEY, this.brush);
    this.onBrushChange();
  }

  setColor(c: string): void {
    this.color = c;
    saveJSON(COLOR_KEY, c);
    this.onColorChange();
  }

  /** Opens the Layers popover next to a button (set by main). */
  openLayers: ((anchor: HTMLElement) => void) | null = null;

  /** Shows a short message to the person (the file UI sets it to a toast). */
  onNotice: ((message: string) => void) | null = null;

  /** Fires when the colour changes (the toolbar's colour circle follows). */
  onColorChange: () => void = () => {};

  // -------------------------------------------------------------------------------------------
  // Commands

  undo(): void {
    this.stepHistory('undo');
  }

  redo(): void {
    this.stepHistory('redo');
  }

  /** Undo/redo, first bringing back any parked drawing the step touches. Steps run in order. */
  private stepHistory(dir: 'undo' | 'redo'): void {
    if (this.live) return;
    this.historyChain = this.historyChain.then(async () => {
      if (this.live) return;
      const cmd = dir === 'undo' ? this.history.peekUndo() : this.history.peekRedo();
      if (!cmd) return;
      const need = (cmd.drawings ?? []).map((x) => this.project.drawings.get(x.id)).filter((d): d is Drawing => !!d && !this.residency.isReady(d));
      if (need.length) await Promise.all(need.map((d) => this.residency.ensure(d)));
      if (dir === 'undo') this.history.undo();
      else this.history.redo();
      this.requestRender();
    });
  }

  /** Clear the current drawing (undoable). */
  clearFrame(): void {
    if (this.live) return;
    const d = this.drawing;
    if (!this.residency.isReady(d)) return;
    this.onRisky('Before clear drawing');
    const g = d.line.getContext('2d');
    if (!g) return;
    const full = { x: 0, y: 0, w: this.docW, h: this.docH };
    const before = g.getImageData(0, 0, this.docW, this.docH);
    const fillCanvas = d.fill;
    const fg = fillCanvas?.getContext('2d') ?? null;
    const fillBefore = fg ? fg.getImageData(0, 0, this.docW, this.docH) : null;
    const vectors = d.vectors;
    this.history.push(
      {
        label: 'Clear drawing',
        drawings: [d],
        do: () => {
          g.clearRect(0, 0, this.docW, this.docH);
          fg?.clearRect(0, 0, this.docW, this.docH);
          d.vectors = [];
          this.touch(d);
        },
        undo: () => {
          putPixels(d.line, full, before);
          if (fillCanvas && fillBefore) putPixels(fillCanvas, full, fillBefore);
          d.vectors = vectors;
          this.touch(d);
        },
      },
      false,
    );
  }

  /** Replace the whole project (open, restore, new). Clears undo and per-project view state. */
  loadProject(p: Project): void {
    if (this.live) this.endStroke(true);
    this.playing = false;
    this.scrubbing = false;
    this.lockFrame = null;
    const resized = p.width !== this.project.width || p.height !== this.project.height;
    this.project = p;
    this.selection = [];
    this.frame = 0;
    if (resized) {
      this.raster.resize(p.width, p.height);
      this.fillScratch = null;
      this.fillMapCache = null;
      this.fit();
    }
    this.onionCache.resize(p.width, p.height);
    this.editor.reset();
    if (this.workspace === 'motion') this.fit();
    this.residency.setProject(p);
    this.history.clear();
    this.requestRender();
    this.onFrameChange();
    this.onProjectLoaded();
    this.onDocChanged();
  }

  // -------------------------------------------------------------------------------------------
  // Frames and playback

  /**
   * `frame` is the playhead in the comp's time. The strip and X-sheet edit one drawings layer in
   * that layer's own time: layerFrame = frame − layer.start (negative before the layer starts).
   */
  get layerFrame(): number {
    return this.frame - this.project.layer.start;
  }

  /** The layer frame, held inside the layer (what edits and drawing act on). */
  get lf(): number {
    return Math.max(0, Math.min(this.layerFrame, this.project.length - 1));
  }

  /** The comp's length in frames: what playback loops over. */
  get compEnd(): number {
    return Math.max(1, compLength(this.project.comp, this.project.comps));
  }

  get drawing(): Drawing {
    return this.project.drawingAtFrame(this.lf);
  }

  /** Mark a drawing changed (thumbnails, render). */
  private touch(d: Drawing): void {
    d.rev += 1;
    this.residency.touch(d);
    if (!this.live) this.residency.updateThumb(d);
    this.requestRender();
    this.onFrameChange();
    this.onDocChanged();
  }

  // -------------------------------------------------------------------------------------------
  // Flipbook: a blank page after the last drawing (Procreate Dreams' flipbook works this way).
  // Step past the last frame and the page is blank with the last drawing as onion skin; the first
  // stroke makes it a real frame, and the next blank page waits after it. Flipping on or back
  // leaves nothing behind.

  /** Is the flipbook blank page on? (per device) */
  flipbook = loadJSON<boolean>(FLIPBOOK_KEY) ?? true;
  /** Showing the blank page after the last drawing. */
  blankPage = false;

  setFlipbook(on: boolean): void {
    this.flipbook = on;
    saveJSON(FLIPBOOK_KEY, on);
    if (!on) this.leaveBlankPage();
    this.onFrameChange();
  }

  // -------------------------------------------------------------------------------------------
  // Layers in the Draw view: every layer of the comp shows around the one being drawn on

  /** Show the comp's other layers while drawing. */
  showLayers = loadJSON<boolean>(LAYERS_KEY) ?? true;
  /** How strongly the other layers show (1 = as they are, lower = a light-table fade). */
  otherAlpha = loadJSON<number>(LAYERS_ALPHA_KEY) ?? 1;

  setShowLayers(on: boolean, alpha = this.otherAlpha): void {
    this.showLayers = on;
    this.otherAlpha = Math.max(0.1, Math.min(1, alpha));
    saveJSON(LAYERS_KEY, on);
    saveJSON(LAYERS_ALPHA_KEY, this.otherAlpha);
    this.requestRender();
    this.onFrameChange();
  }

  /** The active comp's drawings layers, top first (what the Draw view's layer list shows). */
  drawLayers(): DrawingsLayer[] {
    return this.project.comp.layers.filter((l): l is DrawingsLayer => l.kind === 'drawings');
  }

  /** Draw on another layer: the strip, X-sheet and onion skin switch to it. */
  pickLayer(id: string): void {
    if (this.live || id === this.project.activeLayer) return;
    this.leaveBlankPage();
    this.focusLayer(id);
    this.editor.select(id);
    this.onCompChanged();
    this.requestRender();
    this.onFrameChange();
  }

  /** A new drawings layer above the one being drawn on, starting at the playhead; draw on it. */
  addDrawLayer(): void {
    if (this.live) return;
    const cur = this.project.isPlaceholder ? null : this.project.layer;
    this.editor.select(cur ? cur.id : null);
    this.editor.addLayer('drawings');
    const made = this.editor.primary;
    if (made && made.kind === 'drawings') {
      this.focusLayer(made.id);
      this.onCompChanged();
      this.requestRender();
      this.onFrameChange();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Storyboard / animatic (doc 16): a guide layer of panels on the shot's own clock

  /** How strongly the storyboard shows under Draw (0 = hidden). */
  boardAlpha = loadJSON<number>(BOARD_ALPHA_KEY) ?? 0.35;
  /** The layer that was being drawn on before the Board workspace took over. */
  private beforeBoard: string | null = null;

  setBoardAlpha(a: number): void {
    this.boardAlpha = Math.max(0, Math.min(1, a));
    saveJSON(BOARD_ALPHA_KEY, this.boardAlpha);
    this.requestRender();
    this.onFrameChange();
  }

  /** The active comp's storyboard: its first guide drawings layer, or null. */
  get board(): DrawingsLayer | null {
    return this.project.comp.layers.find((l): l is DrawingsLayer => l.kind === 'drawings' && l.guide === true) ?? null;
  }

  private enterBoard(): void {
    const b = this.board;
    if (!b) return;
    if (this.project.activeLayer !== b.id) this.beforeBoard = this.project.activeLayer;
    this.focusLayer(b.id);
    this.onCompChanged();
  }

  private leaveBoard(): void {
    const b = this.board;
    if (!b || this.project.activeLayer !== b.id) return;
    const back = this.beforeBoard && this.project.comp.layers.some((l) => l.id === this.beforeBoard && l.kind === 'drawings') ? this.beforeBoard : '';
    // '' falls back to the first real drawing layer (or a fresh one when drawing starts)
    this.project.activeLayer = back;
    this.selection = [];
    this.onionCache.clear();
    this.onCompChanged();
  }

  /** Start a storyboard: a guide layer under everything with one blank two-second panel. */
  createBoard(): void {
    if (this.live || this.board) return;
    const p = this.project;
    const len = Math.max(1, Math.round(p.comp.fps * 2));
    this.editor.edit('Start storyboard', (c) => {
      const d = p.newDrawing();
      const l = drawingsLayer(p.newId('L'), 'Board', [{ drawing: d.id, length: len }], p.width, p.height, c.width, c.height);
      l.guide = true;
      c.layers.push(l);
    });
    if (this.workspace === 'board') this.enterBoard();
  }

  /** A new blank panel (two seconds) after the selected or current one. */
  addPanel(): void {
    const t = this.targets;
    const d = this.project.newDrawing();
    const at = t.length ? t[t.length - 1]! + 1 : this.project.exposures.length;
    this.editTimeline('New panel', (ex) => insertAt(ex, at, [{ drawing: d.id, length: Math.max(1, Math.round(this.project.fps * 2)) }]));
  }

  /** Go to a panel (its first frame) and select it. */
  goPanel(index: number): void {
    const ex = this.project.exposures;
    if (index < 0 || index >= ex.length) return;
    this.setLayerFrame(startOf(ex, index));
    this.setSelection([index]);
  }

  setPanelDuration(index: number, frames: number): void {
    if (!Number.isFinite(frames) || frames < 1) return;
    this.editTimeline('Panel duration', (ex) => ({ ex: setHolds(ex, [index], Math.round(frames)), frame: this.lf }), true);
  }

  setCaption(index: number, field: CaptionField, text: string): void {
    this.editTimeline('Edit caption', (ex) => ({ ex: setCaption(ex, index, field, text), frame: this.lf }), true);
  }

  /** Images (board sketches, photos) as new two-second panels after the current one: one undo step. */
  async importPanels(files: File[]): Promise<number> {
    if (this.live || !files.length) return 0;
    const p = this.project;
    const made: string[] = [];
    for (const f of files) {
      try {
        const img = await createImageBitmap(f);
        const d = p.newDrawing();
        const g = d.line.getContext('2d')!;
        const k = Math.min(p.width / img.width, p.height / img.height);
        const w = img.width * k;
        const h = img.height * k;
        g.drawImage(img, (p.width - w) / 2, (p.height - h) / 2, w, h);
        img.close();
        d.rev++;
        this.residency.updateThumb(d);
        made.push(d.id);
      } catch {
        // not an image the browser can read: skipped
      }
    }
    if (!made.length) return 0;
    const t = this.targets;
    const at = t.length ? t[t.length - 1]! + 1 : p.exposures.length;
    const len = Math.max(1, Math.round(p.fps * 2));
    this.editTimeline(made.length > 1 ? `Import ${made.length} panels` : 'Import panel', (ex) =>
      insertAt(
        ex,
        at,
        made.map((id) => ({ drawing: id, length: len })),
      ),
    );
    return made.length;
  }

  /** From the board to animation: Draw on the shot's first real layer, with the board faintly underneath. */
  animateShot(): void {
    if (this.live) return;
    this.setWorkspace('draw');
    const layer = this.project.comp.layers.find((l) => l.kind === 'drawings' && !l.guide);
    if (layer) this.pickLayer(layer.id);
    else {
      this.project.activeLayer = '';
      this.onCompChanged();
    }
    if (this.boardAlpha === 0) this.setBoardAlpha(0.35);
  }

  /** A new blank drawing after the last frame of the active layer, and go to it (the strip's + cell). */
  appendFrame(): void {
    if (this.live) return;
    this.setLayerFrame(this.project.length - 1);
    this.addFrame();
  }

  /** Go to the blank page after the active layer's last frame. */
  goBlankPage(): void {
    if (this.live || !this.flipbook || this.workspace === 'motion' || this.workspace === 'board') return;
    this.setLayerFrame(this.project.length - 1);
    if (this.playing) this.togglePlay();
    this.blankPage = true;
    this.requestRender();
    this.onFrameChange();
  }

  private leaveBlankPage(): void {
    if (!this.blankPage) return;
    this.blankPage = false;
    this.requestRender();
    this.onFrameChange();
  }

  setFrame(f: number): void {
    if (this.live) return;
    this.leaveBlankPage();
    const len = this.compEnd;
    const next = ((Math.round(f) % len) + len) % len;
    if (next === this.frame) return;
    this.frame = next;
    if (this.playing) this.playClock = { t0: performance.now(), f0: next };
    this.requestRender();
    this.onFrameChange();
  }

  nextFrame(): void {
    if (this.blankPage) return;
    if (this.flipbook && (this.workspace === 'draw' || this.workspace === 'time') && !this.playing && this.layerFrame >= this.project.length - 1) return this.goBlankPage();
    this.setFrame(this.frame + 1);
  }

  prevFrame(): void {
    if (this.blankPage) return this.leaveBlankPage();
    this.setFrame(this.frame - 1);
  }

  /** Go to a frame of the active drawings layer's own time (clamped to the layer). */
  setLayerFrame(f: number): void {
    const last = Math.max(0, this.project.length - 1);
    this.setFrame(this.project.layer.start + Math.max(0, Math.min(Math.round(f), last)));
  }

  nextDrawing(): void {
    this.setLayerFrame(nextDrawing(this.project.exposures, this.lf));
  }

  prevDrawing(): void {
    this.setLayerFrame(prevDrawing(this.project.exposures, this.lf));
  }

  togglePlay(): void {
    if (this.live) return;
    this.leaveBlankPage();
    this.playing = !this.playing;
    this.playClock = { t0: performance.now(), f0: this.frame };
    this.onFrameChange();
  }

  // -------------------------------------------------------------------------------------------
  // Onion skin and scrub lock

  /** Lite keeps fewer onion skins (each one is a whole drawing in memory). */
  private clampOnion(): void {
    const max = this.device.limits.onionMax;
    this.onion.before = Math.min(this.onion.before, max);
    this.onion.after = Math.min(this.onion.after, max);
  }

  onionChanged(): void {
    this.clampOnion();
    saveJSON(ONION_KEY, this.onion);
    this.requestRender();
    this.onFrameChange();
  }

  toggleOnion(): void {
    this.onion.enabled = !this.onion.enabled;
    this.onionChanged();
  }

  /** Set the home frame to the current frame, or clear it if it is already home. */
  toggleLock(): void {
    this.lockFrame = this.lockFrame === this.lf ? null : this.lf;
    this.onFrameChange();
  }

  beginScrub(): void {
    if (this.playing) this.togglePlay();
    this.scrubbing = true;
    this.requestRender();
  }

  /** Stop scrubbing; with a scrub lock set, snap back to the home frame. */
  endScrub(): void {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    if (this.lockFrame !== null) this.setLayerFrame(this.lockFrame);
    this.requestRender();
    this.onFrameChange();
  }

  setFps(fps: number): void {
    this.project.fps = Math.max(1, Math.min(120, Math.round(fps)));
    this.playClock = { t0: performance.now(), f0: this.frame };
    this.onFrameChange();
    this.onDocChanged();
  }

  private tickPlayback(now: number): void {
    const len = this.compEnd;
    const f = (this.playClock.f0 + Math.floor(((now - this.playClock.t0) * this.project.fps) / 1000)) % len;
    if (f !== this.frame) {
      this.frame = f;
      this.requestRender();
      this.onFrameChange();
    }
  }

  /**
   * Make a layer the one the strip and X-sheet edit (undo of a timeline edit switches back to the
   * layer it changed, so it never lands on another one).
   */
  focusLayer(id: string): void {
    if (this.project.activeLayer === id) return;
    this.project.activeLayer = id;
    this.selection = [];
    this.onionCache.clear();
  }

  /** Run a timeline edit as an undoable command. */
  // -------------------------------------------------------------------------------------------
  // Measuring time: one format for every timeline (frames, seconds + frames, timecode)

  timeFormat: FrameFormat = (() => {
    const v =
      loadJSON<string>(TIME_FORMAT_KEY) ??
      (() => {
        try {
          return localStorage.getItem(TIME_FORMAT_KEY);
        } catch {
          return null;
        }
      })();
    return v === 'secFrames' || v === 'timecode' ? v : 'frames';
  })();

  setTimeFormat(f: FrameFormat): void {
    this.timeFormat = f;
    try {
      localStorage.setItem(TIME_FORMAT_KEY, f);
    } catch {
      // not remembered
    }
    this.onFrameChange();
  }

  /** Frames → sec + frames → timecode → frames (tap any frame readout). */
  cycleTimeFormat(): void {
    const order: FrameFormat[] = ['frames', 'secFrames', 'timecode'];
    this.setTimeFormat(order[(order.indexOf(this.timeFormat) + 1) % order.length]!);
  }

  /** A frame (0-based) as text in the chosen format. */
  fmt(frame: number): string {
    return frameLabel(frame, this.project.comp.fps, this.timeFormat);
  }

  /** A length of time as text in the chosen format. */
  fmtDur(frames: number): string {
    return durationLabel(frames, this.project.comp.fps, this.timeFormat);
  }

  /**
   * The edge being changed right now (while dragging), in comp frames, shown as a line across every
   * timeline: `edge` says which edge, `delta` how far it moved, `shift` whether later things will move.
   */
  editLine: { frame: number; edge: 'in' | 'out' | 'move'; delta: number; shift: boolean } | null = null;

  setEditLine(v: { frame: number; edge: 'in' | 'out' | 'move'; delta: number } | null): void {
    this.editLine = v ? { ...v, shift: this.rippling && v.edge !== 'move' && v.delta !== 0 } : null;
    this.onFrameChange();
  }

  /** The edit line's label: "out 2s 06f · +6f (ripple)". */
  editLineLabel(): string {
    const e = this.editLine;
    if (!e) return '';
    const what = e.edge === 'move' ? 'start' : e.edge;
    const by = e.delta ? ` · ${e.delta > 0 ? '+' : ''}${this.fmtDur(e.delta)}` : '';
    return `${what} ${this.fmt(e.frame)}${by}${e.shift ? ' · ripple' : ''}`;
  }

  // -------------------------------------------------------------------------------------------
  // Ripple (doc 16, "Live edits"): a timing change inside a layer moves everything after it on
  // every layer of the comp. On by default; Shift+R switches it; holding Alt flips it for one edit.

  ripple = loadJSON<boolean>(RIPPLE_KEY) ?? true;
  /** Alt is held: the next edit does the opposite of the Ripple switch. */
  private altDown = false;

  setRipple(on: boolean): void {
    this.ripple = on;
    saveJSON(RIPPLE_KEY, on);
    this.onToolChange();
    this.onNotice?.(on ? 'Ripple on: changes move everything after them' : 'Ripple off: changes stay where they are');
  }

  /** Is ripple on for the edit happening now? */
  get rippling(): boolean {
    return this.ripple !== this.altDown;
  }

  /**
   * The whole comp after a timing change of one layer, when it ripples: null when ripple is off,
   * the length did not change, or the change is at the very end of the layer (adding to the end
   * pushes nothing, because nothing of that layer comes after it).
   */
  private rippleFor(layerId: string, before: Exposure[], after: Exposure[]): { before: Layer[]; after: Layer[]; durBefore: number | null; durAfter: number | null } | null {
    if (!this.rippling) return null;
    const ep = editPoint(before, after);
    if (!ep) return null;
    const total = totalFrames(before);
    if (ep.delta > 0 ? ep.at >= total : ep.at - ep.delta >= total) return null;
    const comp = this.project.comp;
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    const temp: Comp = { ...comp, layers: comp.layers.map((l) => (l.id === layerId ? ({ ...l, exposures: after } as Layer) : l)) };
    const r = rippleComp(temp, this.project.comps, layerId, layer.start + ep.at, ep.delta);
    const others = r.layers.some((l, i) => l !== temp.layers[i] && l.id !== layerId);
    if (!others && r.duration === comp.duration) return null;
    return { before: structuredClone(comp.layers), after: r.layers, durBefore: comp.duration, durAfter: r.duration };
  }

  private editTimeline(label: string, fn: (ex: Exposure[]) => Edit, keepSelection = false): void {
    if (this.live) return;
    const layer = this.project.editLayer();
    const compId = this.project.comp.id;
    const layerId = layer.id;
    const beforeEx = layer.exposures;
    const beforeFrame = this.lf;
    const beforeSel = [...this.selection];
    const r = fn(beforeEx);
    if (r.ex === beforeEx) return;
    const rip = this.rippleFor(layerId, beforeEx, r.ex);
    const setLayers = (layers: Layer[] | null, dur: number | null) => {
      const c = this.project.comps.get(compId);
      if (!c || !layers) return false;
      c.layers = structuredClone(layers);
      c.duration = dur;
      return true;
    };
    const after = (): number[] => r.selection ?? (keepSelection ? beforeSel : []);
    // the layer object can be replaced by a comp-level undo, so find it again each time
    const find = () => {
      this.project.activeComp = compId;
      const l = this.project.comps.get(compId)?.layers.find((x) => x.id === layerId);
      return l && l.kind === 'drawings' ? l : null;
    };
    // edits speak in layer frames; the playhead is in comp frames
    const place = (lf: number, ex: Exposure[]) => (find()?.start ?? 0) + Math.max(0, Math.min(lf, totalFrames(ex) - 1));
    this.history.push(
      {
        label: rip ? `${label} (ripple)` : label,
        do: () => {
          this.blankPage = false;
          this.focusLayer(layerId);
          this.selection = after();
          if (!setLayers(rip ? rip.after : null, rip?.durAfter ?? null)) {
            const l = find();
            if (l) l.exposures = r.ex;
          }
          this.frame = place(r.frame, r.ex);
          this.requestRender();
          this.onFrameChange();
          this.onDocChanged();
        },
        undo: () => {
          this.blankPage = false;
          this.focusLayer(layerId);
          this.selection = keepSelection || r.selection ? beforeSel : [];
          if (!setLayers(rip ? rip.before : null, rip?.durBefore ?? null)) {
            const l = find();
            if (l) l.exposures = beforeEx;
          }
          this.frame = place(beforeFrame, beforeEx);
          this.requestRender();
          this.onFrameChange();
          this.onDocChanged();
        },
      },
      false,
    );
  }

  addFrame(): void {
    const d = this.project.newDrawing();
    this.editTimeline('Add frame', (ex) => addAfter(ex, this.lf, d.id));
  }

  duplicateFrame(): void {
    if (!this.residency.isReady(this.drawing)) return;
    const d = this.project.cloneDrawing(this.drawing);
    this.editTimeline('Duplicate frame', (ex) => duplicateAt(ex, this.lf, d.id));
  }

  // -------------------------------------------------------------------------------------------
  // Block editing (X-sheet and strip action bar): each is one undo step and selects its result

  /** Exposures copied with Copy / Cut (drawing references and holds). Lives for the session. */
  clipboard: Exposure[] = [];

  /** A blank drawing (one frame) before the first or after the last selected exposure. */
  insertBlank(where: 'before' | 'after'): void {
    const t = this.targets;
    if (!t.length) return this.addFrame();
    const d = this.project.newDrawing();
    const at = where === 'before' ? t[0]! : t[t.length - 1]! + 1;
    this.editTimeline('Insert frame', (ex) => insertAt(ex, at, [{ drawing: d.id, length: 1 }]));
  }

  /** New drawings copied from the selected ones, placed right after them with the same holds. */
  async duplicateSelection(): Promise<void> {
    const t = this.targets;
    if (this.live || !t.length) return;
    const ex = this.project.exposures;
    const copies = await this.copyDrawings(t.map((i) => ex[i]!.drawing));
    if (copies && this.project.exposures === ex) this.editTimeline(t.length > 1 ? 'Duplicate drawings' : 'Duplicate frame', (e) => duplicateBlock(e, t, copies));
  }

  copySelection(): number {
    const ex = this.project.exposures;
    this.clipboard = this.targets.map((i) => ({ drawing: ex[i]!.drawing, length: ex[i]!.length }));
    return this.clipboard.length;
  }

  cutSelection(): void {
    if (!this.copySelection()) return;
    this.selection = [...this.targets];
    this.deleteFrame();
  }

  /**
   * Paste after the selection (or the current drawing). `copies` makes new drawings; otherwise
   * the same drawings are shown again, the way an exposure sheet reuses a number (cycles, holds).
   */
  async paste(copies = false): Promise<void> {
    const items = this.clipboard.filter((e) => this.project.drawings.has(e.drawing));
    if (this.live || !items.length) return;
    const t = this.targets;
    const at = t.length ? t[t.length - 1]! + 1 : this.project.exposures.length;
    const ex = this.project.exposures;
    let ids = items.map((e) => e.drawing);
    if (copies) {
      const made = await this.copyDrawings(ids);
      if (!made || this.project.exposures !== ex) return;
      ids = made;
    }
    this.editTimeline(copies ? 'Paste copies' : 'Paste', (e) =>
      insertAt(
        e,
        at,
        items.map((it, k) => ({ drawing: ids[k]!, length: it.length })),
      ),
    );
  }

  /** Move the selected (or current) exposures earlier or later by `delta` places, as one block. */
  moveSelection(delta: number): void {
    const t = this.targets;
    this.editTimeline(delta < 0 ? 'Move earlier' : 'Move later', (ex) => shiftBlock(ex, t, delta));
  }

  /** Drop the selected block so it starts at `to` (an index among the exposures left without it). */
  moveSelectionTo(to: number): void {
    const t = this.targets;
    this.editTimeline('Move drawings', (ex) => moveBlock(ex, t, to));
  }

  /** New drawings copied from these (one copy per distinct drawing), or null if one could not load. */
  private async copyDrawings(ids: string[]): Promise<string[] | null> {
    const src = [...new Set(ids)].map((id) => this.project.drawing(id));
    try {
      await Promise.all(src.map((d) => this.residency.pin(d)));
      const made = new Map(src.map((d) => [d.id, this.project.cloneDrawing(d).id]));
      return ids.map((id) => made.get(id)!);
    } catch {
      return null;
    } finally {
      for (const d of src) this.residency.unpin(d);
    }
  }

  /** Selected exposures, or the current drawing's when nothing is selected. */
  get targets(): number[] {
    const n = this.project.exposures.length;
    const sel = this.selection.filter((i) => i >= 0 && i < n);
    if (sel.length) return sel;
    const l = locate(this.project.exposures, this.lf);
    return l ? [l.index] : [];
  }

  setSelection(indices: number[]): void {
    const n = this.project.exposures.length;
    this.selection = [...new Set(indices)].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
    this.onFrameChange();
  }

  selectAll(): void {
    this.setSelection(this.project.exposures.map((_, i) => i));
  }

  deleteFrame(): void {
    if (!this.live) this.onRisky('Before delete drawing');
    const picked = this.selection.length ? [...this.selection] : null;
    this.editTimeline(picked ? 'Delete drawings' : 'Delete frame', (ex) => {
      const r = picked ? { ex: removeIndices(ex, picked), frame: this.lf } : removeAt(ex, this.lf);
      if (r.ex.length > 0) return { ex: r.ex, frame: Math.min(r.frame, totalFrames(r.ex) - 1) };
      // Never leave the layer empty: replace the last drawing with a blank one.
      return { ex: [{ drawing: this.project.newDrawing().id, length: 1 }], frame: 0 };
    });
  }

  /**
   * X-sheet style: show drawing number `num` from `frame` to the end of that hold. A number with
   * no drawing yet creates a blank one with that number.
   */
  exposeDrawingAt(frame: number, num: number): void {
    if (this.live || !Number.isInteger(num) || num < 1 || num > 9999) return;
    const d = this.project.drawingByNum(num) ?? this.project.adopt(`d${num}x${Date.now().toString(36)}`, num, []);
    this.editTimeline(`Show drawing ${num}`, (ex) => ({ ex: exposeAt(ex, frame, d.id), frame }));
  }

  /** Set the exposure-sheet note on one exposure. */
  setExposureNote(index: number, text: string): void {
    this.editTimeline('Edit note', (ex) => ({ ex: setNote(ex, index, text), frame: this.lf }), true);
  }

  /** Make each selected drawing last N frames (1s, 2s, 3s...). Never deletes a drawing. */
  setExposure(n: number): void {
    this.editTimeline(n === 1 ? 'Exposure on ones' : `Exposure on ${n}s`, (ex) => ({ ex: setHolds(ex, this.targets, n), frame: this.lf }), true);
  }

  changeHold(delta: number): void {
    this.editTimeline(delta > 0 ? 'Longer hold' : 'Shorter hold', (ex) => ({ ex: adjustHolds(ex, this.targets, delta), frame: this.lf }), true);
  }

  /** Mark the selected (or current) drawings as key / breakdown / inbetween; marking again clears it. */
  setRole(role: Role): void {
    if (this.live) return;
    const ids = [...new Set(this.targets.map((i) => this.project.exposures[i]!.drawing))];
    const ds = ids.map((id) => this.project.drawing(id));
    if (!ds.length) return;
    const next: Role | null = ds.every((d) => d.role === role) ? null : role;
    const before = ds.map((d) => d.role);
    const apply = (roles: (Role | null)[]) => {
      ds.forEach((d, i) => (d.role = roles[i] ?? null));
      this.requestRender();
      this.onFrameChange();
      this.onDocChanged();
    };
    this.history.push({ label: next ? `Mark as ${next}` : 'Clear mark', do: () => apply(ds.map(() => next)), undo: () => apply(before) }, false);
  }

  /** While dragging on the timeline: show the new order/holds without recording history yet. */
  previewExposures(ex: Exposure[]): void {
    this.blankPage = false;
    this.project.exposures = ex;
    this.frame = Math.min(this.frame, this.compEnd - 1);
    this.requestRender();
    this.onFrameChange();
  }

  /** At the end of a drag: record it as one undoable step (before = the exposures when the drag began). */
  commitExposures(label: string, before: Exposure[], after: Exposure[]): void {
    if (after === before) return;
    const compId = this.project.comp.id;
    const layerId = this.project.editLayer().id;
    const rip = this.rippleFor(layerId, before, after);
    if (rip) {
      const set = (layers: Layer[], dur: number | null) => {
        this.blankPage = false;
        this.selection = [];
        this.project.activeComp = compId;
        const c = this.project.comps.get(compId);
        if (c) {
          c.layers = structuredClone(layers);
          c.duration = dur;
        }
        this.focusLayer(layerId);
        this.frame = Math.min(this.frame, this.compEnd - 1);
        this.requestRender();
        this.onFrameChange();
        this.onDocChanged();
      };
      this.history.push({ label: `${label} (ripple)`, do: () => set(rip.after, rip.durAfter), undo: () => set(rip.before, rip.durBefore) }, false);
      return;
    }
    const set = (ex: Exposure[]) => {
      this.blankPage = false;
      this.selection = [];
      this.project.activeComp = compId;
      this.focusLayer(layerId);
      this.project.exposures = ex;
      this.frame = Math.min(this.frame, this.compEnd - 1);
      this.requestRender();
      this.onFrameChange();
      this.onDocChanged();
    };
    this.history.push({ label, do: () => set(after), undo: () => set(before) }, true);
    this.onDocChanged();
  }

  fit(): void {
    this.view.fit(this.docW, this.docH, this.viewW, this.viewH);
    this.requestRender();
  }

  actualSize(): void {
    this.view.actualSize(this.docW, this.docH, this.viewW, this.viewH);
    this.requestRender();
  }

  flipView(): void {
    this.view.toggleFlip(this.viewW, this.viewH);
    this.requestRender();
  }

  resetRotation(): void {
    this.view.resetRotation(this.viewW, this.viewH);
    this.requestRender();
  }

  resizeBrush(factor: number): void {
    this.brush.size = Math.min(500, Math.max(1, Math.round(this.brush.size * factor * 10) / 10));
    this.brushChanged();
  }

  async exportPNG(): Promise<void> {
    await this.residency.ensure(this.drawing);
    const c = document.createElement('canvas');
    c.width = this.docW;
    c.height = this.docH;
    const g = c.getContext('2d');
    if (!g) return;
    const d = this.drawing;
    paintDrawing(g, d);
    const a = document.createElement('a');
    a.download = `2dope-frame${String(this.frame + 1).padStart(3, '0')}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  }

  // -------------------------------------------------------------------------------------------
  // Strokes

  private toPoint(e: PointerEvent, t0: number): StrokePoint {
    const r = this.canvas.getBoundingClientRect();
    const d = this.view.screenToDoc(e.clientX - r.left, e.clientY - r.top);
    let pressure = e.pointerType === 'mouse' ? 1 : e.pressure;
    if (e.pointerType === 'touch' && (pressure === 0 || pressure === 0.5)) pressure = 0.6;
    let tiltX = e.tiltX || 0;
    let tiltY = e.tiltY || 0;
    const alt = (e as PointerEvent & { altitudeAngle?: number }).altitudeAngle;
    const az = (e as PointerEvent & { azimuthAngle?: number }).azimuthAngle;
    if (!tiltX && !tiltY && e.pointerType === 'pen' && alt !== undefined && az !== undefined) {
      const mag = 90 - (alt * 180) / Math.PI;
      tiltX = mag * Math.cos(az);
      tiltY = mag * Math.sin(az);
    }
    // Mouse users can test side-of-pencil shading: hold Alt to simulate a pen lying at ~65°.
    if (e.pointerType === 'mouse' && e.altKey) {
      tiltX = 55;
      tiltY = 35;
    }
    return { x: d.x, y: d.y, pressure, tiltX, tiltY, t: e.timeStamp - t0 };
  }

  private beginStroke(e: PointerEvent): void {
    if (this.playing) {
      this.playing = false;
      this.onFrameChange();
    }
    if (!this.project.isPlaceholder && this.project.layer.locked) {
      this.onNotice?.(`“${this.project.layer.name}” is locked. Unlock it in Layers to draw on it.`);
      return;
    }
    if (this.tool === 'fill') {
      if (!this.blankPage) this.beginFill(e);
      return;
    }
    const tool = this.tool;
    if (this.blankPage) {
      if (tool === 'eraser') return; // nothing to erase on a blank page
      this.blankPage = false;
      this.addFrame();
    }
    // drawing on a comp's placeholder makes it a real layer of that comp
    if (this.project.isPlaceholder) {
      this.project.editLayer();
      this.onDocChanged();
    }
    const drawing = this.drawing;
    // Its pixels are still coming back (a few ms after changing frame): ignore this touch.
    if (!this.residency.isReady(drawing)) return;
    const plane: Plane = tool === 'pen' ? 'line' : this.plane;
    const canvas = planeCanvas(drawing, plane);
    this.raster.bind(canvas);
    const record: StrokeRecord = {
      id: newStrokeId(),
      tool,
      brush: cloneBrush(this.brush),
      color: this.color,
      seed: newSeed(),
      points: [],
    };
    const t0 = e.timeStamp;
    const first = this.toPoint(e, t0);
    this.live = {
      record,
      drawing,
      canvas,
      plane,
      pointerId: e.pointerId,
      t0,
      smoother: new Smoother(record.brush.smoothing, record.brush.pulledString, this.view.zoom),
      walker: new DabWalker(record.brush, record.seed),
      lastRaw: first,
      predicted: [],
    };
    if (tool !== 'pen') this.raster.begin(record);
    this.feed(first);
    this.onStrokeState(true);
  }

  private feed(p: StrokePoint): void {
    const live = this.live;
    if (!live) return;
    live.lastRaw = p;
    for (const q of live.smoother.push(p)) this.accept(q);
  }

  private accept(q: StrokePoint): void {
    const live = this.live;
    if (!live) return;
    live.record.points.push(q);
    if (live.record.tool !== 'pen') this.raster.addDabs(live.walker.push(q));
  }

  private endStroke(cancel = false): void {
    const live = this.live;
    if (!live) return;
    this.live = null;
    this.onStrokeState(false);
    const rec = live.record;
    if (cancel) {
      if (rec.tool !== 'pen') this.raster.cancel();
      this.requestRender();
      return;
    }
    for (const q of live.smoother.finish(live.lastRaw)) {
      rec.points.push(q);
      if (rec.tool !== 'pen') this.raster.addDabs(live.walker.push(q));
    }
    // post-correction: tidy the finished line (the eraser is left as drawn)
    const post = rec.tool === 'eraser' ? 0 : (rec.brush.postSmooth ?? 0);
    if (post > 0) rec.points = smoothStroke(rec.points, post);
    const d = live.drawing;
    if (rec.tool === 'pen') {
      const id = rec.id;
      this.history.push(
        {
          label: 'Vector stroke',
          drawings: [d],
          do: () => {
            d.vectors = [...d.vectors, rec];
            this.touch(d);
          },
          undo: () => {
            d.vectors = d.vectors.filter((v) => v.id !== id);
            this.touch(d);
          },
        },
        false,
      );
    } else {
      const c = this.raster.commit(post > 0);
      // the eraser on the Line plane also cuts vector lines (up to their crossings, or whole)
      const vBefore = d.vectors;
      const vAfter = rec.tool === 'eraser' && live.plane === 'line' ? eraseVectors(d.vectors, rec.points, rec.brush.size / 2, this.vectorErase) : null;
      if (vAfter) d.vectors = vAfter;
      if (c || vAfter) {
        this.history.push({
          label: rec.tool === 'eraser' ? 'Erase' : 'Brush stroke',
          drawings: [d],
          do: () => {
            if (c) putPixels(live.canvas, c.rect, c.after);
            if (vAfter) d.vectors = vAfter;
            this.touch(d);
          },
          undo: () => {
            if (c) putPixels(live.canvas, c.rect, c.before);
            if (vAfter) d.vectors = vBefore;
            this.touch(d);
          },
        });
        this.touch(d);
      }
    }
    this.residency.updateThumb(d);
    this.requestRender();
  }

  private lengthOf(rec: StrokeRecord): number {
    let len = this.lengthCache.get(rec);
    if (len === undefined) {
      len = strokeLength(rec.points);
      this.lengthCache.set(rec, len);
    }
    return len;
  }

  // -------------------------------------------------------------------------------------------
  // Input

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e, false));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (Date.now() - this.lastHold < 1000) return; // the hold already opened it
      this.openCanvasMenu(e.clientX, e.clientY);
    });
    // Safari's own pinch-zoom gestures must not move the page.
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(t, (e) => e.preventDefault());
    }
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(this.stage);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.endScrub();
    });
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for pointers the browser no longer tracks; drawing still works.
    }
    const isTouch = e.pointerType === 'touch';

    if (isTouch) {
      // Palm rejection: while the pen draws, fingers are ignored.
      if (this.live && this.live.record && this.live.pointerId !== e.pointerId) {
        if (this.liveIsTouch()) {
          // A second finger while finger-painting means "navigate": drop the stroke.
          this.endStroke(true);
        } else {
          return;
        }
      }
      const p = this.local(e);
      this.touches.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y });
      if (!this.tapSession) this.tapSession = { start: performance.now(), maxTouches: 0, moved: false };
      this.tapSession.maxTouches = Math.max(this.tapSession.maxTouches, this.touches.size);
      // a second finger means "navigate": let go of a layer drag
      if (this.motionPointer !== null && this.motionPointer !== e.pointerId) {
        this.editor.gestureEnd(true);
        this.motionPointer = null;
      }
      this.armHold(e);
      if (this.touches.size === 1 && this.workspace === 'motion') {
        if (this.motionDown(e)) return;
      } else if (this.touches.size === 1 && this.fingerPaint) {
        this.beginStroke(e);
        this.requestRender();
        return;
      }
      this.startPinchIfNeeded();
      return;
    }

    // Pen or mouse: the pen always wins over an ongoing touch gesture.
    this.pinch = null;
    const p = this.local(e);
    const mode: NavMode | null = e.button === 1 || this.held.has('Space') ? 'pan' : this.held.has('KeyR') ? 'rotate' : this.held.has('KeyZ') ? 'zoom' : null;
    if (mode) {
      if (mode === 'pan' && this.held.has('Space')) this.spacePanned = true;
      const c = { x: this.viewW / 2, y: this.viewH / 2 };
      this.nav = {
        mode,
        pointerId: e.pointerId,
        lastX: p.x,
        lastY: p.y,
        startX: p.x,
        startY: p.y,
        startRot: this.view.rot,
        startAng: Math.atan2(p.y - c.y, p.x - c.x),
      };
      return;
    }
    if (e.button !== 0) return;
    if (this.workspace === 'motion') {
      this.motionDown(e);
      return;
    }
    this.beginStroke(e);
    this.requestRender();
  }

  /** Stage point (what the canvas shows) under a pointer. */
  private stagePoint(e: PointerEvent): [number, number] {
    const p = this.local(e);
    const d = this.view.screenToDoc(p.x, p.y);
    return [d.x, d.y];
  }

  private lastTap = { at: 0, layer: '' };

  // -------------------------------------------------------------------------------------------
  // Context menu on the canvas: right-click, the pen's barrel button, or one finger held still

  private holdArm: { timer: number; id: number; x: number; y: number } | null = null;
  /** The finger that opened a menu (its moves are ignored until it lifts). */
  private held_: number | null = null;
  private lastHold = 0;
  /** Motion's layer menus (set by the Motion panel). */
  motionMenu: ((l: Layer | null) => CtxItem[]) | null = null;

  private armHold(e: PointerEvent): void {
    this.disarmHold();
    // finger painting keeps a still finger for drawing dots; the menu is a right-click there
    if (this.touches.size !== 1 || (this.fingerPaint && this.workspace !== 'motion')) return;
    const x = e.clientX;
    const y = e.clientY;
    this.holdArm = {
      id: e.pointerId,
      x,
      y,
      timer: window.setTimeout(() => {
        const arm = this.holdArm;
        this.holdArm = null;
        if (!arm || this.touches.size !== 1) return;
        // a finger stroke that has not moved is dropped; a layer grab is let go
        if (this.live && this.live.pointerId === arm.id) this.endStroke(true);
        if (this.motionPointer === arm.id) {
          this.editor.gestureEnd(true);
          this.motionPointer = null;
        }
        if (this.tapSession) this.tapSession.moved = true; // not a tap (no undo)
        this.held_ = arm.id;
        this.lastHold = Date.now();
        swallowNextClick();
        this.openCanvasMenu(arm.x, arm.y);
      }, HOLD_MS),
    };
  }

  private disarmHold(): void {
    if (!this.holdArm) return;
    clearTimeout(this.holdArm.timer);
    this.holdArm = null;
  }

  /** Pixel colour of the current drawing at a document point (line over fill), or null if empty there. */
  colorAt(x: number, y: number): string | null {
    const d = this.drawing;
    if (d.parked || x < 0 || y < 0 || x >= this.project.width || y >= this.project.height) return null;
    for (const c of [d.line, d.fill]) {
      const px = c?.getContext('2d')?.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      if (px && px[3]! > 0) return `#${[px[0]!, px[1]!, px[2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    return null;
  }

  /** The canvas menu for the current mode at a screen point. */
  openCanvasMenu(clientX: number, clientY: number): void {
    if (this.live) return;
    const r = this.canvas.getBoundingClientRect();
    const doc = this.view.screenToDoc(clientX - r.left, clientY - r.top);
    let items: CtxItem[];
    if (this.workspace === 'motion') {
      const l = this.editor.hitLayer([doc.x, doc.y]);
      if (l && !this.editor.selected.includes(l.id)) this.editor.select(l.id);
      items = [...(this.motionMenu?.(l) ?? []), { sep: true }, { label: 'Fit view', run: () => this.fit(), hint: 'F' }];
    } else {
      const picked = this.colorAt(doc.x, doc.y);
      const tool = (t: Tool, label: string) => ({ label, on: this.tool === t, run: () => this.setTool(t) });
      items = [
        ...(picked ? [{ label: 'Pick this colour', hint: picked, run: () => this.setColor(picked) }] : []),
        { title: 'Tool' },
        { chips: [tool('brush', 'Brush'), tool('eraser', 'Eraser'), tool('pen', 'Vector'), tool('fill', 'Fill')] },
        ...(this.tool === 'eraser'
          ? [
              { title: 'Eraser on vector lines' },
              {
                chips: [
                  { label: 'Up to crossings', on: this.vectorErase === 'crossing', run: () => this.setVectorErase('crossing') },
                  { label: 'Whole line', on: this.vectorErase === 'whole', run: () => this.setVectorErase('whole') },
                  { label: 'Off', on: this.vectorErase === 'off', run: () => this.setVectorErase('off') },
                ],
              },
            ]
          : []),
        ...(this.tool === 'fill'
          ? [
              { title: 'Fill' },
              {
                chips: [
                  { label: 'Tap / drag', on: this.fillMode === 'tap', run: () => this.setFillMode('tap') },
                  { label: 'Lasso', on: this.fillMode === 'lasso', run: () => this.setFillMode('lasso') },
                  { label: 'Leftovers', on: this.fillMode === 'leftover', run: () => this.setFillMode('leftover') },
                ],
              },
              { title: 'Also fill the next drawings' },
              { chips: [0, 1, 2, 4, 8].map((n) => ({ label: n ? `+${n}` : 'Off', on: this.fillAcross === n, run: () => this.setFillAcross(n) })) },
            ]
          : []),
        { title: 'Draw on' },
        {
          chips: [
            { label: 'Line', on: this.plane === 'line', run: () => this.plane !== 'line' && this.togglePlane() },
            { label: 'Fill', on: this.plane === 'fill', run: () => this.plane !== 'fill' && this.togglePlane() },
          ],
        },
        { sep: true },
        { label: 'Undo', run: () => this.undo(), disabled: !this.history.canUndo, hint: '2 fingers' },
        { label: 'Redo', run: () => this.redo(), disabled: !this.history.canRedo, hint: '3 fingers' },
        { title: 'Frame' },
        {
          chips: [
            { label: '+ Frame', run: () => this.addFrame() },
            { label: 'Duplicate', run: () => this.duplicateSelection() },
            { label: 'Delete', run: () => this.deleteFrame() },
          ],
        },
        { label: 'Show lines', checked: this.partVisible('line'), run: () => this.togglePart('line') },
        { label: 'Show colour (fills)', checked: this.partVisible('fill'), run: () => this.togglePart('fill') },
        { label: 'Onion skin', checked: this.onion.enabled, run: () => this.toggleOnion(), hint: 'O' },
        { label: 'Flipbook blank page', checked: this.flipbook, run: () => this.setFlipbook(!this.flipbook) },
        { label: 'Scrub lock here', checked: this.lockFrame !== null, run: () => this.toggleLock(), hint: 'L' },
        { sep: true },
        { label: 'Fit view', run: () => this.fit(), hint: 'F' },
        { label: 'Flip view', run: () => this.flipView(), hint: 'H' },
        { label: this.uiHidden ? 'Show interface' : 'Hide interface', run: () => this.toggleUI(), hint: '4 fingers' },
      ];
    }
    showContextMenu(clientX, clientY, items);
  }

  /** Motion workspace: grab a layer (or its handles) under the pointer. Double-tap a precomp to go inside. */
  private motionDown(e: PointerEvent): boolean {
    const ed = this.editor;
    const grabbed = ed.gestureStart(this.stagePoint(e), this.view.zoom, e.shiftKey || ed.multiSelect);
    const hit = grabbed ? (ed.primary?.id ?? '') : '';
    const now = performance.now();
    if (grabbed && hit === this.lastTap.layer && now - this.lastTap.at < 350 && ed.primary?.kind === 'comp') {
      ed.gestureEnd(true);
      this.lastTap = { at: 0, layer: '' };
      ed.enter(hit);
      return true;
    }
    this.lastTap = { at: now, layer: hit };
    this.motionPointer = grabbed ? e.pointerId : null;
    this.requestRender();
    return grabbed;
  }

  private liveIsTouch(): boolean {
    return this.live !== null && this.touches.has(this.live.pointerId);
  }

  private onMove(e: PointerEvent): void {
    if (this.fillG && e.pointerId === this.fillG.pointerId) return this.fillMove(e);
    const arm = this.holdArm;
    if (arm && arm.id === e.pointerId && Math.hypot(e.clientX - arm.x, e.clientY - arm.y) > HOLD_SLOP) this.disarmHold();
    if (this.motionPointer === e.pointerId) {
      this.editor.gestureMove(this.stagePoint(e));
      return;
    }
    if (this.live && e.pointerId === this.live.pointerId) {
      const events = e.getCoalescedEvents?.() ?? [];
      const list = events.length ? events : [e];
      for (const ev of list) this.feed(this.toPoint(ev, this.live.t0));
      const predicted = e.getPredictedEvents?.() ?? [];
      this.live.predicted = predicted.map((ev) => this.toPoint(ev, this.live!.t0));
      this.trackStats(e, list.length);
      this.requestRender();
      return;
    }
    if (this.nav && e.pointerId === this.nav.pointerId) {
      this.navMove(e);
      return;
    }
    const t = this.touches.get(e.pointerId);
    if (t) {
      const p = this.local(e);
      t.x = p.x;
      t.y = p.y;
      if (this.held_ === e.pointerId) return; // the finger that opened a menu does not pan

      if (this.tapSession && Math.hypot(p.x - t.sx, p.y - t.sy) > 10) this.tapSession.moved = true;
      this.touchNavigate(e.pointerId, p);
      return;
    }
    if (e.pointerType === 'pen') this.trackStats(e, 1);
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    if (this.fillG && e.pointerId === this.fillG.pointerId) this.endFill(cancelled && e.pointerType !== 'pen');
    this.disarmHold();
    if (this.held_ === e.pointerId) this.held_ = null;
    if (this.motionPointer === e.pointerId) {
      this.motionPointer = null;
      this.editor.gestureEnd(cancelled && e.pointerType !== 'pen');
    }
    if (this.live && e.pointerId === this.live.pointerId) {
      this.endStroke(cancelled && e.pointerType !== 'pen');
    }
    if (this.nav && e.pointerId === this.nav.pointerId) this.nav = null;
    if (this.touches.has(e.pointerId)) {
      this.touches.delete(e.pointerId);
      this.pinch = null;
      this.startPinchIfNeeded();
      if (this.touches.size === 0) this.finishTapSession(cancelled);
    }
  }

  private finishTapSession(cancelled: boolean): void {
    const s = this.tapSession;
    this.tapSession = null;
    if (!s || cancelled || s.moved || performance.now() - s.start > 300) return;
    if (s.maxTouches === 2) this.undo();
    else if (s.maxTouches === 3) this.redo();
    else if (s.maxTouches === 4) this.toggleUI();
  }

  toggleUI(): void {
    this.uiHidden = !this.uiHidden;
    document.body.classList.toggle('ui-hidden', this.uiHidden);
  }

  private startPinchIfNeeded(): void {
    if (this.touches.size < 2 || this.pinch) return;
    const ids = [...this.touches.keys()];
    const a = ids[0]!;
    const b = ids[1]!;
    const ta = this.touches.get(a)!;
    const tb = this.touches.get(b)!;
    const mid = { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
    this.pinch = {
      a,
      b,
      startDist: Math.max(1, Math.hypot(tb.x - ta.x, tb.y - ta.y)),
      startAng: Math.atan2(tb.y - ta.y, tb.x - ta.x),
      startZoom: this.view.zoom,
      startRot: this.view.rot,
      anchor: this.view.screenToDoc(mid.x, mid.y),
    };
  }

  private touchNavigate(id: number, p: { x: number; y: number }): void {
    const pinch = this.pinch;
    if (pinch) {
      const ta = this.touches.get(pinch.a);
      const tb = this.touches.get(pinch.b);
      if (!ta || !tb) return;
      const dist = Math.max(1, Math.hypot(tb.x - ta.x, tb.y - ta.y));
      const ang = Math.atan2(tb.y - ta.y, tb.x - ta.x);
      const mid = { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
      const v = this.view;
      v.zoom = Math.min(Viewport.MAX_ZOOM, Math.max(Viewport.MIN_ZOOM, (pinch.startZoom * dist) / pinch.startDist));
      v.rot = snapRotation(pinch.startRot + (((ang - pinch.startAng) * 180) / Math.PI) * (v.flipped ? -1 : 1));
      v.anchor(pinch.anchor, mid.x, mid.y);
      this.requestRender();
      return;
    }
    if (this.touches.size === 1 && (!this.fingerPaint || this.workspace === 'motion') && !this.editor.dragging) {
      const t = this.touches.get(id)!;
      // One finger pans (the pen always draws, fingers navigate).
      const prev = t as TouchInfo & { px?: number; py?: number };
      const px = prev.px ?? t.sx;
      const py = prev.py ?? t.sy;
      this.view.pan(p.x - px, p.y - py);
      prev.px = p.x;
      prev.py = p.y;
      this.requestRender();
    }
  }

  private navMove(e: PointerEvent): void {
    const nav = this.nav!;
    const p = this.local(e);
    if (nav.mode === 'pan') {
      this.view.pan(p.x - nav.lastX, p.y - nav.lastY);
    } else if (nav.mode === 'zoom') {
      this.view.zoomAt(nav.startX, nav.startY, Math.exp((p.x - nav.lastX) * 0.01));
    } else {
      const c = { x: this.viewW / 2, y: this.viewH / 2 };
      const ang = Math.atan2(p.y - c.y, p.x - c.x);
      this.view.setRotationAt(c.x, c.y, nav.startRot + ((ang - nav.startAng) * 180) / Math.PI);
    }
    nav.lastX = p.x;
    nav.lastY = p.y;
    this.requestRender();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = { x: e.offsetX, y: e.offsetY };
    if (e.shiftKey && !e.ctrlKey) {
      this.view.pan(-e.deltaY, 0);
    } else {
      const k = e.ctrlKey ? 0.01 : 0.0015;
      this.view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * k));
    }
    this.requestRender();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const target = e.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox' && target.type !== 'color';
    if (typing || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    // Panels that handle their own keys (the X-sheet grid) are left alone.
    if (e.key === 'Alt') this.altDown = down;
    if (target?.closest?.('[data-own-keys]')) return;
    if (!down) {
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.scrubbing) this.endScrub();
      // A tap of Space (no drag) plays / pauses; Space + drag pans.
      if (e.code === 'Space' && this.held.has('Space') && !this.spacePanned) this.togglePlay();
      this.held.delete(e.code);
      this.updateCursor();
      return;
    }
    if (e.key === 'Alt') e.preventDefault();
    if (e.code === 'KeyR' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.setRipple(!this.ripple);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && e.code === 'KeyA') {
      e.preventDefault();
      this.selectAll();
      return;
    }
    // Motion: Ctrl+Shift+D splits the selected layers at the playhead
    if (mod && e.shiftKey && e.code === 'KeyD' && this.workspace === 'motion') {
      e.preventDefault();
      if (!this.editor.split()) this.onNotice?.('Move the playhead inside a layer to split it there.');
      return;
    }
    // copy / cut / paste drawings on the timeline (Shift+Ctrl+V pastes new copies)
    if (mod && this.workspace !== 'motion' && (e.code === 'KeyC' || e.code === 'KeyX' || e.code === 'KeyV')) {
      e.preventDefault();
      if (e.code === 'KeyC') this.copySelection();
      else if (e.code === 'KeyX') this.cutSelection();
      else void this.paste(e.shiftKey);
      return;
    }
    if (mod) return;
    if (e.altKey && this.workspace !== 'motion' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();
      this.moveSelection(e.code === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (['Space', 'KeyR', 'KeyZ'].includes(e.code)) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.held.has('Space')) this.spacePanned = false;
      }
      this.held.add(e.code);
      this.updateCursor();
      return;
    }
    if (this.workspace === 'motion') {
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        if (this.editor.keys.size) this.editor.deleteKeys();
        else this.editor.deleteLayers();
        return;
      }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyN' || e.code === 'KeyD' || e.code === 'Equal' || e.code === 'Minus') return;
    }
    switch (e.code) {
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        // With a scrub lock set, Shift + arrows flip through frames and snap home when Shift is released.
        if (e.shiftKey && this.lockFrame !== null && !this.scrubbing) this.beginScrub();
        if (e.code === 'ArrowRight') this.nextFrame();
        else if (e.code === 'ArrowLeft') this.prevFrame();
        else if (e.code === 'ArrowUp') this.nextDrawing();
        else this.prevDrawing();
        break;
      }
      case 'KeyO':
        this.toggleOnion();
        break;
      case 'KeyL':
        this.toggleLock();
        break;
      case 'Enter':
        e.preventDefault();
        this.togglePlay();
        break;
      case 'KeyN':
        if (this.workspace === 'board') this.addPanel();
        else this.addFrame();
        break;
      case 'KeyD':
        void this.duplicateSelection();
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this.deleteFrame();
        break;
      case 'Equal':
      case 'NumpadAdd':
        this.changeHold(1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        this.changeHold(-1);
        break;
      case 'KeyB':
        this.setTool('brush');
        break;
      case 'KeyE':
        this.setTool('eraser');
        break;
      case 'KeyP':
        this.setTool('pen');
        break;
      case 'KeyG':
        if (e.shiftKey && this.tool === 'fill') this.setFillMode(this.fillMode === 'tap' ? 'lasso' : this.fillMode === 'lasso' ? 'leftover' : 'tap');
        this.setTool('fill');
        break;
      case 'KeyX':
        // X switches the plane brushes write to; Shift+X shows or hides the X-sheet.
        if (e.shiftKey) this.onToggleXSheet();
        else this.togglePlane();
        break;
      case 'BracketLeft':
        this.resizeBrush(1 / 1.15);
        break;
      case 'BracketRight':
        this.resizeBrush(1.15);
        break;
      case 'KeyF':
        this.fit();
        break;
      case 'Digit1':
        // 1 / 2 / 3 / 4 set the exposure of the selected drawings; Shift+1 is 100% zoom.
        if (e.shiftKey) this.actualSize();
        else this.setExposure(1);
        break;
      case 'Digit2':
        this.setExposure(2);
        break;
      case 'Digit3':
        this.setExposure(3);
        break;
      case 'Digit4':
        this.setExposure(4);
        break;
      case 'Digit0':
        this.resetRotation();
        break;
      case 'KeyH':
        this.flipView();
        break;
      case 'Tab':
        // Tab = Quick Animate; Shift+Tab hides all interface (four-finger tap does too).
        e.preventDefault();
        if (e.shiftKey) this.toggleUI();
        else this.onToggleQuick();
        break;
    }
  }

  private updateCursor(): void {
    this.canvas.style.cursor = this.held.has('Space') ? 'grab' : this.held.has('KeyR') ? 'alias' : this.held.has('KeyZ') ? 'zoom-in' : 'crosshair';
  }

  private trackStats(e: PointerEvent, coalesced: number): void {
    this.moveCount += 1;
    this.coalescedCount += coalesced;
    const now = performance.now();
    const s = this.stats;
    s.pointerType = e.pointerType;
    s.pressure = e.pointerType === 'mouse' ? 1 : e.pressure;
    s.tilt = Math.round(Math.hypot(e.tiltX || 0, e.tiltY || 0));
    if (now - this.statsWindow >= 500) {
      const secs = (now - this.statsWindow) / 1000;
      s.hz = Math.round(this.coalescedCount / secs);
      s.coalesced = this.moveCount ? this.coalescedCount / this.moveCount : 1;
      this.moveCount = 0;
      this.coalescedCount = 0;
      this.statsWindow = now;
    }
    this.onStats();
  }

  // -------------------------------------------------------------------------------------------
  // Rendering

  private resize(): void {
    // Lite draws the screen canvas at fewer pixels (less memory and GPU work on weak devices)
    this.dpr = Math.min(window.devicePixelRatio || 1, this.device.limits.maxDpr);
    const w = Math.max(1, Math.round(this.viewW * this.dpr));
    const h = Math.max(1, Math.round(this.viewH * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // Fit once the stage has a real size (it can be 0 before first layout).
    if (!this.fitted && this.viewW > 100 && this.viewH > 100) {
      this.fitted = true;
      this.view.fit(this.docW, this.docH, this.viewW, this.viewH);
    }
    this.requestRender();
  }

  private render(): void {
    this.needsRender = false;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = getComputedStyle(document.body).getPropertyValue('--workspace') || '#2b2b31';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const m = new DOMMatrix().scale(this.dpr, this.dpr).multiply(this.view.matrix());
    g.setTransform(m);
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 24 * this.dpr;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, this.docW, this.docH);
    g.shadowBlur = 0;
    g.shadowColor = 'transparent';

    g.imageSmoothingEnabled = this.view.zoom < 2;
    this.residency.use(this.workingSet());
    if (this.workspace === 'motion') {
      // inside a precomp: the comp above, faint, placed so this comp sits where its layer puts it
      const ctx = this.editor.showContext ? this.editor.context() : null;
      if (ctx) {
        g.save();
        const m = invert(worldMatrix(ctx.parent, ctx.layer, ctx.frame));
        g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        drawComp(g, this.project, ctx.parent, ctx.frame, { camera: false, skip: ctx.layer.id, alpha: 0.28 });
        g.restore();
      }
      drawComp(g, this.project, this.project.comp.id, this.frame, { camera: this.editor.throughCamera });
      drawMotionOverlay(g, this.editor, this.view, this.dpr);
      return;
    }
    const comp = this.project.comp;
    const activeId = this.project.layer.id;
    const others = this.showLayers ? this.otherAlpha : 0;
    const around = others > 0 || this.boardAlpha > 0;
    if (around) drawLayersAround(g, this.project, comp, this.frame, activeId, 'below', others, this.boardAlpha);
    this.drawOnion(g);
    if (this.blankPage && !this.live) {
      if (around) drawLayersAround(g, this.project, comp, this.frame, activeId, 'above', others, this.boardAlpha);
      return;
    }
    const live = this.live;
    const d = live ? live.drawing : this.drawing;
    if (d.parked) {
      // Coming back from storage (a few ms): show its thumbnail stretched meanwhile.
      if (d.thumb) g.drawImage(d.thumb, 0, 0, this.docW, this.docH);
      for (const v of d.vectors) drawVectorStroke(g, v, this.lengthOf(v));
      return;
    }
    const rasterLive = live && live.record.tool !== 'pen' ? live : null;
    const fillSrc = rasterLive && rasterLive.plane === 'fill' ? this.raster.displaySource() : d.fill;
    const lineSrc = rasterLive && rasterLive.plane === 'line' ? this.raster.displaySource() : d.line;
    // the layer's Line / Fill parts: hidden or faded here too (a hidden part being drawn on shows faintly)
    const fillA = this.partAlpha('fill');
    const lineA = this.partAlpha('line');
    g.globalAlpha = fillA;
    if (fillSrc && fillA > 0) g.drawImage(fillSrc, 0, 0);
    g.globalAlpha = lineA;
    if (lineA > 0) g.drawImage(lineSrc, 0, 0);
    g.globalAlpha = 1;

    // Predicted input: drawn ahead of the real stroke this frame only (lower perceived latency).
    if (live && live.predicted.length && live.record.brush.smoothing < 0.15) {
      if (live.record.tool === 'pen') {
        // drawn with the live pen stroke below
      } else {
        const w = live.walker.clone();
        const ghost = live.predicted.flatMap((p) => w.push(p));
        this.raster.drawGhost(g, ghost);
      }
    }

    g.globalAlpha = lineA;
    if (lineA > 0) for (const v of d.vectors) drawVectorStroke(g, v, this.lengthOf(v));
    g.globalAlpha = 1;
    if (live && live.record.tool === 'pen') {
      const extra = live.record.brush.smoothing < 0.15 ? live.predicted : [];
      drawVectorStroke(g, { ...live.record, points: [...live.record.points, ...extra] });
    }

    if (around) drawLayersAround(g, this.project, comp, this.frame, activeId, 'above', others, this.boardAlpha);
    this.drawFillPath(g);
    if (this.view.zoom >= 8) this.drawPixelGrid(g);
  }

  /** Is this part (Line or Fill) of the active layer shown? */
  partVisible(name: PartName): boolean {
    return partOf(this.project.layer, name).visible;
  }

  /** Show or hide the lines or the colour of the active layer (one undo step). */
  togglePart(name: PartName): void {
    if (this.live || this.workspace === 'motion') return;
    const l = this.project.editLayer();
    this.editor.setPart(l.id, name, { visible: !partOf(l, name).visible });
  }

  /** How strongly the Draw view shows a part of the active layer (0 = hidden). */
  private partAlpha(name: PartName): number {
    const p = partOf(this.project.layer, name);
    const a = p.visible ? Math.max(0, Math.min(1, valueAt(p.opacity, this.layerFrame) / 100)) : 0;
    const target = this.tool === 'pen' ? 'line' : this.plane;
    return target === name ? Math.max(a, 0.25) : a;
  }

  /**
   * The drawings that must be live right now, most important first: the current one, its onion
   * neighbours, and during playback the drawings coming up in the next second and a half.
   */
  private workingSet(): Drawing[] {
    const p = this.project;
    if (this.workspace === 'motion') {
      // everything the comp shows at this frame (through precomps), and what is coming up in playback
      const out = new Set<Drawing>();
      const add = (f: number) => {
        for (const id of frameContent(p.comps, p.comp.id, f).drawings) {
          const d = p.drawings.get(id);
          if (d) out.add(d);
        }
      };
      add(this.frame);
      const ctx = this.editor.showContext ? this.editor.context() : null;
      if (ctx)
        for (const id of frameContent(p.comps, ctx.parent, ctx.frame).drawings) {
          const d = p.drawings.get(id);
          if (d) out.add(d);
        }
      if (this.playing) {
        const len = this.compEnd;
        for (let i = 1; i <= Math.ceil(p.fps * 1.5) && i < len; i++) add((this.frame + i) % len);
      }
      return [...out];
    }
    const out = new Set<Drawing>([this.live?.drawing ?? this.drawing]);
    if (this.showLayers || this.boardAlpha > 0)
      for (const id of frameContent(p.comps, p.comp.id, this.frame).drawings) {
        const d = p.drawings.get(id);
        if (d) out.add(d);
      }
    const o = this.onion;
    if (o.enabled) {
      const keys = o.keysOnly ? (id: string) => p.drawing(id).role === 'key' : undefined;
      const n = neighborDrawings(p.exposures, this.lf, o.before, o.after, keys);
      for (const nb of [...n.before, ...n.after]) out.add(p.drawing(nb.drawing));
    }
    if (this.playing) {
      const ahead = Math.ceil(p.fps * 1.5);
      const len = p.length;
      for (let i = 1; i <= ahead && i < len; i++) {
        const id = drawingAt(p.exposures, (this.lf + i) % len);
        if (id) out.add(p.drawing(id));
      }
    }
    return [...out];
  }

  /** Ghosts of the neighboring drawings: previous in blue, next in red, fading with distance. */
  private drawOnion(g: CanvasRenderingContext2D): void {
    const o = this.onion;
    if ((!o.enabled && !this.blankPage) || this.playing || (this.scrubbing && !o.whileScrubbing)) return;
    const keys = o.keysOnly ? (id: string) => this.project.drawing(id).role === 'key' : undefined;
    const n = neighborDrawings(this.project.exposures, this.lf, o.before, o.after, keys);
    if (this.blankPage && !this.live) {
      // the blank page comes after the last drawing: it and the ones before it are all "before"
      const cur = this.drawing.id;
      n.before = [{ drawing: cur, distance: 1 }, ...n.before.map((b) => ({ ...b, distance: b.distance + 1 }))].slice(0, Math.max(1, o.before));
      n.after = [];
    }
    const draw = (list: typeof n.before, color: string) => {
      for (const nb of list) {
        const d = this.project.drawing(nb.drawing);
        const ghost = this.onionCache.ghost(d, o.tint ? color : null);
        if (!ghost) continue; // still coming back; drawn on the next frame
        g.globalAlpha = o.opacity * Math.pow(o.falloff, nb.distance - 1);
        g.drawImage(ghost, 0, 0);
      }
    };
    // Farther ghosts first so the nearest sits on top.
    draw([...n.before].reverse(), o.beforeColor);
    draw([...n.after].reverse(), o.afterColor);
    g.globalAlpha = 1;
  }

  private drawPixelGrid(g: CanvasRenderingContext2D): void {
    const inv = this.view.matrix().inverse();
    const corners = [
      inv.transformPoint(new DOMPoint(0, 0)),
      inv.transformPoint(new DOMPoint(this.viewW, 0)),
      inv.transformPoint(new DOMPoint(0, this.viewH)),
      inv.transformPoint(new DOMPoint(this.viewW, this.viewH)),
    ];
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
    const x1 = Math.min(this.docW, Math.ceil(Math.max(...corners.map((c) => c.x))));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
    const y1 = Math.min(this.docH, Math.ceil(Math.max(...corners.map((c) => c.y))));
    g.beginPath();
    for (let x = x0; x <= x1; x++) {
      g.moveTo(x, y0);
      g.lineTo(x, y1);
    }
    for (let y = y0; y <= y1; y++) {
      g.moveTo(x0, y);
      g.lineTo(x1, y);
    }
    g.lineWidth = 1 / this.view.zoom;
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.stroke();
  }
}

function loadJSON<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); settings just won't persist.
  }
}
