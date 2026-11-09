/**
 * Caption geometry: fitting text so it sets the balloon size, balloon outlines, tails and shape
 * detection. Pure functions (ported from docs/research/lettering-prototype), no DOM. Text width
 * comes from a measure function the caller supplies.
 */
import type { BalloonStyle, CaptionTail } from './spec';

export type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const norm = (a: Pt): Pt => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };

// ---------------------------------------------------------------------------------------------
// Fitting: the lettering size is fixed; the text decides the balloon

export interface Fit {
  /** Lines, top to bottom, with their y (relative to the balloon centre) and width. */
  lines: { text: string; y: number; width: number }[];
  /** Balloon half-width and half-height (the text area for boxes and sound effects). */
  a: number;
  b: number;
  /** True when the text needed more room than the frame allows (the caller suggests splitting). */
  tooLong: boolean;
}

export interface FitOptions {
  /** Lettering size, page units. */
  size: number;
  /** Line spacing, 1 = the size. */
  leading: number;
  /** Largest balloon half-width and half-height allowed. */
  maxA: number;
  maxB: number;
  /** Balloon width: multiplies the style's usual width-to-height ratio (1 = usual; wider = fewer, longer lines). */
  aspect?: number;
}

/** Text width, page units, at the lettering size. */
export type Measure = (text: string) => number;

const ASPECT: Record<BalloonStyle, number> = { speech: 1.5, whisper: 1.5, thought: 1.4, shout: 1.35, box: 2.6, sfx: 1, custom: 1.5 };

