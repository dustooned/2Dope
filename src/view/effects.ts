import { makeCanvas } from '../brush/raster';
import { activeEffects, effectsKey, effectsPad, effectTick, param, type LayerEffect } from '../core/effects';
import { applyBlur } from '../core/adjust';
import { ditherPixels } from '../core/dither';
import { hash01 } from '../core/rng';

/**
 * Drawing a layer with its effects: the Fill and the Line are painted on their own so an effect can
 * aim at one of them, then they are put together and the whole-layer effects run last.
 */

type Part = 'line' | 'fill';

const scratch = new Map<string, HTMLCanvasElement>();
function canvasFor(tag: string, w: number, h: number): HTMLCanvasElement {
  let c = scratch.get(tag);
  if (!c) { c = makeCanvas(w, h); scratch.set(tag, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  // read back on every frame: a CPU-side canvas makes that cheap
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  return c;
}

/** Free the effect canvases and the cache (after an export). */
export function releaseEffectScratch(): void {
  for (const c of scratch.values()) { c.width = 0; c.height = 0; }
  scratch.clear();
  for (const c of cache.values()) { c.width = 0; c.height = 0; }
  cache.clear();
  cacheBytes = 0;
  tiles.clear();
}

// Finished frames, newest last: a loop or a scrub back draws them again without the work.
const cache = new Map<string, HTMLCanvasElement>();
let cacheBytes = 0;
/** Memory the cache may use (set lower on Lite devices). */
export let effectCacheBudget = 96 * 1024 * 1024;
export function setEffectCacheBudget(bytes: number): void {
  effectCacheBudget = bytes;
  trim();
}
function trim(): void {
  for (const [k, c] of cache) {
    if (cacheBytes <= effectCacheBudget) break;
    cacheBytes -= c.width * c.height * 4;
    c.width = 0;
    cache.delete(k);
  }
}

/**
 * The layer flattened with its effects, on a page-size canvas grown by `effectsPad(l)` on every
 * side (draw it at -pad, -pad); null when it has none. `paint(g, part)` paints the layer's drawing
 * (one part, or both) the usual way.
 */
export function drawEffected(
  l: { id: string; effects?: LayerEffect[] },
  frame: number,
  w: number,
  h: number,
  planes: 'all' | Part,
  depth: number,
  paint: (g: CanvasRenderingContext2D, part: 'all' | Part) => void,
  /** What the painted drawing is (id, revision, part settings): with it, results are cached. */
  content?: string,
  /** The comp's frame rate (moving effects such as Wave warp run in seconds). */
  fps = 24,
): HTMLCanvasElement | null {
  const fx = activeEffects(l);
  if (!fx.length) return null;
  // shadows and glows reach past the art: work on a page grown by the pad
  const pad = effectsPad(l);
  w += 2 * pad;
  h += 2 * pad;
  const key = content ? `${l.id}|${content}|${planes}|${w}x${h}|${fps}|${effectsKey(l, frame)}` : '';
  const hit = key ? cache.get(key) : undefined;
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const out = canvasFor(`o${depth}`, w, h);
  const og = out.getContext('2d')!;
  const per = (t: Part) => fx.filter((e) => e.target === t);
  if (!per('line').length && !per('fill').length) {
    og.setTransform(1, 0, 0, 1, pad, pad);
    paint(og, planes);
    og.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    for (const part of ['fill', 'line'] as const) {
      if (planes !== 'all' && planes !== part) continue;
      const c = canvasFor(`${part}${depth}`, w, h);
      const pg = c.getContext('2d')!;
      pg.setTransform(1, 0, 0, 1, pad, pad);
      paint(pg, part);
      pg.setTransform(1, 0, 0, 1, 0, 0);
      for (const e of per(part)) applyEffect(c, e, frame, pad, fps);
      og.drawImage(c, 0, 0);
    }
  }
  for (const e of fx.filter((e) => e.target === 'layer')) applyEffect(out, e, frame, pad, fps);
  if (!key || w * h * 4 > effectCacheBudget / 4) return out;
  const keep = makeCanvas(w, h);
  keep.getContext('2d')!.drawImage(out, 0, 0);
  cache.set(key, keep);
  cacheBytes += w * h * 4;
  trim();
  return keep;
}

function applyEffect(c: HTMLCanvasElement, e: LayerEffect, frame: number, pad = 0, fps = 24): void {
  const tick = effectTick(e, frame);
  if (e.type === 'boil') displace(c, e, tick, 1);
  else if (e.type === 'roughen') roughen(c, e, tick);
  else if (e.type === 'turbulence') displace(c, e, tick, 3);
  else if (e.type === 'grain') grain(c, e, tick);
  else if (e.type === 'blur') blurLayer(c, e);
  else if (e.type === 'texture') texture(c, e);
  else if (e.type === 'dither') dither(c, e);
  else if (e.type === 'shadow') dropShadow(c, e);
  else if (e.type === 'glow') glow(c, e);
  else if (e.type === 'dirblur') directionalBlur(c, e);
  else if (e.type === 'radialblur') radialBlur(c, e, pad);
  else if (e.type === 'posterize') perPixel(c, posterizer(e));
  else if (e.type === 'threshold') perPixel(c, thresholder(e));
  else if (e.type === 'mosaic') mosaic(c, e, pad);
  else if (e.type === 'edges') findEdges(c, e);
  else if (e.type === 'twirl') twirl(c, e, pad);
  else if (e.type === 'mirror') mirror(c, e, pad);
  else if (e.type === 'offset') offset(c, e, pad);
  else if (e.type === 'fringe') fringe(c, e);
  else if (e.type === 'tv') retroTv(c, e, tick);
  else if (e.type === 'wave') waveWarp(c, e, pad, (tick * Math.max(1, Math.round(e.hold))) / fps);
}

/** Change every painted pixel's colour in place (straight RGBA; alpha kept). */
function perPixel(c: HTMLCanvasElement, f: (px: Uint8ClampedArray, i: number) => void): void {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) f(d, i);
  g.putImageData(img, 0, 0);
}

/** Posterize: each channel snapped to Levels evenly spaced values. */
function posterizer(e: LayerEffect): (d: Uint8ClampedArray, i: number) => void {
  const n = Math.max(2, Math.round(e.amount)) - 1;
  return (d, i) => { for (let k = 0; k < 3; k++) d[i + k] = Math.round((Math.round((d[i + k]! / 255) * n) / n) * 255); };
}

/** Threshold: brightness at or over Level is white, under it black. */
function thresholder(e: LayerEffect): (d: Uint8ClampedArray, i: number) => void {
  return (d, i) => { const v = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]! >= e.amount ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; };
}

