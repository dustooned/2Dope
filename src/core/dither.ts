/**
 * Dithering: turn smooth colour into a limited palette with a pattern (ordered Bayer matrices) or
 * by spreading the rounding error to neighbours (error diffusion). Pure pixel maths, no canvas.
 * Designed from the usual published descriptions of these methods, not from any plug-in's code.
 */

export type PaletteId = 'bw' | 'gameboy' | 'cga' | 'ega' | 'c64' | 'zx' | 'pico8' | 'rgb2' | 'rgb4';
export type DitherMethod =
  | 'none' | 'bayer2' | 'bayer4' | 'bayer8'
  | 'bayer3' | 'grid5x3' | 'grid8x1' | 'grid12x4' | 'grid1x8' | 'grid4x12' | 'diagonal5' | 'cluster8'
  | 'floyd' | 'atkinson' | 'jjn' | 'stucki' | 'burkes' | 'sierra';

const hex = (s: string): [number, number, number][] => s.split(' ').map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const levels = (n: number): [number, number, number][] => {
  const out: [number, number, number][] = [];
  const v = (i: number) => Math.round((i * 255) / (n - 1));
  for (let r = 0; r < n; r++) for (let g = 0; g < n; g++) for (let b = 0; b < n; b++) out.push([v(r), v(g), v(b)]);
  return out;
};

export const PALETTES: { id: PaletteId; label: string; colors: [number, number, number][] }[] = [
  { id: 'bw', label: 'Black and white (1-bit)', colors: hex('000000 ffffff') },
  { id: 'gameboy', label: 'Game Boy green', colors: hex('0f380f 306230 8bac0f 9bbc0f') },
  { id: 'cga', label: 'CGA (4 colours)', colors: hex('000000 55ffff ff55ff ffffff') },
  { id: 'ega', label: 'EGA (16 colours)', colors: hex('000000 0000aa 00aa00 00aaaa aa0000 aa00aa aa5500 aaaaaa 555555 5555ff 55ff55 55ffff ff5555 ff55ff ffff55 ffffff') },
  { id: 'c64', label: 'Commodore 64', colors: hex('000000 ffffff 880000 aaffee cc44cc 00cc55 0000aa eeee77 dd8855 664400 ff7777 333333 777777 aaff66 0088ff bbbbbb') },
  { id: 'zx', label: 'ZX Spectrum', colors: hex('000000 0000d7 d70000 d700d7 00d700 00d7d7 d7d700 d7d7d7 0000ff ff0000 ff00ff 00ff00 00ffff ffff00 ffffff') },
  { id: 'pico8', label: 'PICO-8', colors: hex('000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa') },
  { id: 'rgb2', label: '8 bright colours', colors: levels(2) },
  { id: 'rgb4', label: '64 colours', colors: levels(4) },
];

export const DITHER_METHODS: { id: DitherMethod; label: string }[] = [
  { id: 'none', label: 'Flat colours (no dots)' },
  { id: 'bayer2', label: 'Grid dots \u00b7 big (2\u00d72)' },
  { id: 'bayer4', label: 'Grid dots (4\u00d74)' },
  { id: 'bayer8', label: 'Grid dots \u00b7 fine (8\u00d78)' },
  { id: 'bayer3', label: 'Grid dots (3\u00d73)' },
  { id: 'grid5x3', label: 'Grid dots \u00b7 wide (5\u00d73)' },
  { id: 'grid8x1', label: 'Lines \u00b7 upright (8\u00d71)' },
  { id: 'grid1x8', label: 'Lines \u00b7 across (1\u00d78)' },
  { id: 'grid12x4', label: 'Grid dots \u00b7 wide (12\u00d74)' },
  { id: 'grid4x12', label: 'Grid dots \u00b7 tall (4\u00d712)' },
  { id: 'diagonal5', label: 'Diagonal lines (5\u00d75)' },
  { id: 'cluster8', label: 'Halftone dots (cluster 8\u00d78)' },
  { id: 'floyd', label: 'Scattered \u00b7 smooth (Floyd\u2013Steinberg)' },
  { id: 'atkinson', label: 'Scattered \u00b7 crisp (Atkinson)' },
  { id: 'jjn', label: 'Scattered \u00b7 soft (Jarvis)' },
  { id: 'stucki', label: 'Scattered \u00b7 soft (Stucki)' },
  { id: 'burkes', label: 'Scattered (Burkes)' },
  { id: 'sierra', label: 'Scattered (Sierra)' },
];