/** Lay out text for a balloon style. Explicit line breaks in the text are kept as they are. */
export function fitCaption(text: string, style: BalloonStyle, measure: Measure, o: FitOptions): Fit {
  const lead = o.size * o.leading, K = ASPECT[style] * Math.min(2.5, Math.max(0.5, o.aspect ?? 1));
  const pad = style === 'shout' ? o.size * 1.4 : style === 'thought' ? o.size * 1.2 : o.size * 0.9;
  const paragraphs = text.split('\n');
  if (style === 'sfx' || paragraphs.length > 1 || !text.trim()) {
    // the student's own lines (or a sound effect): the balloon fits around them
    const lines = paragraphs.map(t => ({ text: t, width: measure(t) }));
    const top = -((lines.length - 1) * lead) / 2, wMax = Math.max(o.size, ...lines.map(l => l.width));
    const out = lines.map((l, i) => ({ ...l, y: top + i * lead }));
    if (style === 'sfx' || style === 'box') return { lines: out, a: wMax / 2 + (style === 'box' ? pad : 0), b: (lines.length * lead) / 2 + (style === 'box' ? pad * 0.7 : 0), tooLong: false };
    // an ellipse around a block of lines: corners of the block must sit inside the inset ellipse
    const hb = (lines.length * lead) / 2, hw = wMax / 2, k = K;
    let b = Math.max(hb + pad, (hw + pad) / k);
    for (let i = 0; i < 60 && (hw / (k * b - pad)) ** 2 + (hb / (b - pad)) ** 2 > 1; i++) b *= 1.04;
    return { lines: out, a: Math.min(k * b, o.maxA), b: Math.min(b, o.maxB), tooLong: k * b > o.maxA || b > o.maxB };
  }
  const words = text.split(/\s+/).filter(Boolean), W = words.length, wordW = words.map(measure), space = measure(' ');
  // running totals: the width of words i..j-1 on one line in constant time
  const pre = [0];
  for (let k = 0; k < W; k++) pre.push(pre[k]! + wordW[k]!);
  const span = (i: number, j: number) => pre[j]! - pre[i]! + space * Math.max(0, j - i - 1);
  const breakLines = (caps: { y: number; cap: number }[]) => {
    const n = caps.length, INF = Infinity, cost = Array.from({ length: n + 1 }, () => new Array<number>(W + 1).fill(INF)), from = Array.from({ length: n + 1 }, () => new Array<number>(W + 1).fill(-1));
    cost[0]![0] = 0;
    for (let l = 1; l <= n; l++) for (let j = l; j <= W; j++) for (let i = j - 1; i >= l - 1; i--) {
      const w = span(i, j), slack = caps[l - 1]!.cap - w;
      // a longer line (smaller i) only gets wider: stop at the first that overflows
      if (slack < 0) break;
      if (cost[l - 1]![i] === INF) continue;
      const v = cost[l - 1]![i]! + (slack / caps[l - 1]!.cap) ** 2;
      if (v < cost[l]![j]!) { cost[l]![j] = v; from[l]![j] = i; }
    }
    if (cost[n]![W] === INF) return null;
    const lines: Fit['lines'] = [];
    for (let l = n, j = W; l > 0; l--) { const i = from[l]![j]!; lines.unshift({ text: words.slice(i, j).join(' '), width: span(i, j), y: caps[l - 1]!.y }); j = i; }
    return lines;
  };
  const caps = (n: number, a: number, b: number) => {
    const top = -((n - 1) * lead) / 2, out: { y: number; cap: number }[] = [];
    for (let i = 0; i < n; i++) {
      const y = top + i * lead;
      if (style === 'box') { if ((n * lead) / 2 > b - pad * 0.7) return null; out.push({ y, cap: 2 * (a - pad) }); continue; }
      const yy = Math.abs(y) + o.size / 2, inner = 1 - (yy / (b - pad * 0.6)) ** 2;
      if (inner <= 0) return null;
      out.push({ y, cap: 2 * (a * Math.sqrt(inner) - pad) });
    }
    return out;
  };
  let best: (Fit & { area: number }) | null = null;
  const widest = Math.max(...wordW);
  for (let n = 1; n <= Math.min(16, W); n++) {
    // too few lines for the longest line the frame allows: skip without searching
    if (pre[W]! / n > 2 * o.maxA) continue;
    let lo = Math.max(o.size * 0.6, widest / (2 * K)), hi = Math.max(lo * 2, o.maxB * 1.5), found: { a: number; b: number; lines: Fit['lines'] } | null = null;
    for (let it = 0; it < 26; it++) {
      const b = (lo + hi) / 2, a = Math.min(K * b, o.maxA), c = caps(n, a, b), lines = c && breakLines(c);
      if (lines) { found = { a, b, lines }; hi = b; } else lo = b;
    }
    if (!found || found.b > o.maxB) continue;
    const area = found.a * found.b;
    if (!best || area < best.area * 0.97) best = { ...found, area, tooLong: false };
  }
  if (best) return { lines: best.lines, a: best.a, b: best.b, tooLong: false };
  // past the frame: never squeeze the letters; one long line per word group, flagged
  const lines = [{ text, width: measure(text), y: 0 }];
  return { lines, a: o.maxA, b: o.maxB, tooLong: true };
}

// ---------------------------------------------------------------------------------------------
// Balloon outlines (closed, around the centre 0,0)

function hash(seed: number, i: number): number { let x = Math.imul(seed ^ (i * 0x9e3779b1), 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }

export function balloonOutline(style: BalloonStyle, a: number, b: number, seed = 1, custom?: [number, number][]): Pt[] {
  if (style === 'custom' && custom?.length) return custom.map(([x, y]) => ({ x, y }));
  if (style === 'box') {
    const r = Math.min(a, b) * 0.12, out: Pt[] = [];
    const corner = (cx: number, cy: number, from: number) => { for (let i = 0; i <= 6; i++) { const t = from + (i / 6) * (Math.PI / 2); out.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r }); } };
    corner(a - r, b - r, 0); corner(-a + r, b - r, Math.PI / 2); corner(-a + r, -b + r, Math.PI); corner(a - r, -b + r, Math.PI * 1.5);
    return out;
  }
  const n = 180;
  if (style === 'thought') {
    // scallops whose size follows the balloon, all bulging outward
    const perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))), k = Math.max(6, Math.min(16, Math.round(perim / (Math.min(a, b) * 0.9))));
    return Array.from({ length: n * 2 }, (_, i) => { const t = (i / (n * 2)) * Math.PI * 2, s = 1 + 0.16 * Math.pow(Math.abs(Math.sin((k * t) / 2)), 0.55); return { x: Math.cos(t) * a * s, y: Math.sin(t) * b * s }; });
  }
  if (style === 'shout') {
    const spikes = Math.max(10, Math.min(22, Math.round((a + b) / 18))), out: Pt[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const t = (i / (spikes * 2)) * Math.PI * 2, r = i % 2 ? 0.96 : 1.22 + (hash(seed, i) - 0.5) * 0.16;
      out.push({ x: Math.cos(t) * a * r, y: Math.sin(t) * b * r });
    }
    return out;
  }
  return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return { x: Math.cos(t) * a, y: Math.sin(t) * b }; });
}