/** Mosaic: the page in Blocks across × Blocks down, each block one colour (its average, or its middle pixel when sharp). */
function mosaic(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const bw = Math.max(1, (w - 2 * pad) / Math.max(1, Math.round(e.amount))), bh = Math.max(1, (h - 2 * pad) / Math.max(1, Math.round(e.size)));
  const sharp = param<boolean>(e, 'sharp');
  for (let by = pad - Math.ceil(pad / bh) * bh; by < h; by += bh) {
    for (let bx = pad - Math.ceil(pad / bw) * bw; bx < w; bx += bw) {
      const x0 = Math.max(0, Math.round(bx)), y0 = Math.max(0, Math.round(by)), x1 = Math.min(w, Math.round(bx + bw)), y1 = Math.min(h, Math.round(by + bh));
      if (x1 <= x0 || y1 <= y0) continue;
      let r = 0, gg = 0, b = 0, a = 0, n = 0;
      if (sharp) {
        const j = ((Math.min(h - 1, Math.floor((y0 + y1) / 2)) * w) + Math.min(w - 1, Math.floor((x0 + x1) / 2))) * 4;
        r = d[j]!; gg = d[j + 1]!; b = d[j + 2]!; a = d[j + 3]!;
      } else {
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const j = (y * w + x) * 4, al = d[j + 3]!;
          r += d[j]! * al; gg += d[j + 1]! * al; b += d[j + 2]! * al; a += al; n++;
        }
        if (a) { r /= a; gg /= a; b /= a; }
        a /= n;
      }
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const j = (y * w + x) * 4;
        d[j] = r; d[j + 1] = gg; d[j + 2] = b; d[j + 3] = a;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** Find edges: dark outlines on white where the picture changes (Invert: light lines on black), mixed with the original. */
function findEdges(c: HTMLCanvasElement, e: LayerEffect): void {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  // the picture over white, so the outline of the art counts as an edge too
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const a = d[i + 3]! / 255;
    lum[p] = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) * a + 255 * (1 - a);
  }
  const inv = param<boolean>(e, 'invert'), mix = e.amount / 100;
  const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const m = Math.min(255, Math.hypot(gx, gy) / 4);
      const v = inv ? m : 255 - m;
      for (let k = 0; k < 3; k++) d[i + k] = v * (1 - mix) + d[i + k]! * mix;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Resample `c` through `from(x, y)` (where each pixel comes from), bilinear on premultiplied colour. */
function warp(c: HTMLCanvasElement, from: (x: number, y: number) => [number, number], wrap = false): void {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true })!;
  const src = g.getImageData(0, 0, w, h).data;
  const pm = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 4) { const a = src[i + 3]! / 255; pm[i] = src[i]! * a; pm[i + 1] = src[i + 1]! * a; pm[i + 2] = src[i + 2]! * a; pm[i + 3] = src[i + 3]!; }
  const out = new Uint8ClampedArray(src.length);
  const px = (x: number, y: number, k: number) => {
    if (wrap) { x = ((x % w) + w) % w; y = ((y % h) + h) % h; } else if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return pm[(y * w + x) * 4 + k]!;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = from(x, y);
      const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
      const v = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) v[k] = (px(x0, y0, k) * (1 - tx) + px(x0 + 1, y0, k) * tx) * (1 - ty) + (px(x0, y0 + 1, k) * (1 - tx) + px(x0 + 1, y0 + 1, k) * tx) * ty;
      if (v[3]! <= 0) continue;
      const i = (y * w + x) * 4, a = v[3]! / 255;
      out[i] = v[0]! / a; out[i + 1] = v[1]! / a; out[i + 2] = v[2]! / a; out[i + 3] = v[3]!;
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
}

