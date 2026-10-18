import { symmetryCopies } from '../core/adjust';
import type { StrokeRecord } from '../core/stroke';
import { hash01 } from '../core/rng';
import { jitterColor, mixColor } from '../core/color';
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

/** Hard pixel edges: alpha at or above half becomes solid, below half becomes empty (no anti-aliasing). */
export function hardenAlpha(g: CanvasRenderingContext2D, r: Rect): void {
  const img = g.getImageData(r.x, r.y, r.w, r.h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i]! >= 128 ? 255 : 0;
  g.putImageData(img, r.x, r.y);
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
  if (tipCache.size > 600) tipCache.clear();
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

// Image tips: a picture as the dab (white or opaque paints). Decoded once into an alpha mask, then
// coloured per stroke colour. Decoding is asynchronous, so a tip is loaded before it is drawn with;
// until then the round tip stands in.
const tipMasks = new Map<string, HTMLCanvasElement | 'loading' | 'failed'>();
const tipColored = new Map<string, HTMLCanvasElement>();

/** Decode an image tip (cached). Resolves when it can be drawn with. */
export function loadTip(url: string): Promise<void> {
  const have = tipMasks.get(url);
  if (have && have !== 'loading') return Promise.resolve();
  tipMasks.set(url, 'loading');
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = makeCanvas(TIP, TIP);
      const g = ctx2d(c);
      const s = Math.min(TIP / img.width, TIP / img.height);
      g.drawImage(img, (TIP - img.width * s) / 2, (TIP - img.height * s) / 2, img.width * s, img.height * s);
      const d = g.getImageData(0, 0, TIP, TIP);
      // no transparency in the picture: brightness is the paint (white paints, black does not)
      let opaque = true;
      for (let i = 3; i < d.data.length; i += 4) if (d.data[i]! < 250) { opaque = false; break; }
      for (let i = 0; i < d.data.length; i += 4) {
        const a = opaque ? (d.data[i]! * 0.3 + d.data[i + 1]! * 0.59 + d.data[i + 2]! * 0.11) : d.data[i + 3]!;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
        d.data[i + 3] = a;
      }
      g.putImageData(d, 0, 0);
      tipMasks.set(url, c);
      resolve();
    };
    img.onerror = () => { tipMasks.set(url, 'failed'); resolve(); };
    img.src = url;
  });
}

/** The image tip in a colour, or null while it is not loaded (the round tip is used then). */
export function imageTipSprite(url: string, color: string): HTMLCanvasElement | null {
  const mask = tipMasks.get(url);
  if (!mask || mask === 'loading' || mask === 'failed') {
    if (!mask) void loadTip(url);
    return null;
  }
  const key = `${url.length}:${url.slice(-48)}|${color}`;
  const hit = tipColored.get(key);
  if (hit) return hit;
  if (tipColored.size > 600) tipColored.clear();
  const c = makeCanvas(TIP, TIP);
  const g = ctx2d(c);
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, TIP, TIP);
  tipColored.set(key, c);
  return c;
}

/** The dabs and their symmetry copies (Drawing Guide), or the dabs as they are. */
function mirrored(dabs: Dab[], record: StrokeRecord | null): Dab[] {
  const sym = record?.sym;
  if (!sym || sym.mode === 'off') return dabs;
  const out: Dab[] = [];
  for (const d of dabs) for (const c of symmetryCopies(sym.mode, sym.cx, sym.cy, d.x, d.y, d.angle)) out.push({ ...d, x: c.x, y: c.y, angle: c.angle });
  return out;
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

// Grain pictures (Procreate's grain source): decoded once into a "hold back" mask, black = most.
const grainMasks = new Map<string, HTMLCanvasElement | 'loading' | 'failed'>();

/** Decode a grain picture (cached). Resolves when it can be used; the built-in grain stands in until then. */
export function loadGrain(url: string): Promise<void> {
  const have = grainMasks.get(url);
  if (have && have !== 'loading') return Promise.resolve();
  grainMasks.set(url, 'loading');
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.min(512, img.width)), h = Math.max(1, Math.min(512, img.height));
      const c = makeCanvas(w, h);
      const g = ctx2d(c);
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 4) {
        // light paper takes paint, dark paper holds it back (see-through counts as dark)
        const lum = (d.data[i]! * 0.3 + d.data[i + 1]! * 0.59 + d.data[i + 2]! * 0.11) * (d.data[i + 3]! / 255);
        d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
        d.data[i + 3] = 255 - lum;
      }
      g.putImageData(d, 0, 0);
      grainMasks.set(url, c);
      resolve();
    };
    img.onerror = () => { grainMasks.set(url, 'failed'); resolve(); };
    img.src = url;
  });
}

function grainFor(url: string | undefined): HTMLCanvasElement {
  if (!url) return grainCanvas();
  const m = grainMasks.get(url);
  if (m && m !== 'loading' && m !== 'failed') return m;
  if (!m) void loadGrain(url);
  return grainCanvas();
}

