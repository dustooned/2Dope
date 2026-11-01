/**
 * Audio React (after FreqReact's reactors, as a bake): analyse a clip's audio offline, one value
 * per frame for a frequency band, shape it into motion (Pulse, Elastic, Oscillate, Flicker) and
 * write ordinary keyframes. No expressions and no live analysis: the keys are the result, so
 * playback, undo, autosave and every export agree. Pure functions, no globals.
 */

import { hash01 } from './rng';

/** FFT size: 2048 samples (about 46 ms at 44.1 kHz) resolves the bass band in ~21.5 Hz steps. */
export const FFT_SIZE = 2048;
/** Most frames analysed in one bake (a long clip is cut here; the dialog says so). */
export const MAX_REACT_FRAMES = 3600;

/** In-place radix-2 FFT (`re`, `im` of a power-of-two length). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci, ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti;
        re[a] = re[a]! + tr; im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export interface EnvelopeOptions {
  /** 0..100: how slowly a hit fades (0 = it follows the sound exactly). */
  decay: number;
  /** 0..100: how much the curve is smoothed (0 = raw). */
  smoothing: number;
  /** How many frames to analyse from the start of `samples`. */
  frames: number;
  /** FFT size (a power of two); default `FFT_SIZE`. */
  size?: number;
}

/**
 * The loudness of the band `startHz`..`endHz` at each frame, 0..1. Each frame takes a Hann-windowed
 * FFT centred on its time; the band's magnitudes are averaged and scaled so a full-scale sine in
 * the band reads about 1 (the level is absolute, not stretched to the loudest moment, so a quiet
 * band stays low). Then Decay holds each hit and lets it fall; Smoothing evens the curve.
 */
export function bandEnvelope(samples: Float32Array, sampleRate: number, fps: number, startHz: number, endHz: number, o: EnvelopeOptions): Float32Array {
  const n = o.size ?? FFT_SIZE, frames = Math.max(0, Math.min(MAX_REACT_FRAMES, Math.floor(o.frames)));
  const lo = Math.max(1, Math.floor((Math.min(startHz, endHz) * n) / sampleRate));
  const hi = Math.min(n / 2 - 1, Math.max(lo, Math.ceil((Math.max(startHz, endHz) * n) / sampleRate)));
  const hann = new Float64Array(n);
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const re = new Float64Array(n), im = new Float64Array(n), raw = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const centre = Math.round((f / fps) * sampleRate);
    for (let i = 0; i < n; i++) {
      const s = centre - n / 2 + i;
      re[i] = (s >= 0 && s < samples.length ? samples[s]! : 0) * hann[i]!;
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += Math.hypot(re[k]!, im[k]!);
    // mean × bins / (N/4 · 2): a Hann-windowed full-scale sine puts ~N/4 in its bin and ~N/8 on each side
    raw[f] = Math.min(1, sum / (n / 2));
  }
  const out = new Float32Array(frames), hold = Math.min(0.99, Math.max(0, o.decay) / 100), smooth = Math.min(0.95, Math.max(0, o.smoothing) / 100);
  let held = 0, y = 0;
  for (let f = 0; f < frames; f++) {
    held = Math.max(raw[f]!, held * hold);
    y = f === 0 ? held : y * smooth + held * (1 - smooth);
    out[f] = y;
  }
  return out;
}

export type Reactor = 'pulse' | 'elastic' | 'oscillate' | 'flicker';
export type OscShape = 'sine' | 'triangle' | 'square' | 'saw';

export const REACTORS: { id: Reactor; label: string; hint: string }[] = [
  { id: 'pulse', label: 'Pulse', hint: 'Moves with the loudness: up on every hit, back as it fades' },
  { id: 'elastic', label: 'Elastic', hint: 'Each hit sets off a springy wobble that dies away' },
  { id: 'oscillate', label: 'Oscillate', hint: 'A steady swing whose size follows the loudness' },
  { id: 'flicker', label: 'Flicker', hint: 'Random jitter, stronger when it is louder (seeded)' },
];

