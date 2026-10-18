import { describe, expect, it } from 'vitest';
import { gifFrame, gifHeader } from './gif';
import { decodeGif, gifHolds } from './gifdecode';
import { REAL_GIF_B64, REAL_GIF_PILLOW } from './fixtures/realgif';

function solid(w: number, h: number, rgb: [number, number, number], a = 255): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...rgb, a], i * 4);
  return px;
}
function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

describe('GIF reader', () => {
  it('reads the frames and delays our own GIF writer makes', () => {
    const w = 20, h = 12;
    const bytes = join([gifHeader(w, h), gifFrame(solid(w, h, [255, 0, 0]), w, h, 5), gifFrame(solid(w, h, [0, 0, 255]), w, h, 20), new Uint8Array([0x3b])]);
    const g = decodeGif(bytes);
    expect([g.width, g.height, g.frames.length]).toEqual([20, 12, 2]);
    expect(g.frames.map((f) => f.delay)).toEqual([5, 20]);
    expect([...g.frames[0]!.rgba.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...g.frames[1]!.rgba.slice(0, 4)]).toEqual([0, 0, 255, 255]);
  });

  it('keeps see-through pixels see-through', () => {
    const w = 8, h = 8;
    const px = solid(w, h, [0, 255, 0]);
    px[3] = 0; // first pixel clear
    const g = decodeGif(join([gifHeader(w, h), gifFrame(px, w, h, 10, true), new Uint8Array([0x3b])]));
    expect(g.frames[0]!.rgba[3]).toBe(0);
    expect(g.frames[0]!.rgba[7]).toBe(255);
  });

  it('turns delays into holds at the shot fps, staying in step', () => {
    expect(gifHolds([10, 10, 10], 24)).toEqual([2, 3, 2]);
    expect(gifHolds([1, 1], 12)).toEqual([1, 1]);
    expect(gifHolds([100], 24)).toEqual([24]);
  });

  it('reads a real GIF (full LZW, code growth, palettes, disposal) like Pillow does', () => {
    const bytes = Uint8Array.from(atob(REAL_GIF_B64), (c) => c.charCodeAt(0));
    const want = REAL_GIF_PILLOW;
    const g = decodeGif(bytes);
    expect([g.width, g.height, g.frames.length]).toEqual([120, 80, want.length]);
    expect(g.frames.map((f) => f.delay * 10)).toEqual(want.map((w) => w.delay));
    const at = (f: number, x: number, y: number) => [...g.frames[f]!.rgba.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 4)];
    want.forEach((w, f) => {
      // the gradient points are always solid: the colours match Pillow's exactly
      for (const [k, [x, y]] of ([[0, [5, 5]], [2, [100, 70]], [4, [119, 79]]] as const)) expect(at(f, x, y)).toEqual(w.samples[k]);
    });
  });

  it('refuses what is not a GIF', () => {
    expect(() => decodeGif(new TextEncoder().encode('PNG....nope'))).toThrow();
  });
});