/** A centre given in % of the page, on the padded canvas. */
const centre = (c: HTMLCanvasElement, e: LayerEffect, pad: number): [number, number] => [pad + ((c.width - 2 * pad) * param<number>(e, 'cx')) / 100, pad + ((c.height - 2 * pad) * param<number>(e, 'cy')) / 100];

/** Twirl: turns the picture by Angle at the centre, less and less out to Radius (% of the page's half-size). */
function twirl(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  if (!e.amount) return;
  const [cx, cy] = centre(c, e, pad), R = (Math.min(c.width, c.height) - 2 * pad) * 0.5 * (e.size / 50), turn = (e.amount * Math.PI) / 180;
  warp(c, (x, y) => {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r >= R) return [x, y];
    const t = turn * (1 - r / R) ** 2, cs = Math.cos(-t), sn = Math.sin(-t);
    return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
  });
}

/** Mirror: a line through the centre at Angle; the side the line faces is replaced by the reflection of the other. */
function mirror(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const [cx, cy] = centre(c, e, pad), a = (e.amount * Math.PI) / 180, nx = Math.cos(a), ny = Math.sin(a);
  warp(c, (x, y) => {
    const s = (x - cx) * nx + (y - cy) * ny;
    return s > 0 ? [x - 2 * s * nx, y - 2 * s * ny] : [x, y];
  });
}

/** Offset: slide the page so Shift across/down lands in the middle, wrapping round the edges. */
function offset(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const w = c.width - 2 * pad, h = c.height - 2 * pad;
  const dx = ((param<number>(e, 'x') - 50) / 100) * w, dy = ((param<number>(e, 'y') - 50) / 100) * h;
  if (!dx && !dy) return;
  const mix = e.amount / 100;
  const before = mix > 0 ? canvasFor('offsetMix', c.width, c.height) : null;
  before?.getContext('2d')!.drawImage(c, 0, 0);
  // wrap inside the page (not the pad)
  warp(c, (x, y) => [pad + ((((x - pad + dx) % w) + w) % w), pad + ((((y - pad + dy) % h) + h) % h)]);
  if (before) {
    const g = c.getContext('2d')!;
    g.save();
    g.globalAlpha = mix;
    g.drawImage(before, 0, 0);
    g.restore();
  }
}

/** Wave warp: waves of Height and Width travel along Direction at Speed (waves a second), pushing the picture sideways. */
function waveWarp(c: HTMLCanvasElement, e: LayerEffect, pad: number, seconds: number): void {
  const H = e.amount, W = Math.max(1, e.size);
  if (!H) return;
  const a = (param<number>(e, 'angle') * Math.PI) / 180, tx = Math.sin(a), ty = -Math.cos(a), nx = -ty, ny = tx;
  const phase = param<number>(e, 'phase') / 360 + param<number>(e, 'speed') * seconds, shape = param<string>(e, 'shape');
  const wave = (u: number) => {
    const f = u - Math.floor(u);
    if (shape === 'triangle') return 1 - 4 * Math.abs(f - 0.5);
    if (shape === 'square') return f < 0.5 ? 1 : -1;
    if (shape === 'saw') return 2 * f - 1;
    return Math.sin(2 * Math.PI * f);
  };
  const pin = param<boolean>(e, 'pin'), pw = c.width - 2 * pad, ph = c.height - 2 * pad, edge = Math.min(pw, ph) * 0.15;
  warp(c, (x, y) => {
    let k = H * wave((x * tx + y * ty) / W - phase);
    if (pin) k *= Math.min(1, Math.max(0, Math.min(x - pad, y - pad, pad + pw - x, pad + ph - y) / edge));
    return [x - nx * k, y - ny * k];
  });
}

/** A copy of `c` in one colour (its alpha kept), on a scratch canvas. */
function silhouette(c: HTMLCanvasElement, tag: string, colour: string): HTMLCanvasElement {
  const s = canvasFor(tag, c.width, c.height), g = s.getContext('2d')!;
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, s.width, s.height);
  g.globalCompositeOperation = 'source-over';
  return s;
}

function blurCanvas(c: HTMLCanvasElement, radius: number): void {
  if (radius < 1) return;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, c.width, c.height);
  applyBlur(img.data, img.data, c.width, c.height, radius);
  g.putImageData(img, 0, 0);
}

/**
 * Drop shadow (After Effects' parameters): the art's silhouette in the shadow colour, moved
 * `amount` px towards Direction (0° = up, 135° = down-right), softened by Softness, behind the art.
 */
