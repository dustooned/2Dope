import { makeCanvas } from '../brush/raster';
import { activeEffects, effectsKey, effectTick, type LayerEffect } from '../core/effects';
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
 * The layer flattened with its effects, on a page-size canvas; null when it has none.
 * `paint(g, part)` paints the layer's drawing (one part, or both) the usual way.
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
): HTMLCanvasElement | null {
  const fx = activeEffects(l);
  if (!fx.length) return null;
  const key = content ? `${l.id}|${content}|${planes}|${w}x${h}|${effectsKey(l, frame)}` : '';
  const hit = key ? cache.get(key) : undefined;
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const out = canvasFor(`o${depth}`, w, h);
  const og = out.getContext('2d')!;
  const per = (t: Part) => fx.filter((e) => e.target === t);
  if (!per('line').length && !per('fill').length) paint(og, planes);
  else {
    for (const part of ['fill', 'line'] as const) {
      if (planes !== 'all' && planes !== part) continue;
      const c = canvasFor(`${part}${depth}`, w, h);
      paint(c.getContext('2d')!, part);
      for (const e of per(part)) applyEffect(c, e, frame);
      og.drawImage(c, 0, 0);
    }
  }
  for (const e of fx.filter((e) => e.target === 'layer')) applyEffect(out, e, frame);
  if (!key || w * h * 4 > effectCacheBudget / 4) return out;
  const keep = makeCanvas(w, h);
  keep.getContext('2d')!.drawImage(out, 0, 0);
  cache.set(key, keep);
  cacheBytes += w * h * 4;
  trim();
  return keep;
}

function applyEffect(c: HTMLCanvasElement, e: LayerEffect, frame: number): void {
  const tick = effectTick(e, frame);
  if (e.type === 'boil') displace(c, e, tick, 1);
  else if (e.type === 'turbulence') displace(c, e, tick, 3);
  else if (e.type === 'grain') grain(c, e, tick);
  else if (e.type === 'texture') texture(c, e);
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
