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
  const key = content ? `${l.id}|${content}|${planes}|${w}x${h}|${frame}|${effectsKey(l, frame)}` : '';
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
  if (e.type === 'boil') boil(c, e, effectTick(e, frame));
}

/**
 * Line boil: every pixel moves a little along a smooth random field (two value-noise fields, x
 * and y), a new field every `hold` frames. Only the drawn area (padded by the amount) is worked on.
 */
function boil(c: HTMLCanvasElement, e: LayerEffect, tick: number): void {
  const amount = e.amount;
  if (amount <= 0) return;
  const w = c.width, h = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const src = new Uint32Array(img.data.buffer);
  // the drawn area: rows from the top and bottom, then columns, stopping at the first paint
  let y0 = 0, y1 = h - 1;
  const rowEmpty = (y: number) => { const r = y * w; for (let x = 0; x < w; x++) if (src[r + x]! >>> 24) return false; return true; };
  while (y0 < h && rowEmpty(y0)) y0++;
  if (y0 >= h) return;
  while (y1 > y0 && rowEmpty(y1)) y1--;
  const colEmpty = (x: number) => { for (let y = y0; y <= y1; y++) if (src[y * w + x]! >>> 24) return false; return true; };
  let x0 = 0, x1 = w - 1;
  while (x0 < w && colEmpty(x0)) x0++;
  while (x1 > x0 && colEmpty(x1)) x1--;
  const pad = Math.ceil(amount) + 1;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const size = Math.max(2, e.size);
  const gw = Math.ceil(w / size) + 2, gh = Math.ceil(h / size) + 2;
  // the random grid for this pattern: x and y offsets in -1..1
  const seed = (e.seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
  for (let i = 0; i < gx.length; i++) { gx[i] = hash01(seed, i, 1) * 2 - 1; gy[i] = hash01(seed, i, 2) * 2 - 1; }
  // smoothstep weights per column and row, computed once
  const cx = new Int32Array(x1 - x0 + 1), wx = new Float32Array(x1 - x0 + 1);
  for (let x = x0; x <= x1; x++) { const f = x / size; const i = Math.floor(f); const t = f - i; cx[x - x0] = i; wx[x - x0] = t * t * (3 - 2 * t); }
  // only the worked area is written back
  const ow = x1 - x0 + 1, oh = y1 - y0 + 1;
  const outImg = g.createImageData(ow, oh);
  const out = new Uint32Array(outImg.data.buffer);
  for (let y = y0; y <= y1; y++) {
    const fy = y / size; const j = Math.floor(fy); const ty = fy - j; const sy = ty * ty * (3 - 2 * ty);
    const r0 = j * gw, r1 = (j + 1) * gw;
    for (let x = x0; x <= x1; x++) {
      const i = cx[x - x0]!, sx = wx[x - x0]!;
      const a = r0 + i, b = r1 + i;
      const dx = (gx[a]! * (1 - sx) + gx[a + 1]! * sx) * (1 - sy) + (gx[b]! * (1 - sx) + gx[b + 1]! * sx) * sy;
      const dy = (gy[a]! * (1 - sx) + gy[a + 1]! * sx) * (1 - sy) + (gy[b]! * (1 - sx) + gy[b + 1]! * sx) * sy;
      const sxp = Math.round(x + dx * amount), syp = Math.round(y + dy * amount);
      if (sxp < 0 || syp < 0 || sxp >= w || syp >= h) continue;
      out[(y - y0) * ow + (x - x0)] = src[syp * w + sxp]!;
    }
  }
  // outside the worked area stays as it was (it is empty)
  g.putImageData(outImg, x0, y0);
}