function dropShadow(c: HTMLCanvasElement, e: LayerEffect): void {
  const a = (param<number>(e, 'angle') * Math.PI) / 180, dist = e.amount;
  const sh = silhouette(c, 'shadow', param<string>(e, 'color'));
  blurCanvas(sh, e.size / 2);
  const g = c.getContext('2d')!;
  g.save();
  if (param<boolean>(e, 'only')) g.clearRect(0, 0, c.width, c.height);
  else g.globalCompositeOperation = 'destination-over';
  g.globalAlpha = param<number>(e, 'opacity') / 100;
  g.drawImage(sh, Math.sin(a) * dist, -Math.cos(a) * dist);
  g.restore();
}

/**
 * Glow: the parts brighter than Threshold (brightness × coverage), blurred by Radius, made
 * stronger by Intensity and added to the picture (original on top, behind, or glow only).
 */
function glow(c: HTMLCanvasElement, e: LayerEffect): void {
  const w = c.width, h = c.height;
  const src = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const bright = canvasFor('glow', w, h), bg = bright.getContext('2d', { willReadFrequently: true })!;
  const img = bg.createImageData(w, h), s = src.data, d = img.data;
  const t = param<number>(e, 'threshold') / 100, knee = 0.1, gain = param<number>(e, 'intensity');
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3]! / 255;
    if (!a) continue;
    // brightness as the brightest channel (HSV value): a vivid red or blue glows, not only near-white
    const lum = Math.max(s[i]!, s[i + 1]!, s[i + 2]!) / 255;
    // a soft knee so the edge of the glowing area does not band
    const k = Math.min(1, Math.max(0, (lum - t + knee) / (2 * knee)));
    if (!k) continue;
    d[i] = s[i]!; d[i + 1] = s[i + 1]!; d[i + 2] = s[i + 2]!; d[i + 3] = Math.round(s[i + 3]! * k);
  }
  applyBlur(d, d, w, h, e.amount);
  if (gain !== 1) for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i]! * gain);
  bg.putImageData(img, 0, 0);
  const g = c.getContext('2d')!, mode = param<string>(e, 'composite');
  g.save();
  if (mode === 'none') {
    g.clearRect(0, 0, w, h);
    g.drawImage(bright, 0, 0);
  } else if (mode === 'behind') {
    g.globalCompositeOperation = 'lighter';
    g.drawImage(bright, 0, 0);
  } else {
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(bright, 0, 0);
  }
  g.restore();
}

/** Average premultiplied samples of `src` at `n` offsets per pixel (nearest pixel), into `c`. */
function smear(c: HTMLCanvasElement, at: (x: number, y: number, k: number) => [number, number], n: number): void {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h), s = img.data;
  const pm = new Float32Array(s.length);
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3]! / 255;
    pm[i] = s[i]! * a; pm[i + 1] = s[i + 1]! * a; pm[i + 2] = s[i + 2]! * a; pm[i + 3] = s[i + 3]!;
  }
  const out = new Uint8ClampedArray(s.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, gg = 0, b = 0, a = 0;
      for (let k = 0; k < n; k++) {
        const [sx, sy] = at(x, y, k);
        const X = Math.round(sx), Y = Math.round(sy);
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = (Y * w + X) * 4;
        r += pm[j]!; gg += pm[j + 1]!; b += pm[j + 2]!; a += pm[j + 3]!;
      }
      const i = (y * w + x) * 4;
      if (!a) continue;
      // back to straight colour (alpha is the average coverage)
      out[i] = (r / a) * 255; out[i + 1] = (gg / a) * 255; out[i + 2] = (b / a) * 255; out[i + 3] = a / n;
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
}