// ---------------------------------------------------------------------------------------------
// Tails

export function inside(poly: Pt[], p: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const centroid = (poly: Pt[]) => mul(poly.reduce((s, p) => add(s, p), { x: 0, y: 0 }), 1 / poly.length);

function exitPoint(poly: Pt[], toward: Pt): Pt {
  const c = centroid(poly), d = norm(sub(toward, c));
  let best = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, e = sub(b, a), den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, c), t = (w.x * e.y - w.y * e.x) / den, u = (w.x * d.y - w.y * d.x) / den;
    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }
  return best > 0 ? add(c, mul(d, best)) : toward;
}

function centreline(poly: Pt[], tip: Pt, bend: Pt | null, n = 40): Pt[] {
  const base = exitPoint(poly, bend ?? tip), c = centroid(poly);
  const start = add(base, mul(norm(sub(c, base)), Math.min(dist(c, base) * 0.5, 30)));
  const ctrl = bend ?? mul(add(base, tip), 0.5);
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return { x: u * u * start.x + 2 * u * t * ctrl.x + t * t * tip.x, y: u * u * start.y + 2 * u * t * ctrl.y + t * t * tip.y }; });
}

function wedge(line: Pt[], width: number): { L: Pt[]; R: Pt[] } {
  const L: Pt[] = [], R: Pt[] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!, t = norm(sub(b, a)), nr = { x: -t.y, y: t.x }, w = (width / 2) * (1 - i / (line.length - 1));
    L.push(add(p, mul(nr, w))); R.push(add(p, mul(nr, -w)));
  });
  return { L, R };
}

function crossing(p1: Pt, p2: Pt, poly: Pt[]): { i: number; p: Pt } | null {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, r = sub(p2, p1), s = sub(b, a), den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, p1), t = (w.x * s.y - w.y * s.x) / den, u = (w.x * r.y - w.y * r.x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { i, p: add(p1, mul(r, t)) };
  }
  return null;
}

function sideExit(side: Pt[], poly: Pt[]): { i: number; p: Pt; k: number } | null {
  for (let k = 1; k < side.length; k++) if (inside(poly, side[k - 1]!) && !inside(poly, side[k]!)) { const c = crossing(side[k - 1]!, side[k]!, poly); if (c) return { ...c, k }; }
  return null;
}

function selfCrosses(p: Pt[]): boolean {
  const n = p.length, o = (a: Pt, b: Pt, c: Pt) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = p[i]!, b = p[(i + 1) % n]!, c = p[j]!, d = p[(j + 1) % n]!;
    if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
  }
  return false;
}

/** The balloon outline with a tail spliced in (no seam), or null when it cannot merge cleanly. */
export function mergeTail(poly: Pt[], tip: Pt, bend: Pt | null, width: number): Pt[] | null {
  const { L, R } = wedge(centreline(poly, tip, bend), width);
  const a = sideExit(L, poly), b = sideExit(R, poly);
  if (!a || !b) return null;
  const reenters = (side: Pt[]) => side.some((p, k) => k > 0 && !inside(poly, side[k - 1]!) && inside(poly, p));
  if (reenters(L) || reenters(R)) return null;
  const outL = [a.p, ...L.slice(a.k)], outR = [b.p, ...R.slice(b.k)], n = poly.length;
  const forward = (from: number, to: number) => { const pts: Pt[] = []; for (let i = (from + 1) % n; ; i = (i + 1) % n) { pts.push(poly[i]!); if (i === to || pts.length > n) break; } return pts; };
  const tailPoly = [...outL, ...[...outR].reverse()], under = (pts: Pt[]) => pts.some(p => inside(tailPoly, p));
  const keep1 = forward(b.i, a.i), keep2 = forward(a.i, b.i);
  const useFirst = keep1.length >= keep2.length ? !under(keep1) || under(keep2) : under(keep2);
  const out = useFirst ? [b.p, ...keep1, ...outL, ...[...outR].reverse().slice(1)] : [a.p, ...keep2, ...outR, ...[...outL].reverse().slice(1)];
  // a result that crosses itself falls back to a seam tail
  const step = Math.max(1, Math.floor(out.length / 220));
  return selfCrosses(out.filter((_, i) => i % step === 0)) ? null : out;
}

