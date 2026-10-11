import type { StrokeRecord } from '../core/stroke';
import { hash01 } from '../core/rng';
import { strokeLength } from '../core/stroke';
import { dabsForStroke, type Dab } from './dabs';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

/** Integer pixel rectangle. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function putPixels(canvas: HTMLCanvasElement, rect: Rect, data: ImageData): void {
  ctx2d(canvas).putImageData(data, rect.x, rect.y);
}

// ---------------------------------------------------------------------------------------------
// Brush tip sprites (cached by hardness and color)

const tipCache = new Map<string, HTMLCanvasElement>();
const TIP = 128;

export function tipSprite(hardness: number, color: string): HTMLCanvasElement {
  const h = Math.round(Math.min(0.98, Math.max(0, hardness)) * 20) / 20;
  const key = `${h}|${color}`;
  const hit = tipCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(TIP, TIP);
  const g = ctx2d(c);
  const r = TIP / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  // Solid core up to `h`, then a smooth (smoothstep) falloff to the edge.
  grad.addColorStop(0, withAlpha(color, 1));
  const steps = 10;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const a = 1 - t * t * (3 - 2 * t);
    grad.addColorStop(h + (1 - h) * t, withAlpha(color, a));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, TIP, TIP);
  tipCache.set(key, c);
  return c;
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

export function drawDab(ctx: CanvasRenderingContext2D, dab: Dab, tip: HTMLCanvasElement, alphaScale = 1): void {
  const r = dab.size / 2;
  ctx.globalAlpha = Math.min(1, dab.alpha * alphaScale);
  if (dab.roundness >= 0.999) {
    ctx.drawImage(tip, dab.x - r, dab.y - r, dab.size, dab.size);
    return;
  }
  ctx.save();
  ctx.translate(dab.x, dab.y);
  ctx.rotate(dab.angle);
  ctx.scale(1, dab.roundness);
  ctx.drawImage(tip, -r, -r, dab.size, dab.size);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Paper grain: a tiling value-noise texture aligned to the canvas (not to the stroke)

let grainTile: HTMLCanvasElement | null = null;

function grainCanvas(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const N = 256;
  const c = makeCanvas(N, N);
  const g = ctx2d(c);
  const img = g.createImageData(N, N);
  const cell = 8;
  const grid = N / cell;
  const val = (gx: number, gy: number) => hash01(1234, ((gy % grid) * grid + (gx % grid)) | 0, 7);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const top = val(gx, gy) * (1 - sx) + val(gx + 1, gy) * sx;
      const bot = val(gx, gy + 1) * (1 - sx) + val(gx + 1, gy + 1) * sx;
      const coarse = top * (1 - sy) + bot * sy;
      const fine = hash01(99, y * N + x, 3);
      const v = Math.pow(coarse * 0.6 + fine * 0.4, 1.6);
      const i = (y * N + x) * 4;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Remove coverage through the paper grain (canvas-aligned, so texture stays put across strokes). */
function applyGrain(g: CanvasRenderingContext2D, r: Rect, strength: number, scale: number): void {
  if (strength <= 0) return;
  const pat = g.createPattern(grainCanvas(), 'repeat');
  if (!pat) return;
  pat.setTransform(new DOMMatrix().scale(scale, scale));
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = Math.min(1, strength);
  g.fillStyle = pat;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.restore();
}

// ---------------------------------------------------------------------------------------------

export interface StrokeCommit {
  rect: Rect;
  before: ImageData;
  after: ImageData;
}

/**
 * Raster painting onto one bound canvas (the current drawing). A stroke renders its dabs into
 * buffers (coverage builds up with flow), then composites once onto the canvas at the stroke
 * opacity (Photoshop-style Opacity vs Flow). Tilt-shaded dabs go to a second buffer with a soft
 * tip and their own, stronger grain. While a stroke is live, `displaySource()` returns what the
 * screen should show for the bound canvas.
 */
export class RasterEngine {
  private target: HTMLCanvasElement;
  private readonly buffer: HTMLCanvasElement;
  private readonly shadeBuffer: HTMLCanvasElement;
  private readonly grained: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly work: HTMLCanvasElement;
  private readonly bctx: CanvasRenderingContext2D;
  private readonly sctx: CanvasRenderingContext2D;
  private record: StrokeRecord | null = null;
  private tip: HTMLCanvasElement | null = null;
  private shadeTip: HTMLCanvasElement | null = null;
  private hasShade = false;
  private bbox: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(
    public width: number,
    public height: number,
  ) {
    this.target = makeCanvas(width, height);
    this.buffer = makeCanvas(width, height);
    this.shadeBuffer = makeCanvas(width, height);
    this.grained = makeCanvas(width, height);
    this.scratch = makeCanvas(width, height);
    this.work = makeCanvas(width, height);
    this.bctx = ctx2d(this.buffer);
    this.sctx = ctx2d(this.shadeBuffer);
  }

  /** Match another document size (a different project was opened). Only call between strokes. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    for (const c of [this.buffer, this.shadeBuffer, this.grained, this.scratch, this.work]) {
      c.width = width;
      c.height = height;
    }
  }

  /** The canvas strokes paint onto. */
  get bound(): HTMLCanvasElement {
    return this.target;
  }

  bind(canvas: HTMLCanvasElement): void {
    if (this.record) return;
    this.target = canvas;
  }

