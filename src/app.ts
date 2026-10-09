import { cloneBrush, PRESETS, type BrushSettings } from './core/brush';
import { History } from './core/history';
import { newSeed } from './core/rng';
import { newStrokeId, strokeLength, type StrokePoint, type StrokeRecord, type Tool } from './core/stroke';
import { DabWalker } from './brush/dabs';
import { RasterEngine } from './brush/raster';
import { Smoother } from './brush/smoothing';
import { drawVectorStroke } from './brush/vector';
import { snapRotation, Viewport } from './view/viewport';

const BRUSH_KEY = '2dope.m0.brush';
const COLOR_KEY = '2dope.m0.color';

interface LiveStroke {
  record: StrokeRecord;
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

export class App {
  readonly docW = 1920;
  readonly docH = 1080;
  readonly raster = new RasterEngine(this.docW, this.docH);
  vectors: StrokeRecord[] = [];
  readonly history = new History();
  readonly view = new Viewport();

  brush: BrushSettings;
  color: string;
  tool: Tool = 'brush';
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stage: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    // Merge over the default so brushes saved by older builds gain new fields.
    this.brush = { ...cloneBrush(PRESETS[0]!), ...(loadJSON<Partial<BrushSettings>>(BRUSH_KEY) ?? {}) };
    this.color = loadJSON<string>(COLOR_KEY) ?? '#1d1d24';
    this.bindEvents();
    this.resize();
    const loop = () => {
      if (this.needsRender) this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
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
  }

  // -------------------------------------------------------------------------------------------
  // Commands

  undo(): void {
    if (this.live) return;
    this.history.undo();
    this.requestRender();
  }

  redo(): void {
    if (this.live) return;
    this.history.redo();
    this.requestRender();
  }

  clearAll(): void {
    const before = this.raster.snapshot();
    const vectors = this.vectors;
    this.history.push(
      {
        label: 'Clear canvas',
        do: () => {
          this.raster.clear();
          this.vectors = [];
        },
        undo: () => {
          this.raster.put({ x: 0, y: 0, w: this.docW, h: this.docH }, before);
          this.vectors = vectors;
        },
      },
      false,
    );
    this.requestRender();
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

  exportPNG(): void {
    const c = document.createElement('canvas');
    c.width = this.docW;
    c.height = this.docH;
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(this.raster.layer, 0, 0);
    for (const v of this.vectors) drawVectorStroke(g, v, this.lengthOf(v));
    const a = document.createElement('a');
    a.download = `2dope-${Date.now()}.png`;
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
    return { x: d.x, y: d.y, pressure, tiltX, tiltY, t: e.timeStamp - t0 };
  }

  private beginStroke(e: PointerEvent): void {
    const tool = this.tool;
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
      pointerId: e.pointerId,
      t0,
      smoother: new Smoother(record.brush.smoothing, record.brush.pulledString, this.view.zoom),
      walker: new DabWalker(record.brush, record.seed),
      lastRaw: first,
      predicted: [],
    };
    if (tool !== 'pen') this.raster.begin(record);
    this.feed(first);
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
    if (rec.tool === 'pen') {
      const id = rec.id;
      this.history.push(
        {
          label: 'Vector stroke',
          do: () => {
            this.vectors = [...this.vectors, rec];
          },
          undo: () => {
            this.vectors = this.vectors.filter((v) => v.id !== id);
          },
        },
        false,
      );
    } else {
      const c = this.raster.commit();
      if (c) {
        this.history.push({
          label: rec.tool === 'eraser' ? 'Erase' : 'Brush stroke',
          do: () => this.raster.put(c.rect, c.after),
          undo: () => this.raster.put(c.rect, c.before),
        });
      }
    }
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
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari's own pinch-zoom gestures must not move the page.
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(t, (e) => e.preventDefault());
    }
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(this.stage);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.held.clear());
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
      if (this.touches.size === 1 && this.fingerPaint) {
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
    const mode: NavMode | null =
      e.button === 1 || this.held.has('Space') ? 'pan' : this.held.has('KeyR') ? 'rotate' : this.held.has('KeyZ') ? 'zoom' : null;
    if (mode) {
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
    this.beginStroke(e);
    this.requestRender();
  }

  private liveIsTouch(): boolean {
    return this.live !== null && this.touches.has(this.live.pointerId);
  }

  private onMove(e: PointerEvent): void {
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
      if (this.tapSession && Math.hypot(p.x - t.sx, p.y - t.sy) > 10) this.tapSession.moved = true;
      this.touchNavigate(e.pointerId, p);
      return;
    }
    if (e.pointerType === 'pen') this.trackStats(e, 1);
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
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
      v.rot = snapRotation(pinch.startRot + ((ang - pinch.startAng) * 180) / Math.PI * (v.flipped ? -1 : 1));
      v.anchor(pinch.anchor, mid.x, mid.y);
      this.requestRender();
      return;
    }
    if (this.touches.size === 1 && !this.fingerPaint) {
      const t = this.touches.get(id)!;
      // One finger pans (the pen always draws, fingers navigate).
      const prev = (t as TouchInfo & { px?: number; py?: number });
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
    if (!down) {
      this.held.delete(e.code);
      this.updateCursor();
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
    if (mod) return;
    if (['Space', 'KeyR', 'KeyZ'].includes(e.code)) {
      if (e.code === 'Space') e.preventDefault();
      this.held.add(e.code);
      this.updateCursor();
      return;
    }
    switch (e.code) {
      case 'KeyB':
        this.setTool('brush');
        break;
      case 'KeyE':
        this.setTool('eraser');
        break;
      case 'KeyP':
        this.setTool('pen');
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
        this.actualSize();
        break;
      case 'Digit0':
        this.resetRotation();
        break;
      case 'KeyH':
        this.flipView();
        break;
      case 'Tab':
        e.preventDefault();
        this.toggleUI();
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
    this.dpr = window.devicePixelRatio || 1;
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
    g.drawImage(this.raster.displaySource(), 0, 0);

    const live = this.live;
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

    for (const v of this.vectors) drawVectorStroke(g, v, this.lengthOf(v));
    if (live && live.record.tool === 'pen') {
      const extra = live.record.brush.smoothing < 0.15 ? live.predicted : [];
      drawVectorStroke(g, { ...live.record, points: [...live.record.points, ...extra] });
    }

    if (this.view.zoom >= 8) this.drawPixelGrid(g);
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