/** Directional blur: each pixel averages the picture along Direction over Length. */
function directionalBlur(c: HTMLCanvasElement, e: LayerEffect): void {
  const len = e.amount;
  if (len < 1) return;
  const a = (param<number>(e, 'angle') * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  const n = Math.min(48, Math.max(2, Math.ceil(len)));
  smear(c, (x, y, k) => { const t = (k / (n - 1) - 0.5) * len; return [x + dx * t, y + dy * t]; }, n);
}

/** Radial blur: spin around the centre (Amount = degrees) or zoom out from it (Amount = % of the distance). */
function radialBlur(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const amt = e.amount;
  if (amt <= 0) return;
  const cx = pad + ((c.width - 2 * pad) * param<number>(e, 'cx')) / 100, cy = pad + ((c.height - 2 * pad) * param<number>(e, 'cy')) / 100;
  const n = 24;
  if (param<string>(e, 'mode') === 'zoom') {
    smear(c, (x, y, k) => { const s = 1 - (amt / 100) * 0.5 * (k / (n - 1)); return [cx + (x - cx) * s, cy + (y - cy) * s]; }, n);
    return;
  }
  const span = (amt * Math.PI) / 180;
  const cos: number[] = [], sin: number[] = [];
  for (let k = 0; k < n; k++) { const t = (k / (n - 1) - 0.5) * span; cos.push(Math.cos(t)); sin.push(Math.sin(t)); }
  smear(c, (x, y, k) => { const ox = x - cx, oy = y - cy; return [cx + ox * cos[k]! - oy * sin[k]!, cy + ox * sin[k]! + oy * cos[k]!]; }, n);
}

/**
 * Dither: the picture is cut into `size`-pixel cells (the chunky retro pixel), each cell takes the
 * average colour of what is in it, and the cells are dithered to the palette. Alpha stays smooth.
 */
function dither(c: HTMLCanvasElement, e: LayerEffect): void {
  const w = c.width, h = c.height;
  const p = Math.max(1, Math.round(e.size));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const src = new Uint32Array(img.data.buffer);
  const box = paintedBox(src, w, h, 0);
  if (!box) return;
  // cells line up with the page (not with the drawing), so the pattern does not swim when it moves
  const cx0 = Math.floor(box.x0 / p), cy0 = Math.floor(box.y0 / p);
  const cw = Math.floor(box.x1 / p) - cx0 + 1, ch = Math.floor(box.y1 / p) - cy0 + 1;
  const cells = new Uint8ClampedArray(cw * ch * 4);
  const d = img.data;
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let r = 0, gg = 0, b = 0, a = 0, n = 0;
      const xs = (cx0 + cx) * p, ys = (cy0 + cy) * p;
      for (let y = ys; y < Math.min(h, ys + p); y++) {
        for (let x = xs; x < Math.min(w, xs + p); x++) {
          const i = (y * w + x) * 4;
          const al = d[i + 3]!;
          r += d[i]! * al; gg += d[i + 1]! * al; b += d[i + 2]! * al; a += al; n++;
        }
      }
      const o = (cy * cw + cx) * 4;
      if (a > 0) { cells[o] = r / a; cells[o + 1] = gg / a; cells[o + 2] = b / a; cells[o + 3] = Math.max(1, Math.round(a / n)); }
    }
  }
  ditherPixels(cells, cw, ch, { palette: e.palette ?? 'pico8', method: e.method ?? 'bayer4', gray: e.gray, strength: e.amount / 100, bias: [param<number>(e, 'tr') * 1.28, param<number>(e, 'tg') * 1.28, param<number>(e, 'tb') * 1.28] });
  // paint the cells back as blocks, keeping each pixel's own alpha so edges stay smooth
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const o = (cy * cw + cx) * 4;
      if (!cells[o + 3]) continue;
      const xs = (cx0 + cx) * p, ys = (cy0 + cy) * p;
      for (let y = ys; y < Math.min(h, ys + p); y++) {
        for (let x = xs; x < Math.min(w, xs + p); x++) {
          const i = (y * w + x) * 4;
          if (!d[i + 3]) continue;
          d[i] = cells[o]!; d[i + 1] = cells[o + 1]!; d[i + 2] = cells[o + 2]!;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** The area that holds paint, padded: what a displacing effect needs to work on. */
function paintedBox(src: Uint32Array, w: number, h: number, pad: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let y0 = 0, y1 = h - 1;
  const rowEmpty = (y: number) => { const r = y * w; for (let x = 0; x < w; x++) if (src[r + x]! >>> 24) return false; return true; };
  while (y0 < h && rowEmpty(y0)) y0++;
  if (y0 >= h) return null;
  while (y1 > y0 && rowEmpty(y1)) y1--;
  const colEmpty = (x: number) => { for (let y = y0; y <= y1; y++) if (src[y * w + x]! >>> 24) return false; return true; };
  let x0 = 0, x1 = w - 1;
  while (x0 < w && colEmpty(x0)) x0++;
  while (x1 > x0 && colEmpty(x1)) x1--;
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(w - 1, x1 + pad), y1: Math.min(h - 1, y1 + pad) };
}

/**
 * Displacement: every pixel moves along smooth random fields (value noise for x and y), a new
 * field every `hold` frames. One octave is line boil; three (each half the size and amplitude)
 * make turbulence. Only the drawn area (padded by the amount) is worked on.
 */
function displace(c: HTMLCanvasElement, e: LayerEffect, tick: number, octaves: number): void {
  const amount = e.amount;
  if (amount <= 0) return;
  const w = c.width, h = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const src = new Uint32Array(img.data.buffer);
  const box = paintedBox(src, w, h, Math.ceil(amount) + 1);
  if (!box) return;
  const { x0, y0, x1, y1 } = box;
  const seed = (e.seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  // the octaves' amplitudes add up to 1, so a pixel never moves further than `amount`
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
  const oct: { size: number; gw: number; gx: Float32Array; gy: Float32Array; cx: Int32Array; wx: Float32Array; amp: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    const size = Math.max(2, e.size / 2 ** o);
    const gw = Math.ceil(w / size) + 2, gh = Math.ceil(h / size) + 2;
    const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
    for (let i = 0; i < gx.length; i++) { gx[i] = hash01(seed, i, 1 + 2 * o) * 2 - 1; gy[i] = hash01(seed, i, 2 + 2 * o) * 2 - 1; }
    // smoothstep weights per column, computed once
    const cx = new Int32Array(x1 - x0 + 1), wx = new Float32Array(x1 - x0 + 1);
    for (let x = x0; x <= x1; x++) { const f = x / size; const i = Math.floor(f); const t = f - i; cx[x - x0] = i; wx[x - x0] = t * t * (3 - 2 * t); }
    oct.push({ size, gw, gx, gy, cx, wx, amp: 0.5 ** o / norm });
  }
  // only the worked area is written back
  const ow = x1 - x0 + 1, oh = y1 - y0 + 1;
  const outImg = g.createImageData(ow, oh);
  const out = new Uint32Array(outImg.data.buffer);
  const rowJ = new Int32Array(octaves), rowS = new Float32Array(octaves);
  for (let y = y0; y <= y1; y++) {
    for (let o = 0; o < octaves; o++) {
      const fy = y / oct[o]!.size; const j = Math.floor(fy); const ty = fy - j;
      rowJ[o] = j; rowS[o] = ty * ty * (3 - 2 * ty);
    }
    for (let x = x0; x <= x1; x++) {
      let dx = 0, dy = 0;
      for (let o = 0; o < octaves; o++) {
        const q = oct[o]!;
        const i = q.cx[x - x0]!, sx = q.wx[x - x0]!, sy = rowS[o]!;
        const a = rowJ[o]! * q.gw + i, b = a + q.gw;
        dx += q.amp * ((q.gx[a]! * (1 - sx) + q.gx[a + 1]! * sx) * (1 - sy) + (q.gx[b]! * (1 - sx) + q.gx[b + 1]! * sx) * sy);
        dy += q.amp * ((q.gy[a]! * (1 - sx) + q.gy[a + 1]! * sx) * (1 - sy) + (q.gy[b]! * (1 - sx) + q.gy[b + 1]! * sx) * sy);
      }
      const sxp = Math.round(x + dx * amount), syp = Math.round(y + dy * amount);
      if (sxp < 0 || syp < 0 || sxp >= w || syp >= h) continue;
      out[(y - y0) * ow + (x - x0)] = src[syp * w + sxp]!;
    }
  }
  // outside the worked area stays as it was (it is empty)
  g.putImageData(outImg, x0, y0);
}

/**
 * Roughen edges: the layer's alpha is pulled in and out by a seeded noise field, so the rim
 * crumbles and wobbles like dry ink or a photocopy. Only alpha moves: colour never smears, thin ink
 * keeps its colour, and nothing is added outside the artwork (After Effects works on alpha too).
 */
function roughen(c: HTMLCanvasElement, e: LayerEffect, tick: number): void {
  const amount = e.amount;
  if (amount <= 0) return;
  const w = c.width, h = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const px = new Uint32Array(img.data.buffer);
  // the box that holds paint
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      if (px[r + x]! >>> 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const alpha = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) alpha[y * bw + x] = (px[(y + y0) * w + x + x0]! >>> 24) / 255;
  }
  // how much paint is around each pixel (a box of the roughness radius): thin lines have little,
  // so they roughen less instead of breaking apart; rims of thick strokes and shapes get the full amount
  const local = boxMean(alpha, bw, bh, Math.max(1, Math.ceil(amount)));
  // a seeded noise field, two octaves, a new pattern every `hold` frames
  const seed = (e.seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  const base = Math.max(4, e.size);
  const octaves = 2;
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
  const oct: { size: number; gw: number; gx: Float32Array; gy: Float32Array; amp: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    const size = Math.max(2, base / 2 ** o);
    const gw = Math.ceil(bw / size) + 2, gh = Math.ceil(bh / size) + 2;
    const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
    for (let i = 0; i < gx.length; i++) { gx[i] = hash01(seed, i, 1 + 2 * o) * 2 - 1; gy[i] = hash01(seed, i, 2 + 2 * o) * 2 - 1; }
    oct.push({ size, gw, gx, gy, amp: 0.5 ** o / norm });
  }
  const offset = (x: number, y: number): [number, number] => {
    let dx = 0, dy = 0;
    for (const q of oct) {
      const fx = x / q.size, fy = y / q.size;
      const i = Math.floor(fx), j = Math.floor(fy);
      const tx = fx - i, ty = fy - j;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = j * q.gw + i, b = a + q.gw;
      dx += q.amp * ((q.gx[a]! * (1 - sx) + q.gx[a + 1]! * sx) * (1 - sy) + (q.gx[b]! * (1 - sx) + q.gx[b + 1]! * sx) * sy);
      dy += q.amp * ((q.gy[a]! * (1 - sx) + q.gy[a + 1]! * sx) * (1 - sy) + (q.gy[b]! * (1 - sx) + q.gy[b + 1]! * sx) * sy);
    }
    return [dx, dy];
  };
  // the alpha where the noise points (bilinear; past the artwork there is nothing to keep)
  const alphaAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x > bw - 1 || y > bh - 1) return 0;
    const cx = Math.min(bw - 1, Math.max(0, x)), cy = Math.min(bh - 1, Math.max(0, y));
    const i = Math.floor(cx), j = Math.floor(cy);
    const tx = cx - i, ty = cy - j;
    const i1 = Math.min(bw - 1, i + 1), j1 = Math.min(bh - 1, j + 1);
    const top = alpha[j * bw + i]! * (1 - tx) + alpha[j * bw + i1]! * tx;
    const bot = alpha[j1 * bw + i]! * (1 - tx) + alpha[j1 * bw + i1]! * tx;
    return top * (1 - ty) + bot * ty;
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const v = px[(y + y0) * w + x + x0]!;
      const al = v >>> 24;
      if (!al) continue;
      const [dx, dy] = offset(x, y);
      const k = Math.min(1, local[y * bw + x]! / 0.5) ** 2, amt = amount * k;
      // outward pulls erase, inward pulls thicken: the rim breaks up but never grows new paint
      const a = Math.round(al * alphaAt(x + dx * amt, y + dy * amt));
      if (a !== al) px[(y + y0) * w + x + x0] = ((v & 0x00ffffff) | (a << 24)) >>> 0;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Mean of `v` over a (2r+1)² box at each cell (two separable passes; edges count as empty). */
function boxMean(v: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(v.length), out = new Float32Array(v.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < w) sum += v[y * w + x]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / n;
      const add = x + r + 1, drop = x - r;
      if (add < w) sum += v[y * w + add]!;
      if (drop >= 0) sum -= v[y * w + drop]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < h) sum += tmp[y * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      const add = y + r + 1, drop = y - r;
      if (add < h) sum += tmp[add * w + x]!;
      if (drop >= 0) sum -= tmp[drop * w + x]!;
    }
  }
  return out;
}

