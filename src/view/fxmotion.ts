/**
 * Simple motion and look effects for students (format 14): Glitch, RGB split, Camera shake, Long
 * shadow, Duotone and Wipe. Pure pixel work on the effect's padded working canvas, like
 * view/fxextra.ts. Everything is seeded or tick-based, so a frame renders the same in the canvas,
 * Share preview and exports.
 */
import { makeCanvas } from '../brush/raster';
import { param, type LayerEffect } from '../core/effects';
import { hash01 } from '../core/rng';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const hex = (h: string): [number, number, number] => { const v = /^#([0-9a-f]{6})$/i.exec(h)?.[1] ?? '000000'; return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; };

/** One output pixel taking each colour channel from its own place (a, g, b are source pixel indices or -1). */
function takeChannels(s: Uint8ClampedArray, d: Uint8ClampedArray, o: number, r: number, g: number, b: number): void {
  const ar = r >= 0 ? s[r * 4 + 3]! : 0, ag = g >= 0 ? s[g * 4 + 3]! : 0, ab = b >= 0 ? s[b * 4 + 3]! : 0;
  d[o] = ar ? s[r * 4]! : 0;
  d[o + 1] = ag ? s[g * 4 + 1]! : 0;
  d[o + 2] = ab ? s[b * 4 + 2]! : 0;
  d[o + 3] = Math.max(ar, ag, ab);
}

/**
 * RGB split: the red channel slides one way and blue the other, along `angle`, leaving the
 * coloured fringes of a bad lens or a broken screen. `distance` in pixels.
 */
export function rgbSplitEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const dist = e.amount;
  if (dist <= 0) return;
  const w = c.width, h = c.height, a = (Number(param<number>(e, 'angle')) * Math.PI) / 180;
  const dx = Math.round(Math.cos(a) * dist), dy = Math.round(Math.sin(a) * dist);
  if (!dx && !dy) return;
  const g = c.getContext('2d', { willReadFrequently: true })!, img = g.getImageData(0, 0, w, h), s = img.data;
  const out = g.createImageData(w, h), d = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const rx = x - dx, ry = y - dy, bx = x + dx, by = y + dy;
    const ri = rx >= 0 && rx < w && ry >= 0 && ry < h ? ry * w + rx : -1;
    const bi = bx >= 0 && bx < w && by >= 0 && by < h ? by * w + bx : -1;
    takeChannels(s, d, o, ri, y * w + x, bi);
  }
  g.putImageData(out, 0, 0);
}

/**
 * Glitch: bands of the picture slide sideways (and split into colour fringes) for a moment, then
 * change. `amount` = how far a band can slide (px), `size` = band height (px); the Chance of a band
 * glitching and the Colour split are extras. The pattern comes from the seed and the tick.
 */
export function glitchEffect(c: HTMLCanvasElement, e: LayerEffect, tick: number): void {
  const w = c.width, h = c.height, shift = e.amount, band = Math.max(2, Math.round(e.size));
  const chance = clamp01(Number(param<number>(e, 'chance')) / 100), split = Math.round(Number(param<number>(e, 'split')));
  if (shift <= 0 && split <= 0) return;
  const seed = (e.seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  const g = c.getContext('2d', { willReadFrequently: true })!, img = g.getImageData(0, 0, w, h), s = img.data;
  const out = g.createImageData(w, h), d = out.data;
  d.set(s);
  // band edges vary in height (half to one and a half times the size) so it never looks like a grid
  let y0 = 0, k = 0;
  while (y0 < h) {
    const bh = Math.max(1, Math.round(band * (0.5 + hash01(seed, k, 3)))), y1 = Math.min(h, y0 + bh);
    if (hash01(seed, k, 1) < chance) {
      const dx = Math.round((hash01(seed, k, 2) * 2 - 1) * shift), sp = split ? Math.round(split * (0.5 + hash01(seed, k, 4))) : 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
        const at = (px: number) => (px >= 0 && px < w ? y * w + px : -1);
        takeChannels(s, d, (y * w + x) * 4, at(x - dx - sp), at(x - dx), at(x - dx + sp));
      }
    }
    y0 = y1; k++;
  }
  g.putImageData(out, 0, 0);
}

/** A smooth random value in -1..1 that changes with `t` (value noise; `t` in noise steps). */
function wander(seed: number, t: number, ch: number): number {
  const i = Math.floor(t), f = smooth(t - i);
  const a = hash01(seed, i, ch) * 2 - 1, b = hash01(seed, i + 1, ch) * 2 - 1;
  return a + (b - a) * f;
}

/**
 * Camera shake: the whole layer jitters. `amount` = how far (px); Turn shakes it a few degrees too;
 * Smoothness 0 jumps every tick, higher values drift like a handheld camera.
 */
