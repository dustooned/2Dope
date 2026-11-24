/**
 * Look and light effects (format 15): Halftone (comic dots), Starglow (light streaks from the
 * bright parts) and Spot blur (a lens-style blur with bright discs). Pure pixel work on the
 * effect's padded working canvas, like view/fxmotion.ts; nothing here is random, so a frame
 * renders the same in the canvas, Share preview and exports.
 */
import { makeCanvas } from '../brush/raster';
import { param, type LayerEffect } from '../core/effects';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const hex = (h: string): [number, number, number] => { const v = /^#([0-9a-f]{6})$/i.exec(h)?.[1] ?? '000000'; return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; };

/** Dot radius for ink coverage `c` (0..1) in a cell: equal-area dots, growing to cover the cell fully at 1. */
export function dotRadius(c: number, cell: number): number {
  if (c <= 0) return 0;
  const k = clamp01(c);
  if (k < 0.78) return cell * Math.sqrt(k / Math.PI);
  return cell * (0.498 + (0.7071 - 0.498) * ((k - 0.78) / 0.22));
}

/**
 * Halftone: the picture becomes a grid of dots (turned by Angle) whose size follows how dark (or, with
 * Light dots, how light) that spot is. "Ink" dots take the ink colour; "Colour" dots take the colour of
 * the spot. Transparent places stay clear. `Keep original` mixes some of the picture back in.
 */
export function halftoneEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const cell = Math.max(2, e.amount);
  const w = c.width, h = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const src = g.getImageData(0, 0, w, h).data;
  const a = (Number(param<number>(e, 'angle')) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const look = param<string>(e, 'look'), light = param<boolean>(e, 'invert'), [ir, ig, ib] = hex(param<string>(e, 'color'));
  const keep = clamp01(Number(param<number>(e, 'mix')) / 100);
  const out = makeCanvas(w, h), og = out.getContext('2d')!;
  // sample a few points inside each cell and average them (alpha weighted)
  const taps: [number, number][] = [[0, 0], [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
  const at = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < w && yi < h ? (yi * w + xi) * 4 : -1;
  };
  // the grid is laid over the page turned by the angle: walk it in its own coordinates
  const reach = Math.hypot(w, h) / 2 + cell;
  const cx0 = w / 2, cy0 = h / 2, n = Math.ceil(reach / cell);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const gx = i * cell, gy = j * cell;
    const px = cx0 + gx * ca - gy * sa, py = cy0 + gx * sa + gy * ca;
    if (px < -cell || py < -cell || px > w + cell || py > h + cell) continue;
    let r = 0, gg = 0, b = 0, al = 0;
    for (const [tx, ty] of taps) {
      const o = at(px + (tx * ca - ty * sa) * cell, py + (tx * sa + ty * ca) * cell);
      if (o < 0) continue;
      const aa = src[o + 3]! / 255;
      r += src[o]! * aa; gg += src[o + 1]! * aa; b += src[o + 2]! * aa; al += aa;
    }
    const alpha = al / taps.length;
    if (alpha < 0.02) continue;
    r /= al; gg /= al; b /= al;
    const lum = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    // how much of the cell the dot covers
    const tone = light ? lum : 1 - lum;
    const coverage = look === 'colour' ? alpha * (0.3 + 0.7 * tone) : alpha * tone;
    const rad = dotRadius(coverage, cell);
    if (rad < 0.4) continue;
    og.fillStyle = look === 'colour' ? `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})` : `rgb(${ir},${ig},${ib})`;
    og.beginPath(); og.arc(px, py, rad, 0, Math.PI * 2); og.fill();
  }
  // the dots, over a faded copy of the picture when some of it is kept
  const copy = keep > 0 ? makeCanvas(w, h) : null;
  copy?.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(src), w, h), 0, 0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  if (copy) { g.globalAlpha = keep; g.drawImage(copy, 0, 0); g.globalAlpha = 1; copy.width = copy.height = 0; }
  g.drawImage(out, 0, 0);
  g.restore();
  out.width = out.height = 0;
}

/** The bright parts of a small copy of the canvas: colour kept, alpha = how far over the threshold. */
function brightParts(c: HTMLCanvasElement, scale: number, threshold: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(c.width * scale)), h = Math.max(1, Math.round(c.height * scale));
  const s = makeCanvas(w, h), sg = s.getContext('2d', { willReadFrequently: true })!;
  sg.drawImage(c, 0, 0, w, h);
  const img = sg.getImageData(0, 0, w, h), d = img.data;
  const knee = 0.1;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (!a) continue;
    // how light it looks (not how vivid): a bold orange or blue does not glow, white and pale yellow do
    const v = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
    const k = clamp01((v - threshold + knee) / (2 * knee));
    d[i + 3] = Math.round(a * k);
  }
  sg.putImageData(img, 0, 0);
  return s;
}

/**
 * Starglow: streaks of light run out from the bright parts in 4, 6, 8 or 12 directions (turned by
 * Angle), fading as they go. Done at a quarter of the size (a streak is soft anyway) and added to
 * the picture, so it stays quick on a big page.
 */