  get active(): StrokeRecord | null {
    return this.record;
  }

  begin(record: StrokeRecord): void {
    this.record = record;
    const color = record.tool === 'eraser' ? '#000000' : record.color;
    this.tip = tipSprite(record.brush.hardness, color);
    this.shadeTip = tipSprite(record.brush.tiltShade.hardness, color);
    this.hasShade = false;
    this.bbox = null;
    this.bctx.clearRect(0, 0, this.width, this.height);
    this.sctx.clearRect(0, 0, this.width, this.height);
  }

  addDabs(dabs: Dab[]): void {
    if (!this.tip || !this.shadeTip) return;
    for (const d of dabs) {
      if (d.shade < 1) drawDab(this.bctx, d, this.tip, 1 - d.shade);
      if (d.shade > 0) {
        drawDab(this.sctx, d, this.shadeTip, d.shade);
        this.hasShade = true;
      }
      this.grow(d);
    }
    this.bctx.globalAlpha = 1;
    this.sctx.globalAlpha = 1;
  }

  /** Draw extra, temporary dabs (predicted input) straight onto a display context. */
  drawGhost(ctx: CanvasRenderingContext2D, dabs: Dab[]): void {
    if (!this.tip || !this.shadeTip || !this.record || this.record.tool === 'eraser') return;
    for (const d of dabs) drawDab(ctx, d, d.shade > 0.5 ? this.shadeTip : this.tip, this.record.brush.opacity);
    ctx.globalAlpha = 1;
  }

  private grow(d: Dab): void {
    const r = d.size / 2 + 2;
    const b = this.bbox;
    if (!b) {
      this.bbox = { x0: d.x - r, y0: d.y - r, x1: d.x + r, y1: d.y + r };
      return;
    }
    b.x0 = Math.min(b.x0, d.x - r);
    b.y0 = Math.min(b.y0, d.y - r);
    b.x1 = Math.max(b.x1, d.x + r);
    b.y1 = Math.max(b.y1, d.y + r);
  }

  rect(): Rect | null {
    const b = this.bbox;
    if (!b) return null;
    const x = Math.max(0, Math.floor(b.x0));
    const y = Math.max(0, Math.floor(b.y0));
    const x1 = Math.min(this.width, Math.ceil(b.x1));
    const y1 = Math.min(this.height, Math.ceil(b.y1));
    if (x1 <= x || y1 <= y) return null;
    return { x, y, w: x1 - x, h: y1 - y };
  }

  /** The stroke image: normal buffer and shade buffer, each with its own paper grain. */
  private strokeImage(r: Rect): HTMLCanvasElement {
    const b = this.record?.brush;
    if (!b) return this.buffer;
    if (b.grain <= 0 && !this.hasShade) return this.buffer;
    const g = ctx2d(this.grained);
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(this.buffer, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    applyGrain(g, r, b.grain, b.grainScale);
    if (this.hasShade) {
      const s = ctx2d(this.scratch);
      s.clearRect(r.x, r.y, r.w, r.h);
      s.drawImage(this.shadeBuffer, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      applyGrain(s, r, b.tiltShade.grain, b.grainScale);
      g.drawImage(this.scratch, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    }
    return this.grained;
  }

  private apply(target: CanvasRenderingContext2D, r: Rect): void {
    const rec = this.record;
    if (!rec) return;
    const img = this.strokeImage(r);
    target.save();
    target.globalAlpha = rec.brush.opacity;
    target.globalCompositeOperation = rec.tool === 'eraser' ? 'destination-out' : 'source-over';
    target.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    target.restore();
  }

  /**
   * What to draw for the bound canvas right now. With no live stroke: the canvas itself. With a
   * live stroke: a work canvas holding canvas + stroke (so the eraser previews correctly).
   */
  displaySource(): HTMLCanvasElement {
    const r = this.rect();
    if (!this.record || !r) return this.target;
    const w = ctx2d(this.work);
    w.clearRect(0, 0, this.width, this.height);
    w.drawImage(this.target, 0, 0);
    this.apply(w, r);
    return this.work;
  }

  /**
   * Finish the stroke: re-render it from data (now the length is known, the end taper applies),
   * composite onto the bound canvas, and return before/after pixels for undo.
   */
  commit(): StrokeCommit | null {
    const rec = this.record;
    if (!rec) return null;
    if (rec.brush.taperEnd > 0) {
      this.bctx.clearRect(0, 0, this.width, this.height);
      this.sctx.clearRect(0, 0, this.width, this.height);
      this.bbox = null;
      this.hasShade = false;
      this.addDabs(dabsForStroke(rec.brush, rec.seed, rec.points, strokeLength(rec.points)));
    }
    const r = this.rect();
    let result: StrokeCommit | null = null;
    if (r) {
      const tctx = ctx2d(this.target);
      const before = tctx.getImageData(r.x, r.y, r.w, r.h);
      this.apply(tctx, r);
      const after = tctx.getImageData(r.x, r.y, r.w, r.h);
      result = { rect: r, before, after };
    }
    this.cancel();
    return result;
  }

  cancel(): void {
    this.record = null;
    this.bbox = null;
    this.hasShade = false;
    this.bctx.clearRect(0, 0, this.width, this.height);
    this.sctx.clearRect(0, 0, this.width, this.height);
  }
}
