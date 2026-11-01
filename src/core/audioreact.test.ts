import { describe, expect, it } from 'vitest';
import { bake, bandEnvelope, elastic, fft, flicker, oscillate, pulse, type BakeOptions } from './audioreact';

const RATE = 44100, FPS = 24;
const tone = (hz: number, seconds: number, amp = 0.8) => Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
const opts = { decay: 0, smoothing: 0, frames: 48 };
const mid = (e: Float32Array) => e[Math.floor(e.length / 2)]!;

describe('FFT and band envelope', () => {
  it('the FFT finds a pure tone in its bin', () => {
    const n = 64, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    fft(re, im);
    expect(Math.hypot(re[5]!, im[5]!)).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[9]!, im[9]!)).toBeLessThan(1e-9);
  });

  it('a 100 Hz sine peaks in the 90–110 Hz band; a 1 kHz tone does not', () => {
    const low = bandEnvelope(tone(100, 2), RATE, FPS, 90, 110, opts);
    const high = bandEnvelope(tone(1000, 2), RATE, FPS, 90, 110, opts);
    const highBand = bandEnvelope(tone(1000, 2), RATE, FPS, 900, 1100, opts);
    expect(mid(low)).toBeGreaterThan(0.5);
    expect(mid(high)).toBeLessThan(0.01);
    expect(mid(highBand)).toBeGreaterThan(0.5);
    expect(mid(low) / Math.max(1e-6, mid(high))).toBeGreaterThan(100);
  });

  it('silence is 0, decay holds a hit, smoothing slows the rise; it is deterministic', () => {
    expect(Math.max(...bandEnvelope(new Float32Array(RATE), RATE, FPS, 10, 250, opts))).toBe(0);
    const hit = new Float32Array(RATE * 2);
    hit.set(tone(100, 0.1), Math.round(RATE * 0.5));
    const sharp = bandEnvelope(hit, RATE, FPS, 10, 250, opts), held = bandEnvelope(hit, RATE, FPS, 10, 250, { ...opts, decay: 90 });
    const after = 12 + 8; // a third of a second after the hit
    expect(held[after]!).toBeGreaterThan(sharp[after]! + 0.1);
    const smooth = bandEnvelope(hit, RATE, FPS, 10, 250, { ...opts, smoothing: 80 });
    expect(Math.max(...smooth)).toBeLessThan(Math.max(...sharp));
    expect(bandEnvelope(hit, RATE, FPS, 10, 250, opts)).toEqual(sharp);
  });

  it('measures the cost of 10 s of audio at FFT 2048', () => {
    const t = performance.now();
    bandEnvelope(tone(80, 10), RATE, FPS, 10, 250, { ...opts, frames: 240 });
    const ms = performance.now() - t;
    console.log(`bandEnvelope 10 s / 240 frames / FFT 2048: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1000);
  });
});

describe('reactors and bake', () => {
  const base: BakeOptions = { reactor: 'pulse', intensity: 40, master: 100, offset: 0, fps: FPS, seed: 7, elasticity: 50, speed: 3, shape: 'sine' };
  const env = Float32Array.from({ length: 48 }, (_, i) => (i % 12 < 3 ? 1 : 0.08 * (i % 12)));

  it('every reactor stays within ±intensity × master', () => {
    for (const reactor of ['pulse', 'elastic', 'oscillate', 'flicker'] as const) {
      for (const master of [100, 50, -100]) {
        const keys = bake(env, 10, 57, { ...base, reactor, master });
        expect(keys).toHaveLength(48);
        for (const k of keys) expect(Math.abs(k.value)).toBeLessThanOrEqual(40 * Math.abs(master) / 100 + 1e-9);
      }
    }
    expect(pulse(0.5, 10)).toBe(5);
    expect(Math.abs(oscillate(1, 10, 2, 'square', 0.1))).toBe(10);
    expect(elastic(-1, 1, 10, 50)).toBe(0);
  });

  it('same seed and settings give the same keys; a new seed changes flicker; offset shifts it', () => {
    expect(bake(env, 0, 47, { ...base, reactor: 'flicker' })).toEqual(bake(env, 0, 47, { ...base, reactor: 'flicker' }));
    expect(bake(env, 0, 47, { ...base, reactor: 'flicker', seed: 8 })).not.toEqual(bake(env, 0, 47, { ...base, reactor: 'flicker' }));
    const a = bake(env, 0, 47, base), b = bake(env, 0, 47, { ...base, offset: 2 });
    expect(b[5]!.value).toBeCloseTo(a[3]!.value, 9);
    expect(Math.abs(flicker(0, 10, 1, 3))).toBe(0);
  });

  it('elastic wobbles after a hit and dies away', () => {
    const hits = new Float32Array(72); hits[12] = 1;
    for (let i = 13; i < 72; i++) hits[i] = 0;
    const v = bake(hits, 0, 71, { ...base, reactor: 'elastic' }).map((k) => k.value);
    expect(v.slice(0, 12).every((x) => x === 0)).toBe(true);
    const early = Math.max(...v.slice(12, 24).map(Math.abs)), late = Math.max(...v.slice(60).map(Math.abs));
    expect(early).toBeGreaterThan(5);
    expect(late).toBeLessThan(early);
  });
});