/** A closed tail drawn over the balloon edge (the seam look), starting just inside the edge. */
export function seamTail(poly: Pt[], tip: Pt, bend: Pt | null, width: number): Pt[] {
  const { L, R } = wedge(centreline(poly, tip, bend), width);
  const first = (side: Pt[]) => Math.max(0, side.findIndex(p => !inside(poly, p)) - 1);
  const k = Math.min(first(L), first(R));
  return [...L.slice(k), ...[...R.slice(k)].reverse()];
}

/** Thought tail: shrinking circles from the edge to the tip. */
export function bubbleTail(poly: Pt[], tip: Pt, bend: Pt | null, width: number, count = 3): (Pt & { r: number })[] {
  const line = centreline(poly, tip, bend, 60), from = Math.max(0, line.findIndex(p => !inside(poly, p)));
  return Array.from({ length: count }, (_, k) => { const t = (k + 0.6) / count, p = line[Math.round(from + (line.length - 1 - from) * t)]!; return { ...p, r: Math.max(2, (width / 2) * (1 - k / count) * 0.75) }; });
}

/** Radio or phone tail: a zigzag from the edge to the tip. */
export function lightningTail(poly: Pt[], tip: Pt, width: number, zigs = 3): Pt[] {
  const base = exitPoint(poly, tip), d = sub(tip, base), dir = norm(d), nr = { x: -dir.y, y: dir.x }, amp = width * 0.8;
  return Array.from({ length: zigs * 2 + 1 }, (_, i) => { const t = i / (zigs * 2), p = add(base, mul(d, t)); return i === 0 || i === zigs * 2 ? p : add(p, mul(nr, i % 2 ? amp : -amp)); });
}

/** Everything a caption's balloon draws: the outline (tails merged in) and separate tail shapes. */
export interface BalloonShapes { outline: Pt[]; seams: Pt[][]; bubbles: (Pt & { r: number })[]; zigzags: Pt[][] }

export function balloonShapes(outline: Pt[], tails: CaptionTail[], cx: number, cy: number, size: number): BalloonShapes {
  let poly = outline.map(p => ({ x: p.x + cx, y: p.y + cy }));
  const seams: Pt[][] = [], bubbles: (Pt & { r: number })[] = [], zigzags: Pt[][] = [];
  for (const t of tails) {
    const tip = { x: t.x, y: t.y }, bend = t.bend ? { x: t.bend[0], y: t.bend[1] } : null, w = t.width * size;
    if (inside(poly, tip) || t.join === 'none') continue;
    if (t.join === 'bubbles') bubbles.push(...bubbleTail(poly, tip, bend, w * 1.6));
    else if (t.join === 'lightning') zigzags.push(lightningTail(poly, tip, w * 0.5));
    else {
      const merged = t.join === 'merged' ? mergeTail(poly, tip, bend, w) : null;
      if (merged) poly = merged; else seams.push(seamTail(poly, tip, bend, w));
    }
  }
  return { outline: poly, seams, bubbles, zigzags };
}

// ---------------------------------------------------------------------------------------------
// Shape detection (a drawn closed loop → a balloon style)

