/**
 * Effects added in November 2026 (format 10): Fill, Outline (one or many repeating lines),
 * Venetian blinds, Kaleidoscope and Sound wave. Pure pixel work on the effect's padded working
 * canvas, like the rest of view/effects.ts. Everything is seeded or frame-based, so a frame
 * renders the same in the canvas, Share preview and exports.
 */
import { makeCanvas } from '../brush/raster';
import { fft } from '../core/audioreact';
import { OUTLINE_MAX_REACH, outlineReach, param, type LayerEffect } from '../core/effects';
import { hash01 } from '../core/rng';

type RGB = [number, number, number];
const hex = (h: string): RGB => { const v = /^#([0-9a-f]{6})$/i.exec(h)?.[1] ?? '000000'; return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; };
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------
// Distance fields

const INF = 1e20;
/** One row of the exact squared Euclidean distance transform (Felzenszwalb and Huttenlocher). */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1]! < q) k++; d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!; }
}

/** Distance (pixels) from every pixel to the nearest pixel where `inside` is set (0 there). */
export function distanceField(inside: Uint8Array, w: number, h: number, square = false): Float32Array {
  const out = new Float32Array(w * h);
  if (square) {
    // Chebyshev distance (square corners): two chamfer passes with every neighbour costing 1
    for (let i = 0; i < w * h; i++) out[i] = inside[i] ? 0 : INF;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let d = out[i]!;
      if (x > 0) d = Math.min(d, out[i - 1]! + 1);
      if (y > 0) { d = Math.min(d, out[i - w]! + 1); if (x > 0) d = Math.min(d, out[i - w - 1]! + 1); if (x < w - 1) d = Math.min(d, out[i - w + 1]! + 1); }
      out[i] = d;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let d = out[i]!;
      if (x < w - 1) d = Math.min(d, out[i + 1]! + 1);
      if (y < h - 1) { d = Math.min(d, out[i + w]! + 1); if (x < w - 1) d = Math.min(d, out[i + w + 1]! + 1); if (x > 0) d = Math.min(d, out[i + w - 1]! + 1); }
      out[i] = d;
    }
    return out;
  }
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = inside[i] ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    edt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    edt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]!);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fill

export function fillEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const op = clamp01(e.amount / 100);
  if (!op) return;
  const [cr, cg, cb] = hex(param<string>(e, 'color')), mode = param<string>(e, 'mode');
  const g = c.getContext('2d', { willReadFrequently: true })!, img = g.getImageData(0, 0, c.width, c.height), p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const r = p[i]!, gg = p[i + 1]!, b = p[i + 2]!;
    let nr = cr, ng = cg, nb = cb;
    if (mode === 'tint') { const l = (0.299 * r + 0.587 * gg + 0.114 * b) / 255; nr = cr * l; ng = cg * l; nb = cb * l; }
    else if (mode === 'multiply') { nr = (r * cr) / 255; ng = (gg * cg) / 255; nb = (b * cb) / 255; }
    p[i] = r + (nr - r) * op; p[i + 1] = gg + (ng - gg) * op; p[i + 2] = b + (nb - b) * op;
  }
  g.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Outline (one or many lines)

const PALETTES: Record<string, string[]> = {
  rainbow: ['#e24b4a', '#ef9f27', '#fac775', '#639922', '#1d9e75', '#378add', '#7f77dd', '#d4537e'],
  fire: ['#fcde5a', '#f2a623', '#e85d24', '#d14520', '#993c1d', '#712b13'],
  neon: ['#5dcaa5', '#85b7eb', '#afa9ec', '#ed93b1', '#f0997b'],
  mono: ['#2c2c2a', '#888780'],
};

/** The outline colours, in order (one colour unless a palette or custom list is chosen). */
export function outlineColours(e: LayerEffect): RGB[] {
  const pal = param<string>(e, 'palette');
  if (pal === 'custom') return ['color', 'color2', 'color3', 'color4'].map(k => hex(param<string>(e, k)));
  return (PALETTES[pal] ?? [param<string>(e, 'color')]).map(hex);
}