export function paletteColors(id: PaletteId): [number, number, number][] {
  return (PALETTES.find((p) => p.id === id) ?? PALETTES[0]!).colors;
}

/** Bayer matrix of a power-of-two size, values 0..size²-1. */
function bayer(n: number): Int32Array {
  let m = [[0]];
  for (let s = 1; s < n; s *= 2) {
    const next: number[][] = [];
    for (let y = 0; y < s * 2; y++) {
      next.push([]);
      for (let x = 0; x < s * 2; x++) {
        const q = m[y % s]![x % s]! * 4;
        next[y]!.push(q + (y < s ? (x < s ? 0 : 2) : x < s ? 3 : 1));
      }
    }
    m = next;
  }
  return Int32Array.from(m.flat());
}
/** Values 0..n-1 by rank of `score` (ties by position): any threshold pattern from a scoring rule. */
function ranked(w: number, h: number, score: (x: number, y: number) => number): Int32Array {
  const cells = Array.from({ length: w * h }, (_, i) => ({ i, s: score(i % w, Math.floor(i / w)) }));
  cells.sort((a, b) => a.s - b.s || a.i - b.i);
  const m = new Int32Array(w * h);
  cells.forEach((c, r) => (m[c.i] = r));
  return m;
}
/** Evenly spread dots for any size (a low-discrepancy lattice, ranked). */
const spread = (w: number, h: number) => ranked(w, h, (x, y) => (x * 0.7548776662 + y * 0.5698402910) % 1);

/** Ordered (threshold) matrices: width, height, values 0..w·h-1, read tiled across the picture. */
export const ORDERED: Partial<Record<DitherMethod, { w: number; h: number; m: Int32Array }>> = {
  bayer2: { w: 2, h: 2, m: bayer(2) },
  bayer4: { w: 4, h: 4, m: bayer(4) },
  bayer8: { w: 8, h: 8, m: bayer(8) },
  bayer3: { w: 3, h: 3, m: Int32Array.from([0, 7, 3, 6, 5, 2, 4, 1, 8]) },
  grid5x3: { w: 5, h: 3, m: spread(5, 3) },
  grid8x1: { w: 8, h: 1, m: Int32Array.from([0, 4, 2, 6, 1, 5, 3, 7]) },
  grid1x8: { w: 1, h: 8, m: Int32Array.from([0, 4, 2, 6, 1, 5, 3, 7]) },
  grid12x4: { w: 12, h: 4, m: spread(12, 4) },
  grid4x12: { w: 4, h: 12, m: spread(4, 12) },
  diagonal5: { w: 5, h: 5, m: ranked(5, 5, (x, y) => ((x + y) % 5) * 5 + x) },
  cluster8: { w: 8, h: 8, m: ranked(8, 8, (x, y) => Math.hypot(x - 3.5, y - 3.5)) },
};

/** The threshold offset (-0.5..0.5) of an ordered matrix at a pixel, tiled in both directions. */
export function orderedAt(o: { w: number; h: number; m: Int32Array }, x: number, y: number): number {
  const n = o.w * o.h, mx = ((x % o.w) + o.w) % o.w, my = ((y % o.h) + o.h) % o.h;
  return o.m[my * o.w + mx]! / n - 0.5 + 0.5 / n;
}