/** Gaussian blur of the whole layer (premultiplied, so soft edges keep their colour). */
function blurLayer(c: HTMLCanvasElement, e: LayerEffect): void {
  const radius = e.amount;
  if (radius < 1) return;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, c.width, c.height);
  applyBlur(img.data, img.data, c.width, c.height, radius);
  g.putImageData(img, 0, 0);
}

/** Scale the alpha of every painted pixel by keep(x, y), 0..1. */
function eatAlpha(c: HTMLCanvasElement, keep: (x: number, y: number) => number): void {
  const w = c.width, h = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const px = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const v = px[r + x]!;
      const a = v >>> 24;
      if (!a) continue;
      px[r + x] = ((v & 0x00ffffff) | (Math.round(a * keep(x, y)) << 24)) >>> 0;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Film grain: random specks (`size` px square) that eat into the paint; new specks each pattern. */
function grain(c: HTMLCanvasElement, e: LayerEffect, tick: number): void {
  const amt = e.amount / 100;
  if (amt <= 0) return;
  const size = Math.max(1, Math.round(e.size));
  const cols = Math.ceil(c.width / size) + 1;
  const seed = (e.seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  eatAlpha(c, (x, y) => 1 - amt * hash01(seed, Math.floor(y / size) * cols + Math.floor(x / size), 7));
}

// Paper tiles are made once per look: a periodic value-noise tile (256 px) repeats without seams.
const TILE = 256;
const tiles = new Map<string, Float32Array>();
function paperTile(size: number, seed: number): Float32Array {
  const key = `${size}|${seed}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  const t = new Float32Array(TILE * TILE);
  const octs = [1, 0.5, 0.25];
  const norm = octs.reduce((a, b) => a + b, 0);
  octs.forEach((amp, o) => {
    // whole cells per tile, so the noise repeats exactly at the tile's edge
    const cells = Math.max(1, Math.round(TILE / (Math.max(2, size) / 2 ** o)));
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = hash01(seed, i, 11 + o);
    for (let y = 0; y < TILE; y++) {
      const fy = (y / TILE) * cells; const j = Math.floor(fy); const ty = fy - j; const sy = ty * ty * (3 - 2 * ty);
      const j0 = (j % cells) * cells, j1 = ((j + 1) % cells) * cells;
      for (let x = 0; x < TILE; x++) {
        const fx = (x / TILE) * cells; const i = Math.floor(fx); const tx = fx - i; const sx = tx * tx * (3 - 2 * tx);
        const i0 = i % cells, i1 = (i + 1) % cells;
        const v = (lat[j0 + i0]! * (1 - sx) + lat[j0 + i1]! * sx) * (1 - sy) + (lat[j1 + i0]! * (1 - sx) + lat[j1 + i1]! * sx) * sy;
        t[y * TILE + x] = t[y * TILE + x]! + (v * amp) / norm;
      }
    }
  });
  // noise bunches around the middle: spread it so the paper has real tooth
  for (let i = 0; i < t.length; i++) t[i] = Math.min(1, Math.max(0, 0.5 + (t[i]! - 0.5) * 2.4));
  if (tiles.size >= 6) tiles.delete(tiles.keys().next().value as string);
  tiles.set(key, t);
  return t;
}

/** Texture: a pattern that eats into the paint. Static: the same on every frame. */
function texture(c: HTMLCanvasElement, e: LayerEffect): void {
  const amt = e.amount / 100;
  if (amt <= 0) return;
  const s = Math.max(2, e.size);
  const style = e.style ?? 'paper';
  const soft = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  let level: (x: number, y: number) => number; // 1 keeps the paint, 0 removes it
  if (style === 'paper') {
    const t = paperTile(s, e.seed);
    level = (x, y) => t[(y & (TILE - 1)) * TILE + (x & (TILE - 1))]!;
  } else if (style === 'hatch') {
    level = (x, y) => { const f = (((x + y) % s) + s) % s / s; return soft((0.5 - Math.abs(f - 0.3)) * 6); };
  } else if (style === 'dots') {
    level = (x, y) => {
      const fx = (((x % s) + s) % s) - s / 2, fy = (((y % s) + s) % s) - s / 2;
      return soft((0.42 - Math.hypot(fx, fy) / s) * 8);
    };
  } else {
    const k = (Math.PI * 2) / s;
    level = (x, y) => 0.5 + 0.5 * Math.sin(x * k) * Math.sin(y * k);
  }
  eatAlpha(c, (x, y) => 1 - amt * (1 - level(x, y)));
}

/** Fringe: Copies of the art trail behind it towards Direction, out to Offset, each fainter (Falloff). */
function fringe(c: HTMLCanvasElement, e: LayerEffect): void {
  const n = Math.max(1, Math.round(e.size)), dist = e.amount;
  if (dist <= 0) return;
  const a = (Number(param<string>(e, 'dir')) * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a), fall = param<number>(e, 'falloff') / 100;
  const src = canvasFor('fringe', c.width, c.height);
  src.getContext('2d')!.drawImage(c, 0, 0);
  const g = c.getContext('2d')!;
  g.save();
  g.globalCompositeOperation = 'destination-over';
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    g.globalAlpha = Math.max(0, 1 - fall * t);
    g.drawImage(src, Math.round(dx * dist * t), Math.round(dy * dist * t));
  }
  g.restore();
}

/**
 * Retro TV: an analog-signal look without a signal model. The picture rolls (Roll rows a frame),
 * red and blue slip sideways on alternate scanlines (Chroma shift, Phase offset), rows soften
 * (Scanline blur), colour fades towards grey (Chroma loss) and seeded static streaks in
 * Noise-size dashes that change with Distortion speed. Strength mixes it with the original.
 */
function retroTv(c: HTMLCanvasElement, e: LayerEffect, tick: number): void {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h), src = img.data, orig = Uint8ClampedArray.from(src);
  const roll = Math.round(param<number>(e, 'roll') * tick * Math.max(1, Math.round(e.hold))), shift = param<number>(e, 'chromaShift'), ph = (param<number>(e, 'phase') * Math.PI) / 180;
  const blur = Math.round(param<number>(e, 'scanBlur')), loss = param<number>(e, 'chromaLoss') / 100, stat = param<number>(e, 'static') / 100, mix = e.amount / 100;
  const noiseTick = Math.floor(tick * param<number>(e, 'speed')), seed = (e.seed ^ Math.imul(noiseTick + 1, 0x9e3779b1)) >>> 0, dash = Math.max(1, Math.round(e.size / 6));
  const row = (y: number) => ((((y - roll) % h) + h) % h) * w;
  const get = (x: number, r: number, k: number) => orig[(r + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4 + k]!;
  for (let y = 0; y < h; y++) {
    // scanline phase: red and blue move opposite ways, the amount swinging over four lines
    const s = shift * Math.cos(ph + (y % 4) * (Math.PI / 2));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 0, gg = 0, b = 0, a = 0, n = 0;
      for (let dy = -blur; dy <= blur; dy++) {
        const rr = row(Math.min(h - 1, Math.max(0, y + dy)));
        r += get(x + s, rr, 0); gg += get(x, rr, 1); b += get(x - s, rr, 2); a += get(x, rr, 3); n++;
      }
      r /= n; gg /= n; b /= n; a /= n;
      if (!a && !orig[i + 3]) continue;
      const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
      r += (lum - r) * loss; gg += (lum - gg) * loss; b += (lum - b) * loss;
      if (stat > 0) {
        const v = (hash01(seed, y * Math.ceil(w / dash) + Math.floor(x / dash), 41) * 2 - 1) * stat * 96;
        r += v; gg += v; b += v;
      }
      src[i] = orig[i]! + (r - orig[i]!) * mix;
      src[i + 1] = orig[i + 1]! + (gg - orig[i + 1]!) * mix;
      src[i + 2] = orig[i + 2]! + (b - orig[i + 2]!) * mix;
      src[i + 3] = orig[i + 3]! + (a - orig[i + 3]!) * mix;
    }
  }
  g.putImageData(img, 0, 0);
}