/** Remove coverage through the paper grain (canvas-aligned, so texture stays put across strokes). */
function applyGrain(g: CanvasRenderingContext2D, r: Rect, strength: number, scale: number, image?: string): void {
  if (strength <= 0) return;
  const pat = g.createPattern(grainFor(image), 'repeat');
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
  /** Colour dynamics / wet mix: each dab has its own colour (seeded by the stroke and dab index). */
  private dabColour = false;
  private strokeColour = '#000000';
  private dabIndex = 0;
  /** Wet mix: the canvas as the stroke began (the colour the brush picks up). */
  private pullFrom: Uint8ClampedArray | null = null;

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

  /** The tip in a colour (the picture tip when it has decoded, the round one otherwise). */
  private tipIn(color: string): HTMLCanvasElement {
    const b = this.record!.brush;
    return (b.tipImage ? imageTipSprite(b.tipImage, color) : null) ?? tipSprite(b.hardness, color);
  }

  begin(record: StrokeRecord): void {
    this.record = record;
    const b = record.brush;
    let color = record.tool === 'eraser' ? '#000000' : record.color;
    const jit = { hue: b.hueJitter ?? 0, sat: b.satJitter ?? 0, bright: b.brightJitter ?? 0 };
    const varies = record.tool !== 'eraser' && (jit.hue > 0 || jit.sat > 0 || jit.bright > 0);
    // colour dynamics per stroke: one shift for the whole stroke
    if (varies && b.strokeColor) color = jitterColor(color, jit, hash01(record.seed, 0, 71), hash01(record.seed, 0, 72), hash01(record.seed, 0, 73));
    this.strokeColour = color;
    this.dabIndex = 0;
    const pull = record.tool === 'eraser' ? 0 : (b.wetPull ?? 0);
    this.dabColour = (varies && !b.strokeColor) || pull > 0;
    this.pullFrom = pull > 0 ? ctx2d(this.target).getImageData(0, 0, this.width, this.height).data : null;
    this.tip = this.tipIn(color);
    this.shadeTip = tipSprite(record.brush.tiltShade.hardness, color);
    this.hasShade = false;
    this.bbox = null;
    this.bctx.clearRect(0, 0, this.width, this.height);
    this.sctx.clearRect(0, 0, this.width, this.height);
  }

  addDabs(dabs: Dab[]): void {
    if (!this.tip || !this.shadeTip) return;
    const rec = this.record!;
    const b = rec.brush;
    for (const d of mirrored(dabs, this.record)) {
      let tip = this.tip;
      if (this.dabColour) {
        const i = ++this.dabIndex;
        let c = b.strokeColor ? this.strokeColour : jitterColor(this.strokeColour, { hue: b.hueJitter ?? 0, sat: b.satJitter ?? 0, bright: b.brightJitter ?? 0 }, hash01(rec.seed, i, 81), hash01(rec.seed, i, 82), hash01(rec.seed, i, 83));
        const src = this.pullFrom;
        if (src) {
          // wet mix: pick up the colour under the dab, as much as there is paint there
          const x = Math.max(0, Math.min(this.width - 1, Math.round(d.x))), y = Math.max(0, Math.min(this.height - 1, Math.round(d.y)));
          const k = (y * this.width + x) * 4;
          const a = src[k + 3]! / 255;
          if (a > 0) c = mixColor(c, [src[k]!, src[k + 1]!, src[k + 2]!], (b.wetPull ?? 0) * a);
        }
        tip = this.tipIn(c);
      }
      if (d.shade < 1) drawDab(this.bctx, d, tip, 1 - d.shade);
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
    for (const d of mirrored(dabs, this.record)) drawDab(ctx, d, d.shade > 0.5 ? this.shadeTip : this.tip, this.record.brush.opacity);
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

  /** The stroke image: normal buffer and shade buffer, each with its own paper grain (hard-edged when anti-aliasing is off). */
  private strokeImage(r: Rect): HTMLCanvasElement {
    const img = this.softImage(r);
    if (this.record?.brush.antiAlias !== false) return img;
    const g = ctx2d(this.grained);
    if (img !== this.grained) {
      g.clearRect(r.x, r.y, r.w, r.h);
      g.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    }
    hardenAlpha(g, r);
    return this.grained;
  }

  private softImage(r: Rect): HTMLCanvasElement {
    const b = this.record?.brush;
    if (!b) return this.buffer;
    if (b.grain <= 0 && !this.hasShade) return this.buffer;
    const g = ctx2d(this.grained);
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(this.buffer, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    applyGrain(g, r, b.grain, b.grainScale, b.grainImage);
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
   * Finish the stroke: re-render it from data (now the length is known, the end taper applies;
   * `rerender` also after post-correction moved the points), composite onto the bound canvas,
   * and return before/after pixels for undo.
   */
  commit(rerender = false): StrokeCommit | null {
    const rec = this.record;
    if (!rec) return null;
    if (rerender || rec.brush.taperEnd > 0) {
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
