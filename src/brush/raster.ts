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

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: false });
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

// ---------------------------------------------------------------------------------------------

export interface StrokeCommit {
  rect: Rect;
  before: ImageData;
  after: ImageData;
}

/**
 * Raster painting for one layer. A stroke renders its dabs into `buffer` (coverage builds up with
 * flow), then composites once onto `layer` at the stroke opacity (Photoshop-style Opacity vs Flow).
 * While a stroke is live, `displaySource()` returns what the screen should show for the layer.
 */
export class RasterEngine {
  readonly layer: HTMLCanvasElement;
  private readonly buffer: HTMLCanvasElement;
  private readonly grained: HTMLCanvasElement;
  private readonly work: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  private readonly bctx: CanvasRenderingContext2D;
  private record: StrokeRecord | null = null;
  private tip: HTMLCanvasElement | null = null;
  private bbox: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.layer = makeCanvas(width, height);
    this.buffer = makeCanvas(width, height);
    this.grained = makeCanvas(width, height);
    this.work = makeCanvas(width, height);
    this.lctx = ctx2d(this.layer);
    this.bctx = ctx2d(this.buffer);
  }

  get active(): StrokeRecord | null {
    return this.record;
  }

  begin(record: StrokeRecord): void {
    this.record = record;
    this.tip = tipSprite(record.brush.hardness, record.tool === 'eraser' ? '#000000' : record.color);
    this.bbox = null;
    this.bctx.clearRect(0, 0, this.width, this.height);
  }

  addDabs(dabs: Dab[]): void {
    if (!this.tip) return;
    for (const d of dabs) {
      drawDab(this.bctx, d, this.tip);
      this.grow(d);
    }
    this.bctx.globalAlpha = 1;
  }

  /** Draw extra, temporary dabs (predicted input) straight onto a display context. */
  drawGhost(ctx: CanvasRenderingContext2D, dabs: Dab[]): void {
    if (!this.tip || !this.record || this.record.tool === 'eraser') return;
    for (const d of dabs) drawDab(ctx, d, this.tip, this.record.brush.opacity);
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

  /** The stroke image with paper grain applied (or the raw buffer). */
  private strokeImage(r: Rect): HTMLCanvasElement {
    const grain = this.record?.brush.grain ?? 0;
    if (grain <= 0) return this.buffer;
    const g = ctx2d(this.grained);
    g.save();
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(this.buffer, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = grain;
    const pat = g.createPattern(grainCanvas(), 'repeat');
    if (pat) {
      const s = this.record?.brush.grainScale ?? 1;
      pat.setTransform(new DOMMatrix().scale(s, s));
      g.fillStyle = pat;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    g.restore();
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
   * What to draw for this layer right now. With no live stroke: the layer. With a live stroke:
   * a work canvas holding layer + stroke (so the eraser previews correctly).
   */
  displaySource(): HTMLCanvasElement {
    const r = this.rect();
    if (!this.record || !r) return this.layer;
    const w = ctx2d(this.work);
    w.clearRect(0, 0, this.width, this.height);
    w.drawImage(this.layer, 0, 0);
    this.apply(w, r);
    return this.work;
  }

  /**
   * Finish the stroke: re-render it from data (now the length is known, the end taper applies),
   * composite onto the layer, and return before/after pixels for undo.
   */
  commit(): StrokeCommit | null {
    const rec = this.record;
    if (!rec) return null;
    if (rec.brush.taperEnd > 0 && rec.tool !== 'pen') {
      this.bctx.clearRect(0, 0, this.width, this.height);
      this.bbox = null;
      this.addDabs(dabsForStroke(rec.brush, rec.seed, rec.points, strokeLength(rec.points)));
    }
    const r = this.rect();
    let result: StrokeCommit | null = null;
    if (r) {
      const before = this.lctx.getImageData(r.x, r.y, r.w, r.h);
      this.apply(this.lctx, r);
      const after = this.lctx.getImageData(r.x, r.y, r.w, r.h);
      result = { rect: r, before, after };
    }
    this.record = null;
    this.bbox = null;
    this.bctx.clearRect(0, 0, this.width, this.height);
    return result;
  }

  cancel(): void {
    this.record = null;
    this.bbox = null;
    this.bctx.clearRect(0, 0, this.width, this.height);
  }

  put(rect: Rect, data: ImageData): void {
    this.lctx.putImageData(data, rect.x, rect.y);
  }

  snapshot(): ImageData {
    return this.lctx.getImageData(0, 0, this.width, this.height);
  }

  clear(): void {
    this.lctx.clearRect(0, 0, this.width, this.height);
  }
}
