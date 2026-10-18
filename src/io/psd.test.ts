import { describe, expect, it } from 'vitest';
import { readPsd } from './psd';

/** A tiny PSD writer for the tests, following Adobe's file format specification. */
class W {
  bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 255); }
  u16(v: number) { this.u8(v >> 8); this.u8(v); }
  u32(v: number) { this.u16(v >>> 16); this.u16(v & 0xffff); }
  str(s: string) { for (const c of s) this.u8(c.charCodeAt(0)); }
  raw(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.u8(b[i]!); }
}
function packbits(row: number[]): number[] {
  // a simple encoder: runs of 3+ as repeats, the rest as literals
  const out: number[] = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 3) { out.push(257 - run, row[i]!); i += run; continue; }
    let lit = 1;
    while (i + lit < row.length && lit < 128 && !(row[i + lit] === row[i + lit + 1] && row[i + lit] === row[i + lit + 2])) lit++;
    out.push(lit - 1, ...row.slice(i, i + lit));
    i += lit;
  }
  return out;
}
interface L { name: string; uni?: string; left: number; top: number; w: number; h: number; rgba: (x: number, y: number) => [number, number, number, number]; blend?: string; opacity?: number; hidden?: boolean; clip?: boolean; rle?: boolean }
function psd(width: number, height: number, layers: L[]): Uint8Array {
  const w = new W();
  w.str('8BPS'); w.u16(1); w.raw([0, 0, 0, 0, 0, 0]); w.u16(4); w.u32(height); w.u32(width); w.u16(8); w.u16(3);
  w.u32(0); w.u32(0);
  // channel data first (to know the lengths)
  const data = layers.map((l) => {
    return [-1, 0, 1, 2].map((id) => {
      const k = id === -1 ? 3 : id;
      const rows: number[][] = [];
      for (let y = 0; y < l.h; y++) { const r: number[] = []; for (let x = 0; x < l.w; x++) r.push(l.rgba(x, y)[k]!); rows.push(r); }
      const c = new W();
      if (l.rle) {
        c.u16(1);
        const packed = rows.map(packbits);
        for (const p of packed) c.u16(p.length);
        for (const p of packed) c.raw(p);
      } else { c.u16(0); for (const r of rows) c.raw(r); }
      return { id, bytes: c.bytes };
    });
  });
  const li = new W();
  li.u16(layers.length);
  layers.forEach((l, i) => {
    li.u32(l.top); li.u32(l.left); li.u32(l.top + l.h); li.u32(l.left + l.w);
    li.u16(4);
    for (const ch of data[i]!) { li.u16(ch.id & 0xffff); li.u32(ch.bytes.length); }
    li.str('8BIM'); li.str(l.blend ?? 'norm'); li.u8(Math.round((l.opacity ?? 1) * 255)); li.u8(l.clip ? 1 : 0); li.u8(l.hidden ? 2 : 0); li.u8(0);
    const ex = new W();
    ex.u32(0); ex.u32(0);
    ex.u8(l.name.length); ex.str(l.name);
    while ((ex.bytes.length - 8) % 4) ex.u8(0);
    if (l.uni) {
      const u = new W();
      u.u32(l.uni.length);
      for (const c of l.uni) u.u16(c.charCodeAt(0));
      ex.str('8BIM'); ex.str('luni'); ex.u32(u.bytes.length); ex.raw(u.bytes);
    }
    li.u32(ex.bytes.length); li.raw(ex.bytes);
  });
  for (const chans of data) for (const ch of chans) li.raw(ch.bytes);
  if (li.bytes.length % 2) li.u8(0);
  w.u32(li.bytes.length + 4 + 4); // layer and mask info
  w.u32(li.bytes.length); w.raw(li.bytes);
  w.u32(0); // global mask
  // a flattened picture (raw, white)
  w.u16(0);
  for (let c = 0; c < 4; c++) for (let i = 0; i < width * height; i++) w.u8(255);
  return new Uint8Array(w.bytes);
}

describe('PSD reader', () => {
  it('reads layers: pixels, place, names (Unicode too), opacity, blend, hidden, clipping, raw and RLE', () => {
    const file = psd(10, 8, [
      { name: 'Paper', left: 0, top: 0, w: 10, h: 8, rgba: () => [250, 240, 220, 255] },
      { name: 'ink', uni: 'Ink — lines', left: 2, top: 3, w: 4, h: 2, rgba: (x) => [x * 60, 0, 0, x === 0 ? 0 : 255], blend: 'mul ', opacity: 0.5, hidden: true, clip: true, rle: true },
    ]);
    const p = readPsd(file);
    expect([p.width, p.height, p.layers.length]).toEqual([10, 8, 2]);
    const [paper, ink] = p.layers;
    expect(paper).toMatchObject({ name: 'Paper', left: 0, top: 0, width: 10, height: 8, visible: true, blend: 'normal', clip: false });
    expect([...paper!.rgba.slice(0, 4)]).toEqual([250, 240, 220, 255]);
    expect(ink).toMatchObject({ name: 'Ink — lines', left: 2, top: 3, width: 4, height: 2, visible: false, blend: 'multiply', clip: true });
    expect(ink!.opacity).toBeCloseTo(0.5, 1);
    expect([...ink!.rgba.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...ink!.rgba.slice(12, 16)]).toEqual([180, 0, 0, 255]);
  });

  it('gives the flattened picture when there are no layers', () => {
    const w = new W();
    w.str('8BPS'); w.u16(1); w.raw([0, 0, 0, 0, 0, 0]); w.u16(3); w.u32(2); w.u32(3); w.u16(8); w.u16(3);
    w.u32(0); w.u32(0); w.u32(0);
    w.u16(0);
    for (const v of [10, 20, 30]) for (let i = 0; i < 6; i++) w.u8(v);
    const p = readPsd(new Uint8Array(w.bytes));
    expect(p.layers).toHaveLength(1);
    expect([...p.layers[0]!.rgba.slice(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it('refuses what it cannot read, in plain words', () => {
    expect(() => readPsd(new TextEncoder().encode('nope nope nope nope nope nope'))).toThrow(/not a PSD/);
  });
});