export function starglowEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const length = e.amount;
  if (length <= 0) return;
  const scale = 0.25;
  const rays = Math.max(2, Math.round(Number(param<string>(e, 'rays')) || 4)); // 4, 6, 8 or 12
  const gain = Number(param<number>(e, 'intensity')) || 1;
  const bright = brightParts(c, scale, clamp01(Number(param<number>(e, 'threshold')) / 100));
  const w = bright.width, h = bright.height;
  const acc = makeCanvas(w, h), ag = acc.getContext('2d')!;
  const steps = Math.max(4, Math.min(36, Math.round(length * scale)));
  const stepLen = (length * scale) / steps, base = (Number(param<number>(e, 'angle')) * Math.PI) / 180;
  ag.globalCompositeOperation = 'lighter';
  // each line reaches both ways, so half as many lines as rays
  const lines = Math.max(1, Math.round(rays / 2));
  for (let r = 0; r < lines; r++) {
    const ang = base + (r * Math.PI) / lines;
    for (const dir of [1, -1]) {
      const dx = Math.cos(ang) * dir, dy = Math.sin(ang) * dir;
      for (let i = 1; i <= steps; i++) {
        // the streak thins out towards its tip
        ag.globalAlpha = Math.min(1, ((1 - i / (steps + 1)) ** 2 * gain * 0.75) / Math.max(2, steps / 3));
        ag.drawImage(bright, dx * stepLen * i, dy * stepLen * i);
      }
    }
  }
  const tint = clamp01(Number(param<number>(e, 'tint')) / 100);
  if (tint > 0) {
    const [tr, tg, tb] = hex(param<string>(e, 'tintColor'));
    ag.globalCompositeOperation = 'source-atop';
    ag.globalAlpha = tint; ag.fillStyle = `rgb(${tr},${tg},${tb})`; ag.fillRect(0, 0, w, h);
  }
  const g = c.getContext('2d')!;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (param<string>(e, 'composite') === 'none') g.clearRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = param<string>(e, 'composite') === 'none' ? 'source-over' : 'lighter';
  g.globalAlpha = 1;
  g.drawImage(acc, 0, 0, c.width, c.height);
  g.restore();
  bright.width = bright.height = acc.width = acc.height = 0;
}

/**
 * Spot blur: a lens blur. Every spot spreads into a disc (or a six-sided shape, like a camera
 * aperture) of the given Radius, and the brightest spots are boosted first so they show as the
 * bright discs of an out-of-focus photo. The discs are an even average of copies spread over the
 * shape.
 */
export function spotBlurEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const radius = e.amount;
  if (radius < 0.5) return;
  const w = c.width, h = c.height;
  const boost = Math.max(0, Number(param<number>(e, 'highlights')) / 100), thr = clamp01(Number(param<number>(e, 'threshold')) / 100);
  const hexShape = param<string>(e, 'shape') === 'hex';
  // brighten the bright spots (colour only: their reach stays the same)
  const src = makeCanvas(w, h), sg = src.getContext('2d', { willReadFrequently: true })!;
  sg.drawImage(c, 0, 0);
  if (boost > 0) {
    const img = sg.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const v = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
      if (v < thr) continue;
      const k = 1 + boost * clamp01((v - thr) / Math.max(0.01, 1 - thr));
      d[i] = Math.min(255, d[i]! * k); d[i + 1] = Math.min(255, d[i + 1]! * k); d[i + 2] = Math.min(255, d[i + 2]! * k);
    }
    sg.putImageData(img, 0, 0);
  }
  const samples = Math.max(8, Math.min(64, Math.round(8 + radius * 2)));
  const out = makeCanvas(w, h), og = out.getContext('2d')!;
  // equal-weight average: copy k goes on at 1 / (k + 1)
  for (let k = 0; k < samples; k++) {
    const theta = k * 2.399963, rr = radius * Math.sqrt((k + 0.5) / samples);
    // a six-sided aperture pulls the circle out to a hexagon
    const f = hexShape ? Math.cos(Math.PI / 6) / Math.cos(((theta % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6) : 1;
    og.globalAlpha = 1 / (k + 1);
    og.drawImage(src, Math.cos(theta) * rr * f, Math.sin(theta) * rr * f);
  }
  const g = c.getContext('2d')!;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.drawImage(out, 0, 0);
  g.restore();
  src.width = src.height = out.width = out.height = 0;
}

/**
 * Gradient background: a smooth blend of two colours across the page (a straight blend at an angle, or
 * a circle spreading from a point), put behind the art or alone. It fills the page whether or not
 * the layer has anything drawn on it.
 */
export function gradientEffect(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const mix = clamp01(e.amount / 100);
  if (mix <= 0) return;
  const w = c.width, h = c.height, pw = w - 2 * pad, ph = h - 2 * pad;
  const [c1, c2] = [param<string>(e, 'color'), param<string>(e, 'color2')];
  const kind = param<string>(e, 'kind');
  const x0 = pad, y0 = pad;
  let grad: CanvasGradient;
  const g = c.getContext('2d')!;
  if (kind === 'radial') {
    const cx = x0 + (pw * Number(param<number>(e, 'cx'))) / 100, cy = y0 + (ph * Number(param<number>(e, 'cy'))) / 100;
    const r = (Math.hypot(pw, ph) / 2) * (Math.max(5, Number(param<number>(e, 'radius'))) / 100);
    grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  } else {
    // 0° runs from the top to the bottom; the line is long enough to reach every corner of the page
    const a = (Number(param<number>(e, 'angle')) * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a);
    const half = (Math.abs(ux) * pw + Math.abs(uy) * ph) / 2, mx = x0 + pw / 2, my = y0 + ph / 2;
    grad = g.createLinearGradient(mx + ux * half, my + uy * half, mx - ux * half, my - uy * half);
  }
  // a soft curve (ease in and out) instead of a straight blend
  const soft = param<boolean>(e, 'soft');
  for (let i = 0; i <= 8; i++) { const t = i / 8, k = soft ? t * t * (3 - 2 * t) : t; grad.addColorStop(t, blendHex(c1, c2, k)); }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = mix;
  if (param<string>(e, 'where') === 'only') { g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; }
  else g.globalCompositeOperation = 'destination-over';
  g.fillStyle = grad;
  g.fillRect(x0, y0, pw, ph);
  g.restore();
}

/** Two #rrggbb colours blended: 0 is the first, 1 the second. */
export function blendHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * clamp01(t));
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}