function patternLevel(paint: string, x: number, y: number, s: number): number {
  if (paint === 'hatch') { const f = ((((x + y) % s) + s) % s) / s; return smooth((0.5 - Math.abs(f - 0.3)) * 6); }
  if (paint === 'dots') { const fx = (((x % s) + s) % s) - s / 2, fy = (((y % s) + s) % s) - s / 2; return smooth((0.42 - Math.hypot(fx, fy) / s) * 8); }
  if (paint === 'weave') { const k = (Math.PI * 2) / s; return 0.5 + 0.5 * Math.sin(x * k) * Math.sin(y * k); }
  return 1;
}

export function outlineEffect(c: HTMLCanvasElement, e: LayerEffect, frame: number, fps: number, pad: number): void {
  const w = c.width, h = c.height, width = Math.max(0, e.amount);
  if (width <= 0) return;
  const count = Math.max(1, Math.min(24, Math.round(Number(param<number>(e, 'count')) || 1)));
  const gap = Math.max(0, Number(param<number>(e, 'gap')) || 0), taper = clamp01(Number(param<number>(e, 'taper')) / 100), fade = clamp01(Number(param<number>(e, 'fade')) / 100);
  const soft = Math.max(0.75, e.size), position = param<string>(e, 'position'), paint = param<string>(e, 'paint');
  const scale = Math.max(2, Number(param<number>(e, 'paintScale')) || 6), colours = outlineColours(e);
  const phase = (Number(param<number>(e, 'cycle')) || 0) * (frame / Math.max(1, fps)) - (Number(param<number>(e, 'shift')) || 0);
  // the lines: their start and end along the distance, outward from the edge
  const page = Math.max(w, h) - 2 * pad, cap = Math.min(OUTLINE_MAX_REACH, outlineReach(e), page * 0.25 + width);
  const bands: { from: number; to: number; i: number }[] = [];
  let at = position === 'centre' ? -width / 2 : 0;
  for (let i = 0; i < count; i++) {
    const lw = width * (1 - (count > 1 ? (taper * i) / (count - 1) : 0));
    if (lw <= 0 || at >= cap) break;
    bands.push({ from: at, to: Math.min(cap, at + lw), i });
    at += lw + gap;
  }
  if (!bands.length) return;
  const reach = bands[bands.length - 1]!.to + soft;
  const g = c.getContext('2d', { willReadFrequently: true })!, src = g.getImageData(0, 0, w, h), s = src.data;
  // work only in the box around the art, grown by the lines' reach (the rest can hold no line)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (s[(y * w + x) * 4 + 3]! >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return;
  const grow = Math.ceil(reach + 2);
  x0 = Math.max(0, x0 - grow); y0 = Math.max(0, y0 - grow); x1 = Math.min(w - 1, x1 + grow); y1 = Math.min(h - 1, y1 + grow);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, painted = new Uint8Array(bw * bh), empty = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const a = s[((y + y0) * w + x + x0) * 4 + 3]! >= 128; painted[y * bw + x] = a ? 1 : 0; empty[y * bw + x] = a ? 0 : 1; }
  const square = param<string>(e, 'corners') === 'square';
  // inside distance too, so deep inside the art is never mistaken for the edge (Outline only shows it)
  const dOut = distanceField(painted, bw, bh, square), dIn = distanceField(empty, bw, bh, square);
  const lines = makeCanvas(w, h), lg = lines.getContext('2d', { willReadFrequently: true })!, img = lg.createImageData(w, h), o = img.data;
  const half = soft / 2;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const k = by * bw + bx, x = bx + x0, y = by + y0;
    // signed distance from the edge: positive outside the art, negative inside
    const sd = dOut[k]! > 0 ? dOut[k]! - 0.5 : -(dIn[k]! - 0.5);
    const u = position === 'inside' ? -sd : sd;
    if (u < -width - soft || u > reach) continue;
    if (position === 'outside' && u < -half) continue;
    for (const b of bands) {
      if (u < b.from - half || u > b.to + half) continue;
      let cover = Math.min(smooth((u - (b.from - half)) / soft), smooth((b.to + half - u) / soft));
      if (paint === 'hatch' || paint === 'dots' || paint === 'weave') cover *= patternLevel(paint, x, y, scale);
      if (count > 1) cover *= 1 - fade * (b.i / (count - 1));
      if (cover <= 0) break;
      const idx = b.i - phase, n = colours.length;
      let col: RGB;
      if (paint === 'gradient' && n > 1) {
        const t = ((idx % n) + n) % n, i0 = Math.floor(t), f = t - i0, a = colours[i0]!, bb = colours[(i0 + 1) % n]!;
        col = [a[0] + (bb[0] - a[0]) * f, a[1] + (bb[1] - a[1]) * f, a[2] + (bb[2] - a[2]) * f];
      } else col = colours[(((Math.floor(idx + 1e-9)) % n) + n) % n]!;
      const p = (y * w + x) * 4;
      o[p] = col[0]; o[p + 1] = col[1]; o[p + 2] = col[2]; o[p + 3] = Math.round(255 * clamp01(cover));
      break;
    }
  }
  lg.putImageData(img, 0, 0);
  g.save();
  if (param<boolean>(e, 'only')) { g.clearRect(0, 0, w, h); g.drawImage(lines, 0, 0); }
  else {
    const blend = param<string>(e, 'blend');
    g.globalCompositeOperation = position === 'outside' && blend === 'normal' ? 'destination-over' : blend === 'add' ? 'lighter' : blend === 'screen' ? 'screen' : blend === 'multiply' ? 'multiply' : 'source-over';
    g.drawImage(lines, 0, 0);
  }
  g.restore();
  lines.width = 0;
}