/** Error-diffusion kernels: [dx, dy, weight], weights divided by `div`. */
const KERNELS: Partial<Record<DitherMethod, { div: number; k: [number, number, number][] }>> = {
  floyd: { div: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  // Atkinson spreads only 6/8 of the error: crisp, high-contrast look
  atkinson: { div: 8, k: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  jjn: { div: 48, k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { div: 42, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  burkes: { div: 32, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra: { div: 32, k: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
};

// nearest palette entry for a colour squashed to 5 bits per channel, built once per palette
const luts = new Map<PaletteId, Uint8Array>();
function lutFor(id: PaletteId): Uint8Array {
  const hit = luts.get(id);
  if (hit) return hit;
  const pal = paletteColors(id);
  const lut = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) {
    const r = ((i >> 10) << 3) | 4, g = (((i >> 5) & 31) << 3) | 4, b = ((i & 31) << 3) | 4;
    let best = 0, bd = Infinity;
    for (let p = 0; p < pal.length; p++) {
      const c = pal[p]!;
      // weighted so green matters most, as the eye does
      const d = 0.3 * (r - c[0]) ** 2 + 0.59 * (g - c[1]) ** 2 + 0.11 * (b - c[2]) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    lut[i] = best;
  }
  luts.set(id, lut);
  return lut;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Dither RGBA pixels in place. Transparent pixels are left alone (and pass no error on); alpha is
 * never changed. `gray` turns the colour to grey first. `strength` (0..1) lets the dithered result
 * mix back into the original.
 */
export function ditherPixels(px: Uint8ClampedArray, w: number, h: number, opts: { palette: PaletteId; method: DitherMethod; gray?: boolean; strength?: number; bias?: [number, number, number] }): void {
  const pal = paletteColors(opts.palette);
  const lut = lutFor(opts.palette);
  const mix = opts.strength ?? 1;
  const n = w * h;
  // a palette that is one colour in different brightnesses (1-bit, Game Boy) is matched by brightness
  const grey = opts.gray || opts.palette === 'bw' || opts.palette === 'gameboy';
  // working colour per pixel (floats, so diffused error is kept exactly)
  const work = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let r = px[i * 4]!, g = px[i * 4 + 1]!, b = px[i * 4 + 2]!;
    if (grey) r = g = b = 0.299 * r + 0.587 * g + 0.114 * b;
    work[i * 3] = r; work[i * 3 + 1] = g; work[i * 3 + 2] = b;
  }
  const original = mix < 1 ? Float32Array.from(work) : null;
  const pick = (r: number, g: number, b: number) => lut[((clamp255(r) >> 3) << 10) | ((clamp255(g) >> 3) << 5) | (clamp255(b) >> 3)]!;
  const ordered = ORDERED[opts.method];
  // per-channel thresholds: push a channel lighter or darker before it is matched
  const [br, bg, bb] = opts.bias ?? [0, 0, 0];
  const kernel = KERNELS[opts.method];
  // ordered dither pushes each channel by up to +-spread/2, wide enough to cross a palette step
  const spread = opts.palette === 'bw' ? 255 : 255 / Math.cbrt(pal.length);
  for (let y = 0; y < h; y++) {
    // serpentine: odd rows run backwards, so error diffusion leaves no diagonal streaks
    const back = !!kernel && (y & 1) === 1;
    for (let k = 0; k < w; k++) {
      const x = back ? w - 1 - k : k;
      const i = y * w + x;
      if (!px[i * 4 + 3]) continue;
      let r = work[i * 3]! + br, g = work[i * 3 + 1]! + bg, b = work[i * 3 + 2]! + bb;
      if (ordered) {
        const m = orderedAt(ordered, x, y);
        r += m * spread; g += m * spread; b += m * spread;
      }
      const c = pal[pick(r, g, b)]!;
      if (kernel) {
        const er = clamp255(r) - c[0], eg = clamp255(g) - c[1], eb = clamp255(b) - c[2];
        for (const [dx, dy, wt] of kernel.k) {
          const nx = x + (back ? -dx : dx), ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!px[j * 4 + 3]) continue;
          const f = wt / kernel.div;
          work[j * 3] = work[j * 3]! + er * f; work[j * 3 + 1] = work[j * 3 + 1]! + eg * f; work[j * 3 + 2] = work[j * 3 + 2]! + eb * f;
        }
      }
      if (original) {
        px[i * 4] = original[i * 3]! + (c[0] - original[i * 3]!) * mix;
        px[i * 4 + 1] = original[i * 3 + 1]! + (c[1] - original[i * 3 + 1]!) * mix;
        px[i * 4 + 2] = original[i * 3 + 2]! + (c[2] - original[i * 3 + 2]!) * mix;
      } else {
        px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2];
      }
    }
  }
}