function resample(p: Pt[], n: number): Pt[] {
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1]! + dist(p[i - 1]!, p[i]!));
  const total = L[L.length - 1]!, out: Pt[] = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const at = (total * i) / n;
    while (k < p.length - 1 && L[k]! < at) k++;
    const a = p[k - 1]!, b = p[k]!, s = L[k]! - L[k - 1]!, t = s > 0 ? (at - L[k - 1]!) / s : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}
function area(p: Pt[]): number { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i]!, r = p[(i + 1) % p.length]!; a += q.x * r.y - r.x * q.y; } return Math.abs(a) / 2; }
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y), cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo: Pt[] = [], hi: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function minRectArea(h: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!, b = h[(i + 1) % h.length]!, l = dist(a, b) || 1, ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of h) { const u = q.x * ux + q.y * uy, v = -q.x * uy + q.y * ux; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    best = Math.min(best, (x1 - x0) * (y1 - y0));
  }
  return best;
}
function bigPeaks(r: number[], prom: number): number {
  const n = r.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const v = r[i]!;
    if (!(v >= r[(i - 1 + n) % n]! && v > r[(i + 1) % n]!)) continue;
    let left = v, right = v;
    for (let j = 1; j < n / 2; j++) { const w = r[(i - j + n) % n]!; if (w > v) break; left = Math.min(left, w); }
    for (let j = 1; j < n / 2; j++) { const w = r[(i + j) % n]!; if (w > v) break; right = Math.min(right, w); }
    if (v - Math.max(left, right) >= prom) count++;
  }
  return count;
}

export type Detected = 'open' | 'speech' | 'box' | 'thought' | 'shout' | 'custom';

/** What a drawn stroke is as a balloon. Over 1,800 synthetic sloppy drawings this was 97–99% right. */
export function detectBalloon(raw: Pt[]): Detected {
  if (raw.length < 8) return 'open';
  let len = 0;
  for (let i = 1; i < raw.length; i++) len += dist(raw[i - 1]!, raw[i]!);
  if (len < 20 || dist(raw[0]!, raw[raw.length - 1]!) > len * 0.18) return 'open';
  const N = 256, p = resample(raw, N), cx = p.reduce((s, q) => s + q.x, 0) / N, cy = p.reduce((s, q) => s + q.y, 0) / N;
  const r0 = p.map(q => Math.hypot(q.x - cx, q.y - cy)), mean = r0.reduce((a, b) => a + b, 0) / N;
  const r = r0.map((_, i) => { let s = 0; for (let k = -2; k <= 2; k++) s += r0[(i + k + N) % N]!; return s / 5 / mean; });
  const h = hull(p), a = area(p), solidity = a / area(h), rectFill = a / minRectArea(h), big = bigPeaks(r, 0.18);
  const sm = p.map((_, i) => { let x = 0, y = 0; for (let k = -3; k <= 3; k++) { const q = p[(i + k + N) % N]!; x += q.x; y += q.y; } return { x: x / 7, y: y / 7 }; });
  let signed = 0;
  for (let i = 0; i < N; i++) { const q = sm[i]!, w = sm[(i + 1) % N]!; signed += q.x * w.y - w.x * q.y; }
  const orient = signed >= 0 ? 1 : -1, S = 4;
  const turn = sm.map((_, i) => { const A = sm[(i - S + N) % N]!, B = sm[i]!, C = sm[(i + S) % N]!, t = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(B.y - A.y, B.x - A.x); return orient * Math.atan2(Math.sin(t), Math.cos(t)); });
  const straight = turn.filter(t => Math.abs(t) < 0.035).length / N;
  let dents = 0, inDent = false;
  for (let i = 0; i < N; i++) { const d = turn[i]! < -0.06; if (d && !inDent) dents++; inDent = d; }
  if (inDent && turn[0]! < -0.06 && dents > 1) dents--;
  if (big >= 5 && solidity < 0.86) return 'shout';
  if (straight >= 0.26 && solidity >= 0.95 && rectFill >= 0.88) return 'box';
  if (dents >= 6 && dents <= 20 && solidity > 0.88 && straight < 0.1) return 'thought';
  if (solidity >= 0.985 && rectFill >= 0.74 && rectFill < 0.84 && dents <= 4) return 'speech';
  return 'custom';
}