// ---------------------------------------------------------------------------------------------
// Venetian blinds

export function blindsEffect(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const C = clamp01(e.amount / 100), invert = param<boolean>(e, 'invert');
  if (!C && !invert) return;
  const w = c.width, h = c.height, pw = w - 2 * pad, ph = h - 2 * pad, W = Math.max(2, e.size);
  const a = (Number(param<number>(e, 'angle')) * Math.PI) / 180, nx = -Math.sin(a), ny = Math.cos(a);
  const cx = pad + pw / 2, cy = pad + ph / 2, scroll = (Number(param<number>(e, 'scroll')) / 100) * W;
  const feather = clamp01(Number(param<number>(e, 'feather')) / 100) * 0.5, style = param<string>(e, 'style');
  const stagger = clamp01(Number(param<number>(e, 'stagger')) / 100), order = param<string>(e, 'order');
  const shade = clamp01(Number(param<number>(e, 'shade')) / 100), reveal = param<boolean>(e, 'reveal'), [sr, sg, sb] = hex(param<string>(e, 'color'));
  // slat range across the page (for ordering)
  const corners = [[pad, pad], [w - pad, pad], [pad, h - pad], [w - pad, h - pad]].map(([x, y]) => ((x! - cx) * nx + (y! - cy) * ny + scroll) / W);
  const kmin = Math.floor(Math.min(...corners)), kmax = Math.floor(Math.max(...corners)), span = Math.max(1, kmax - kmin);
  const closedOf = (k: number) => {
    let o = (k - kmin) / span;
    if (order === 'reverse') o = 1 - o; else if (order === 'middle') o = Math.abs(o - 0.5) * 2; else if (order === 'random') o = hash01(e.seed, k, 71);
    return clamp01(C * (1 + stagger) - stagger * o);
  };
  const g = c.getContext('2d', { willReadFrequently: true })!, img = g.getImageData(0, 0, w, h), p = img.data;
  const soft = (dist: number) => (feather > 0 ? smooth(0.5 + dist / (2 * feather)) : dist >= 0 ? 1 : 0);
  for (let y = pad; y < h - pad; y++) for (let x = pad; x < w - pad; x++) {
    const u = ((x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny + scroll) / W, k = Math.floor(u), f = u - k, ck = closedOf(k);
    // how far into the open part this pixel is (negative = inside the closed part)
    let open: number;
    if (style === 'split') open = Math.abs(f - 0.5) - ck / 2;
    else if (style === 'iris') open = Math.min(f, 1 - f) - ck / 2;
    else open = f - ck;
    let keep = ck >= 1 ? 0 : ck <= 0 ? 1 : soft(open);
    if (invert) keep = 1 - keep;
    const i = (y * w + x) * 4, alpha = p[i + 3]!;
    if (shade > 0 && keep > 0) { const dark = 1 - shade * ck * 0.8; p[i] = p[i]! * dark; p[i + 1] = p[i + 1]! * dark; p[i + 2] = p[i + 2]! * dark; }
    if (reveal) {
      // closed slats show the slat colour over the whole page
      const cov = 1 - keep, a1 = alpha / 255 * keep, out = a1 + cov * (1 - a1);
      if (out > 0) { p[i] = (p[i]! * a1 + sr * cov * (1 - a1)) / out; p[i + 1] = (p[i + 1]! * a1 + sg * cov * (1 - a1)) / out; p[i + 2] = (p[i + 2]! * a1 + sb * cov * (1 - a1)) / out; }
      p[i + 3] = Math.round(out * 255);
    } else if (alpha) p[i + 3] = Math.round(alpha * keep);
  }
  g.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Kaleidoscope

export type Warp = (c: HTMLCanvasElement, from: (x: number, y: number, to: Float64Array) => void) => void;

export function kaleidoEffect(c: HTMLCanvasElement, e: LayerEffect, frame: number, fps: number, pad: number, warp: Warp): void {
  const w = c.width, h = c.height, pw = w - 2 * pad, ph = h - 2 * pad;
  const cx = pad + (pw * Number(param<number>(e, 'cx'))) / 100, cy = pad + (ph * Number(param<number>(e, 'cy'))) / 100;
  const N = Math.max(2, Math.min(32, Math.round(e.amount))), wedge = (Math.PI * 2) / N, size = Math.max(0.1, e.size / 100);
  const rot = ((Number(param<number>(e, 'rotation')) + Number(param<number>(e, 'spin')) * (frame / Math.max(1, fps))) * Math.PI) / 180;
  const srcA = (Number(param<number>(e, 'source')) * Math.PI) / 180, style = param<string>(e, 'style'), mix = clamp01(Number(param<number>(e, 'mix')) / 100);
  const before = mix > 0 ? makeCanvas(w, h) : null;
  before?.getContext('2d')!.drawImage(c, 0, 0);
  if (style === 'flower' || style === 'wheel') {
    // fast path: each slice is the source drawn with a rotation (and a flip for Flower), clipped to its sector
    const src = makeCanvas(w, h);
    src.getContext('2d')!.drawImage(c, 0, 0);
    const g = c.getContext('2d')!, R = Math.hypot(w, h), eps = 0.004;
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < N; k++) {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot + k * wedge);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, -eps, wedge + eps); g.closePath(); g.clip();
      if (style === 'flower' && k & 1) { g.rotate(wedge); g.scale(1, -1); }
      g.rotate(-srcA); g.scale(size, size);
      g.drawImage(src, -cx, -cy);
      g.restore();
    }
    src.width = 0;
    if (before) { g.save(); g.globalAlpha = mix; g.drawImage(before, 0, 0); g.restore(); before.width = 0; }
    return;
  }
  const L = (Math.min(pw, ph) / Math.max(2, N)) * 2 * size, R3 = Math.sqrt(3);
  const cosR = Math.cos(-rot), sinR = Math.sin(-rot);
  warp(c, (x, y, to) => {
    const dx0 = x + 0.5 - cx, dy0 = y + 0.5 - cy, dx = dx0 * cosR - dy0 * sinR, dy = dx0 * sinR + dy0 * cosR;
    if (style === 'unfold') {
      const ux = Math.abs(dx) / size, uy = Math.abs(dy) / size, ca = Math.cos(srcA), sa = Math.sin(srcA);
      to[0] = cx + ux * ca - uy * sa - 0.5; to[1] = cy + ux * sa + uy * ca - 0.5;
      return;
    }
    if (style === 'triangles') {
      // fold into one triangle of a triangular lattice, mirrored across each edge
      const u = dx / L, v = dy / L;
      let a = u - v / R3, b = (2 * v) / R3;
      const ia = Math.floor(a), ib = Math.floor(b);
      a -= ia; b -= ib;
      if (a + b > 1) { const t = a; a = 1 - b; b = 1 - t; }
      if ((ia + ib) & 1) { const t = a; a = b; b = t; }
      const tu = (a + b / 2) * L, tv = ((b * R3) / 2) * L, ca = Math.cos(srcA), sa = Math.sin(srcA);
      to[0] = cx + tu * ca - tv * sa - 0.5; to[1] = cy + tu * sa + tv * ca - 0.5;
      return;
    }
    const r = Math.hypot(dx, dy) / size;
    let t = Math.atan2(dy, dx);
    t = ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const seg = Math.floor(t / wedge);
    let f = t - seg * wedge;
    if (style !== 'wheel' && seg & 1) f = wedge - f;
    if (style === 'starlish' && seg & 1) f = (f + wedge / 2) % wedge;
    const ang = f + srcA;
    to[0] = cx + Math.cos(ang) * r - 0.5; to[1] = cy + Math.sin(ang) * r - 0.5;
  });
  if (before) {
    const g = c.getContext('2d')!;
    g.save(); g.globalAlpha = mix; g.drawImage(before, 0, 0); g.restore();
    before.width = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Sound wave

/** Mono samples for the shot that holds a layer, and the time (seconds) of a layer frame. */
export interface SoundAt { samples: Float32Array; rate: number; time: number }
export type SoundSource = (layerId: string, layerFrame: number, fps: number) => SoundAt | null;
let soundSource: SoundSource | null = null;
/** Set by the app: where Sound wave reads the shot's sound. */
export function setSoundSource(s: SoundSource | null): void { soundSource = s; }
let soundPreload: (() => Promise<void>) | null = null;
/** Set by the app: decode every sound a Sound wave could read (exports await it first). */
export function setSoundPreload(f: (() => Promise<void>) | null): void { soundPreload = f; }
/** Wait until Sound wave effects have their sound (no-op without a preload). */
export async function soundReady(): Promise<void> { await soundPreload?.(); }

/** Values 0..1 (spectrum, bars) or −1..1 (waveform lines) at `n` points for the window ending at `time`. */
export function soundValues(snd: SoundAt, e: LayerEffect, time: number, n: number): Float32Array {
  const type = param<string>(e, 'type'), look = param<string>(e, 'look');
  const win = Math.max(0.01, Number(param<number>(e, 'window')) / 1000), rate = snd.rate, s = snd.samples;
  const start = Math.floor((time - win) * rate), len = Math.max(2, Math.floor(win * rate)), out = new Float32Array(n);
  const at = (i: number) => (i >= 0 && i < s.length ? s[i]! : 0);
  if (type === 'spectrum') {
    let size = 256;
    while (size < Math.min(len, 4096)) size *= 2;
    const re = new Float64Array(size), im = new Float64Array(size), from = start + len - size;
    for (let i = 0; i < size; i++) re[i] = at(from + i) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    fft(re, im);
    const lo = Math.max(1, Number(param<number>(e, 'low'))), hi = Math.max(lo + 1, Number(param<number>(e, 'high'))), nyq = rate / 2;
    for (let b = 0; b < n; b++) {
      const f0 = lo * Math.pow(hi / lo, b / n), f1 = lo * Math.pow(hi / lo, (b + 1) / n);
      const k0 = Math.max(1, Math.floor((Math.min(f0, nyq) / nyq) * (size / 2))), k1 = Math.max(k0 + 1, Math.ceil((Math.min(f1, nyq) / nyq) * (size / 2)));
      let m = 0;
      for (let k = k0; k < k1 && k < size / 2; k++) m = Math.max(m, Math.hypot(re[k]!, im[k]!));
      out[b] = clamp01(Math.log10(1 + (m / size) * 400) / 1.6);
    }
    return out;
  }
  // waveform: per point, the signed sample (lines) or the peak (bars, dots)
  const per = len / n;
  for (let i = 0; i < n; i++) {
    const a = start + Math.floor(i * per), b = start + Math.floor((i + 1) * per);
    if (look === 'lines') out[i] = at(a);
    else { let m = 0; for (let k = a; k < Math.max(b, a + 1); k++) m = Math.max(m, Math.abs(at(k))); out[i] = m; }
  }
  return out;
}

export function soundwaveEffect(c: HTMLCanvasElement, e: LayerEffect, frame: number, fps: number, pad: number, layerId: string, blur: (c: HTMLCanvasElement, radius: number) => void): void {
  const w = c.width, h = c.height, pw = w - 2 * pad, ph = h - 2 * pad, g = c.getContext('2d')!;
  const n = Math.max(8, Math.min(1024, Math.round(Number(param<number>(e, 'detail'))))), height = Math.max(0, e.amount), thick = Math.max(0.5, e.size);
  const snd = soundSource?.(layerId, frame, fps) ?? null;
  const offset = Number(param<number>(e, 'offsetMs')) / 1000, frames = Math.round((clamp01(Number(param<number>(e, 'smoothing')) / 100)) * 8);
  let vals = new Float32Array(n);
  if (snd) {
    for (let k = 0; k <= frames; k++) {
      const v = soundValues(snd, e, snd.time + offset - k / Math.max(1, fps), n);
      for (let i = 0; i < n; i++) vals[i] = vals[i]! + v[i]! / (frames + 1);
    }
  } else vals = new Float32Array(n);
  const inside = hex(param<string>(e, 'color')), outside = hex(param<string>(e, 'color2'));
  const col = (t: number) => { const u = clamp01(t); return `rgb(${Math.round(inside[0] + (outside[0] - inside[0]) * u)},${Math.round(inside[1] + (outside[1] - inside[1]) * u)},${Math.round(inside[2] + (outside[2] - inside[2]) * u)})`; };
  const look = param<string>(e, 'look'), sides = param<string>(e, 'sides'), shape = param<string>(e, 'shape');
  // base point and outward normal of point i
  const base = (i: number): [number, number, number, number] => {
    const t = n > 1 ? i / (n - 1) : 0;
    if (shape === 'circle') {
      const R = (Math.min(pw, ph) / 2) * (Number(param<number>(e, 'radius')) / 100), cx = pad + (pw * Number(param<number>(e, 'cx'))) / 100, cy = pad + (ph * Number(param<number>(e, 'cy'))) / 100;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a);
      return [cx + ux * R, cy + uy * R, ux, uy];
    }
    const x1 = pad + (pw * Number(param<number>(e, 'x1'))) / 100, y1 = pad + (ph * Number(param<number>(e, 'y1'))) / 100, x2 = pad + (pw * Number(param<number>(e, 'x2'))) / 100, y2 = pad + (ph * Number(param<number>(e, 'y2'))) / 100;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, tx = (x2 - x1) / len, ty = (y2 - y1) / len;
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, ty, -tx];
  };
  const wave = makeCanvas(w, h), wg = wave.getContext('2d')!;
  wg.lineWidth = thick; wg.lineCap = 'round'; wg.lineJoin = 'round';
  const signs = sides === 'both' ? [1, -1] : sides === 'down' ? [-1] : [1];
  if (look === 'lines') {
    // Both: the classic signed wave through the middle. Up or Down: a one-sided envelope.
    for (const sgn of sides === 'both' ? [1] : signs) {
      wg.beginPath();
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const [bx, by, nx, ny] = base(i), v = sides === 'both' ? vals[i]! : Math.abs(vals[i]!), d = sgn * v * height;
        peak = Math.max(peak, Math.abs(vals[i]!));
        if (i) wg.lineTo(bx + nx * d, by + ny * d); else wg.moveTo(bx + nx * d, by + ny * d);
      }
      if (shape === 'circle') wg.closePath();
      wg.strokeStyle = col(peak);
      wg.stroke();
    }
  } else {
    for (let i = 0; i < n; i++) {
      const [bx, by, nx, ny] = base(i), v = Math.abs(vals[i]!), d = v * height;
      wg.strokeStyle = wg.fillStyle = col(v);
      if (look === 'dots') {
        for (const sgn of signs) { wg.beginPath(); wg.arc(bx + nx * d * sgn, by + ny * d * sgn, thick / 2, 0, Math.PI * 2); wg.fill(); }
      } else {
        const a = sides === 'both' ? -d : 0, b = sides === 'down' ? -d : d;
        wg.beginPath(); wg.moveTo(bx + nx * a, by + ny * a); wg.lineTo(bx + nx * Math.max(b, a + 0.5), by + ny * Math.max(b, a + 0.5)); wg.stroke();
      }
    }
  }
  const softness = clamp01(Number(param<number>(e, 'softness')) / 100);
  if (softness > 0) blur(wave, softness * thick * 2);
  g.save();
  if (!param<boolean>(e, 'over')) g.clearRect(0, 0, w, h);
  g.drawImage(wave, 0, 0);
  g.restore();
  wave.width = 0;
}