const linear = (x: number, a: number, b: number, c: number, d: number) => c + ((Math.min(Math.max(x, Math.min(a, b)), Math.max(a, b)) - a) / (b - a)) * (d - c);
/** A triangle wave, -1..1, period 1. */
const triangle = (t: number) => { const f = t - Math.floor(t); return 4 * Math.abs(f - 0.5) - 1; };
function wave(shape: OscShape, t: number): number {
  const f = t - Math.floor(t);
  if (shape === 'triangle') return triangle(t);
  if (shape === 'square') return f < 0.5 ? 1 : -1;
  if (shape === 'saw') return 2 * f - 1;
  return Math.sin(2 * Math.PI * t);
}

export const pulse = (env: number, intensity: number) => env * intensity;

/**
 * Elastic (FreqReact): `e = triangle(τ·10) / exp(τ·decay) · mod`, where τ is the time since the last
 * hit, `decay = linear(elasticity, 1, 100, 2, 0.1)` and `mod = linear(elasticity, 1, 100, 0.9, 0.55)`;
 * the wobble's size is the hit's loudness. Before the first hit it is still.
 */
export function elastic(sinceHit: number, hitLevel: number, intensity: number, elasticity: number): number {
  if (sinceHit < 0) return 0;
  const decay = linear(elasticity, 1, 100, 2, 0.1), mod = linear(elasticity, 1, 100, 0.9, 0.55);
  return (-triangle(sinceHit * 10) / Math.exp(sinceHit * decay)) * mod * hitLevel * intensity;
}

export const oscillate = (env: number, intensity: number, speedHz: number, shape: OscShape, seconds: number) => wave(shape, seconds * speedHz) * env * intensity;

export const flicker = (env: number, intensity: number, seed: number, frame: number) => (hash01(seed, frame, 53) * 2 - 1) * env * intensity;

export interface BakeOptions {
  reactor: Reactor;
  /** Largest change, in the property's units. */
  intensity: number;
  /** Percent, scales everything (−100…100 flips it). */
  master: number;
  /** Shift the reaction later (+) or earlier (−), in frames. */
  offset: number;
  fps: number;
  seed: number;
  /** Elastic: 1..100. */
  elasticity: number;
  /** Oscillate: swings a second, and the wave. */
  speed: number;
  shape: OscShape;
}

/**
 * One value per frame from `from` to `to` (inclusive), as offsets to add to the property: frame
 * `f` reads the envelope at `f - from - offset` (outside the analysed audio it is silence).
 */
export function bake(env: Float32Array, from: number, to: number, o: BakeOptions): { frame: number; value: number }[] {
  const out: { frame: number; value: number }[] = [], k = o.master / 100;
  const at = (i: number) => (i >= 0 && i < env.length ? Math.min(1, Math.max(0, env[i]!)) : 0);
  let last = -Infinity, level = 0, prev = 0;
  for (let f = from; f <= to; f++) {
    const i = f - from - Math.round(o.offset), e = at(i), t = (f - from) / o.fps;
    let v = 0;
    if (o.reactor === 'pulse') v = pulse(e, o.intensity);
    else if (o.reactor === 'oscillate') v = oscillate(e, o.intensity, o.speed, o.shape, t);
    else if (o.reactor === 'flicker') v = flicker(e, o.intensity, o.seed, f);
    else {
      // a hit: the envelope jumps up by a clear step
      if (e - prev > 0.08 && e > 0.15) { last = t; level = e; }
      v = elastic(last === -Infinity ? -1 : t - last, level, o.intensity, o.elasticity);
    }
    prev = e;
    out.push({ frame: f, value: v * k });
  }
  return out;
}

/** A mono mix of an AudioBuffer-like source's channels. */
export function monoMix(channels: readonly Float32Array[]): Float32Array {
  const n = channels[0]?.length ?? 0, out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] = out[i]! + c[i]! / channels.length;
  return out;
}