export function shakeEffect(c: HTMLCanvasElement, e: LayerEffect, tick: number, pad: number): void {
  const amount = e.amount, turn = Number(param<number>(e, 'turn')), smoothness = clamp01(Number(param<number>(e, 'smooth')) / 100);
  if (amount <= 0 && turn <= 0) return;
  const w = c.width, h = c.height;
  // smoothness slows the noise: 0 = a new value every tick, 1 = ~6 ticks to change
  const t = tick * (1 - 0.85 * smoothness);
  const n = (ch: number) => (smoothness > 0 ? wander(e.seed, t, ch) : hash01(e.seed, tick, ch) * 2 - 1);
  const dx = n(1) * amount, dy = n(2) * amount, rot = (n(3) * turn * Math.PI) / 180;
  const tmp = makeCanvas(w, h);
  tmp.getContext('2d')!.drawImage(c, 0, 0);
  const g = c.getContext('2d')!;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.translate(w / 2 + dx, h / 2 + dy);
  g.rotate(rot);
  g.drawImage(tmp, -w / 2, -h / 2);
  g.restore();
  tmp.width = tmp.height = 0;
  void pad;
}

/**
 * Long shadow: a flat shadow of the art stretches away along `angle` for `amount` px, the
 * poster look. Built by doubling (about log2(length) draws), so a long shadow stays fast.
 */
export function longShadowEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const length = Math.round(e.amount);
  if (length < 1) return;
  const w = c.width, h = c.height, a = (Number(param<number>(e, 'angle')) * Math.PI) / 180;
  const ux = Math.sin(a), uy = -Math.cos(a);
  const acc = makeCanvas(w, h), ag = acc.getContext('2d')!;
  ag.drawImage(c, 0, 0);
  ag.globalCompositeOperation = 'source-in';
  ag.fillStyle = param<string>(e, 'color');
  ag.fillRect(0, 0, w, h);
  ag.globalCompositeOperation = 'source-over';
  let have = 1;
  while (have < length) {
    const step = Math.min(have, length - have);
    ag.drawImage(acc, ux * step, uy * step);
    have += step;
  }
  const g = c.getContext('2d')!;
  g.save();
  g.globalCompositeOperation = 'destination-over';
  g.globalAlpha = clamp01(Number(param<number>(e, 'opacity')) / 100);
  g.drawImage(acc, 0, 0);
  g.restore();
  acc.width = acc.height = 0;
}

/** Duotone: dark parts take one colour and light parts another, with the shades between. */
export function duotoneEffect(c: HTMLCanvasElement, e: LayerEffect): void {
  const mix = clamp01(e.amount / 100);
  if (!mix) return;
  const [dr, dg, db] = hex(param<string>(e, 'dark')), [lr, lg, lb] = hex(param<string>(e, 'light'));
  const bias = Number(param<number>(e, 'balance')) / 100;
  const g = c.getContext('2d', { willReadFrequently: true })!, img = g.getImageData(0, 0, c.width, c.height), p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const l = clamp01((0.2126 * p[i]! + 0.7152 * p[i + 1]! + 0.0722 * p[i + 2]!) / 255 + bias);
    p[i] = p[i]! + (dr + (lr - dr) * l - p[i]!) * mix;
    p[i + 1] = p[i + 1]! + (dg + (lg - dg) * l - p[i + 1]!) * mix;
    p[i + 2] = p[i + 2]! + (db + (lb - db) * l - p[i + 2]!) * mix;
  }
  g.putImageData(img, 0, 0);
}

/**
 * Wipe: hides or reveals the layer with a straight edge (Line), a turning hand (Clock) or a
 * closing circle (Iris). Completion 0% shows everything, 100% hides everything.
 */
export function wipeEffect(c: HTMLCanvasElement, e: LayerEffect, pad: number): void {
  const C = clamp01(e.amount / 100), invert = param<boolean>(e, 'invert');
  if (!C && !invert) return;
  const w = c.width, h = c.height, pw = w - 2 * pad, ph = h - 2 * pad, cx = pad + pw / 2, cy = pad + ph / 2;
  const style = param<string>(e, 'style'), feather = clamp01(Number(param<number>(e, 'feather')) / 100) * 0.5;
  const a = (Number(param<number>(e, 'angle')) * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a);
  // how far the page reaches along the wipe direction, so 100% really clears every corner
  const reach = (Math.abs(ux) * pw + Math.abs(uy) * ph) / 2 || 1, R = Math.hypot(pw, ph) / 2 || 1;
  const g = c.getContext('2d', { willReadFrequently: true })!, img = g.getImageData(0, 0, w, h), p = img.data;
  // the wipe line sits a little past each end so feathered edges still start and finish clean
  const t = C * (1 + 2 * feather) - feather;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!p[i + 3]) continue;
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    let u: number; // 0..1, small = wiped first
    if (style === 'clock') {
      let ang = Math.atan2(px, -py) - a;
      ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      u = ang / (Math.PI * 2);
    } else if (style === 'iris') u = 1 - Math.hypot(px, py) / R; // the edge closes in to the middle
    else u = 0.5 + (px * ux + py * uy) / (2 * reach);
    let keep = feather > 0 ? smooth((u - t) / (2 * feather) + 0.5) : u >= C ? 1 : 0;
    if (C >= 1) keep = 0;
    if (invert) keep = 1 - keep;
    p[i + 3] = Math.round(p[i + 3]! * keep);
  }
  g.putImageData(img, 0, 0);
}
