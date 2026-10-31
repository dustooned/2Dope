/**
 * GIF colour options (GifGun-style): a palette of up to N colours made from the picture by median
 * cut, and the mapping of each frame onto it with no dither, an ordered (Bayer) pattern or error
 * diffusion. Pure pixel maths over RGBA buffers.
 */

import { ORDERED, orderedAt } from '../core/dither';

export type GifDither = 'none' | 'ordered' | 'diffusion';
export type GifLoop = 'forever' | 'once' | number;

export interface GifOptions {
  /** Most colours in the palette, 2–256. */
  colors: number;
  /** Loop for ever, play once, or play this many times. */
  loop: GifLoop;
  dither: GifDither;
  /** Ordered dither pattern size: 1 = 2×2, 2 = 4×4, 3 = 8×8. */
  ditherScale: 1 | 2 | 3;
  /** Better colours: one palette from every frame (two passes) instead of from the first frame. */
  better: boolean;
  /** Pixel art: scale down with nearest pixels instead of smoothing. */
  pixelArt: boolean;
}

export const GIF_DEFAULTS: GifOptions = { colors: 256, loop: 'forever', dither: 'none', ditherScale: 2, better: false, pixelArt: false };

/** Saved options, validated (anything odd falls back to the default). */
export function readGifOptions(v: unknown): GifOptions {
  const r = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof GifOptions, unknown>>;
  const colors = typeof r.colors === 'number' && Number.isFinite(r.colors) ? Math.min(256, Math.max(2, Math.round(r.colors))) : GIF_DEFAULTS.colors;
  const loop: GifLoop = r.loop === 'once' || r.loop === 'forever' ? r.loop : typeof r.loop === 'number' && Number.isFinite(r.loop) ? Math.min(100, Math.max(2, Math.round(r.loop))) : GIF_DEFAULTS.loop;
  const dither: GifDither = r.dither === 'ordered' || r.dither === 'diffusion' || r.dither === 'none' ? r.dither : GIF_DEFAULTS.dither;
  const ditherScale = r.ditherScale === 1 || r.ditherScale === 3 ? r.ditherScale : 2;
  return { colors, loop, dither, ditherScale, better: r.better === true, pixelArt: r.pixelArt === true };
}

/** The classic fixed 256-colour path (no palette work) is used for the default options. */
export const usesFixedPalette = (o: GifOptions) => o.colors >= 256 && !o.better && o.dither === 'none';

/** Collects opaque colours from frames (every `step`-th pixel), for the palette. */
export class ColourSample {
  readonly px: number[] = [];
  add(rgba: Uint8ClampedArray, step = 1): void {
    for (let i = 0; i < rgba.length; i += 4 * step) if (rgba[i + 3]! >= 128) this.px.push((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!);
  }
}

/** Median cut: split the colour box with the widest channel at its median until there are `n` boxes; each box's average is a colour. */
export function medianCut(colours: number[], n: number): [number, number, number][] {
  if (!colours.length) return [[0, 0, 0]];
  const ch = (c: number, k: number) => (c >> (16 - 8 * k)) & 255;
  let boxes: number[][] = [colours.slice()];
  while (boxes.length < n) {
    let best = -1, bestRange = 0, bestK = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let lo = 255, hi = 0;
        for (const c of b) { const v = ch(c, k); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = i; bestK = k; }
      }
    });
    if (best < 0) break;
    const b = boxes[best]!.sort((x, y) => ch(x, bestK) - ch(y, bestK)), mid = b.length >> 1;
    boxes = [...boxes.slice(0, best), b.slice(0, mid), b.slice(mid), ...boxes.slice(best + 1)];
  }
  return boxes.map((b) => {
    const s = [0, 0, 0];
    for (const c of b) for (let k = 0; k < 3; k++) s[k] = s[k]! + ch(c, k);
    return s.map((v) => Math.round(v / b.length)) as [number, number, number];
  });
}

/** Nearest palette entry for each 5-bit-per-channel colour. */
function lut(pal: [number, number, number][]): Uint8Array {
  const out = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) {
    const r = ((i >> 10) << 3) | 4, g = (((i >> 5) & 31) << 3) | 4, b = ((i & 31) << 3) | 4;
    let best = 0, bd = Infinity;
    for (let p = 0; p < pal.length; p++) {
      const c = pal[p]!, d = 0.3 * (r - c[0]) ** 2 + 0.59 * (g - c[1]) ** 2 + 0.11 * (b - c[2]) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    out[i] = best;
  }
  return out;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Palette indices for a frame. Pixels under half opacity get `clear` when given (see-through).
 * Ordered dither pushes each pixel by a tiled Bayer threshold; diffusion is Floyd–Steinberg.
 */
export function mapToPalette(rgba: Uint8ClampedArray, w: number, h: number, pal: [number, number, number][], o: Pick<GifOptions, 'dither' | 'ditherScale'>, clear?: number): Uint8Array {
  const table = lut(pal), out = new Uint8Array(w * h);
  const pick = (r: number, g: number, b: number) => table[((clamp(r) >> 3) << 10) | ((clamp(g) >> 3) << 5) | (clamp(b) >> 3)]!;
  const ordered = o.dither === 'ordered' ? ORDERED[o.ditherScale === 1 ? 'bayer2' : o.ditherScale === 3 ? 'bayer8' : 'bayer4']! : null;
  const spread = 255 / Math.max(1, Math.cbrt(pal.length));
  const err = o.dither === 'diffusion' ? new Float32Array(w * h * 3) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      if (clear !== undefined && rgba[p + 3]! < 128) { out[i] = clear; continue; }
      let r = rgba[p]!, g = rgba[p + 1]!, b = rgba[p + 2]!;
      if (ordered) { const m = orderedAt(ordered, x, y) * spread; r += m; g += m; b += m; }
      if (err) { r += err[i * 3]!; g += err[i * 3 + 1]!; b += err[i * 3 + 2]!; }
      const k = pick(r, g, b);
      out[i] = k;
      if (err) {
        const c = pal[k]!, er = clamp(r) - c[0], eg = clamp(g) - c[1], eb = clamp(b) - c[2];
        for (const [dx, dy, wt] of [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] as const) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 3, f = wt / 16;
          err[j] = err[j]! + er * f; err[j + 1] = err[j + 1]! + eg * f; err[j + 2] = err[j + 2]! + eb * f;
        }
      }
    }
  }
  return out;
}
