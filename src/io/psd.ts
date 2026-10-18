/**
 * Photoshop (.psd) reader for layered pictures from other programs (Photoshop, Procreate, Krita,
 * Clip Studio, Affinity, GIMP all write it). Reads RGB or greyscale, 8 or 16 bits, raw or RLE
 * (PackBits) layers with their names, opacity, visibility, blend mode and clipping; folders are
 * flattened away (their layers come in, the folder does not). A file with no layers gives its
 * flattened picture. Written from Adobe's published file format specification.
 */

import type { BlendMode } from '../core/comp';

export interface PsdLayer {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** width × height × 4, straight (not premultiplied) RGBA. */
  rgba: Uint8ClampedArray;
  /** 0..1 */
  opacity: number;
  visible: boolean;
  blend: BlendMode;
  /** Clipped to the layer below (a clipping mask). */
  clip: boolean;
}

export interface PsdOut {
  width: number;
  height: number;
  /** Bottom first, as they stack. */
  layers: PsdLayer[];
}

const MAX_SIDE = 8192;

const BLEND: Record<string, BlendMode> = {
  norm: 'normal', pass: 'normal', diss: 'normal',
  mul: 'multiply', 'mul ': 'multiply', idiv: 'multiply', lbrn: 'multiply',
  scrn: 'screen', div: 'screen', 'div ': 'screen',
  over: 'overlay', sLit: 'overlay', hLit: 'overlay', vLit: 'overlay',
  dark: 'darken', dkCl: 'darken',
  lite: 'lighten', lgCl: 'lighten',
  lddg: 'add', lbrn2: 'add',
};

class Reader {
  p = 0;
  constructor(readonly b: Uint8Array, readonly v = new DataView(b.buffer, b.byteOffset, b.byteLength)) {}
  u8(): number { return this.b[this.p++]!; }
  u16(): number { const x = this.v.getUint16(this.p); this.p += 2; return x; }
  i16(): number { const x = this.v.getInt16(this.p); this.p += 2; return x; }
  u32(): number { const x = this.v.getUint32(this.p); this.p += 4; return x; }
  i32(): number { const x = this.v.getInt32(this.p); this.p += 4; return x; }
  str(n: number): string { const s = String.fromCharCode(...this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
  skip(n: number): void { this.p += n; }
  need(n: number): void { if (this.p + n > this.b.length) throw new Error('this PSD is cut short'); }
}

/** PackBits: n < 128 copies n+1 bytes; n > 128 repeats the next byte 257-n times; 128 is a no-op. */
function unpack(src: Uint8Array, out: Uint8Array): void {
  let i = 0, o = 0;
  while (i < src.length && o < out.length) {
    const n = src[i++]!;
    if (n < 128) { const k = Math.min(n + 1, out.length - o, src.length - i); out.set(src.subarray(i, i + k), o); i += n + 1; o += k; }
    else if (n > 128) { const k = Math.min(257 - n, out.length - o); out.fill(src[i++]!, o, o + k); o += k; }
  }
}

/** One channel's pixels (8-bit values out, 16-bit input scaled down). */
function channel(r: Reader, end: number, w: number, h: number, depth: number, compression: number, rowCounts?: number[]): Uint8Array {
  const bpc = depth / 8;
  const rowBytes = w * bpc;
  const raw = new Uint8Array(rowBytes * h);
  if (compression === 0) {
    raw.set(r.b.subarray(r.p, Math.min(end, r.p + raw.length)));
  } else if (compression === 1) {
    const counts = rowCounts ?? Array.from({ length: h }, () => r.u16());
    let at = r.p;
    for (let y = 0; y < h; y++) {
      const n = counts[y]!;
      unpack(r.b.subarray(at, Math.min(end, at + n)), raw.subarray(y * rowBytes, (y + 1) * rowBytes));
      at += n;
    }
  } else throw new Error('this PSD uses a compression 2Dope cannot read yet (ZIP); save it again without it');
  if (bpc === 1) return raw;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = raw[i * 2]!; // the high byte of each 16-bit value
  return out;
}

export function readPsd(bytes: Uint8Array): PsdOut {
  const r = new Reader(bytes);
  r.need(26);
  if (r.str(4) !== '8BPS') throw new Error('not a PSD');
  const version = r.u16();
  if (version !== 1) throw new Error('this is a large-document PSB, not a PSD');
  r.skip(6);
  const nChan = r.u16(), height = r.u32(), width = r.u32(), depth = r.u16(), mode = r.u16();
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new Error('this PSD is too big');
  if (depth !== 8 && depth !== 16) throw new Error(`this PSD is ${depth}-bit; save it as 8 or 16 bits`);
  if (mode !== 3 && mode !== 1) throw new Error('this PSD is not RGB or greyscale; save it as RGB');
  const grey = mode === 1;
  r.skip(r.u32()); // colour mode data
  r.skip(r.u32()); // image resources
  const lmLen = r.u32();
  const lmEnd = r.p + lmLen;
  const layers: PsdLayer[] = [];
  if (lmLen > 0) {
    const liLen = r.u32();
    const liEnd = r.p + liLen;
    if (liLen > 0) {
      const count = Math.abs(r.i16());
      type Rec = { top: number; left: number; w: number; h: number; chans: { id: number; len: number }[]; blend: string; opacity: number; clip: boolean; hidden: boolean; name: string; folder: boolean };
      const recs: Rec[] = [];
      for (let i = 0; i < count; i++) {
        const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
        const nc = r.u16();
        const chans: Rec['chans'] = [];
        for (let c = 0; c < nc; c++) chans.push({ id: r.i16(), len: r.u32() });
        r.skip(4); // '8BIM'
        const blend = r.str(4);
        const opacity = r.u8(), clipping = r.u8(), flags = r.u8();
        r.skip(1);
        const extra = r.u32();
        const exEnd = r.p + extra;
        r.skip(r.u32()); // layer mask
        r.skip(r.u32()); // blending ranges
        const nameLen = r.u8();
        let name = r.str(nameLen);
        r.skip((4 - ((nameLen + 1) % 4)) % 4);
        let folder = false;
        // additional info: a Unicode name, and folder markers
        while (r.p + 12 <= exEnd) {
          const sig = r.str(4);
          if (sig !== '8BIM' && sig !== '8B64') break;
          const key = r.str(4);
          const len = r.u32();
          const at = r.p;
          if (key === 'luni' && len >= 4) {
            const n = r.u32();
            let s = '';
            for (let k = 0; k < n && r.p + 2 <= at + len; k++) s += String.fromCharCode(r.u16());
            if (s) name = s;
          } else if ((key === 'lsct' || key === 'lsdk') && len >= 4) {
            const type = r.u32();
            if (type === 1 || type === 2 || type === 3) folder = true;
          }
          r.p = at + len + (len % 2);
        }
        r.p = exEnd;
        recs.push({ top, left, w: Math.max(0, right - left), h: Math.max(0, bottom - top), chans, blend, opacity: opacity / 255, clip: clipping === 1, hidden: !!(flags & 2), name: name.replace(/\0/g, '').trim(), folder });
      }
      // channel image data, layer by layer in the same order
      for (const rec of recs) {
        const planes = new Map<number, Uint8Array>();
        for (const ch of rec.chans) {
          const end = r.p + ch.len;
          if (ch.len >= 2) {
            const comp = r.u16();
            // a mask channel (-2, -3) has the mask's own size: skip it
            if (ch.id >= -1 && rec.w && rec.h) planes.set(ch.id, channel(r, end, rec.w, rec.h, depth, comp));
          }
          r.p = end;
        }
        if (rec.folder || !rec.w || !rec.h) continue;
        const n = rec.w * rec.h;
        const rgba = new Uint8ClampedArray(n * 4);
        const R = planes.get(0), G = grey ? R : planes.get(1), B = grey ? R : planes.get(2), A = planes.get(-1);
        for (let i = 0; i < n; i++) {
          rgba[i * 4] = R?.[i] ?? 0;
          rgba[i * 4 + 1] = G?.[i] ?? 0;
          rgba[i * 4 + 2] = B?.[i] ?? 0;
          rgba[i * 4 + 3] = A ? A[i]! : 255;
        }
        layers.push({ name: rec.name || `Layer ${layers.length + 1}`, left: rec.left, top: rec.top, width: rec.w, height: rec.h, rgba, opacity: rec.opacity, visible: !rec.hidden, blend: BLEND[rec.blend] ?? BLEND[rec.blend.trim()] ?? 'normal', clip: rec.clip });
      }
      r.p = liEnd;
    }
    r.p = lmEnd;
  }
  if (layers.length) return { width, height, layers };
  // no layers: the flattened picture at the end of the file
  r.need(2);
  const comp = r.u16();
  const counts = comp === 1 ? Array.from({ length: height * nChan }, () => r.u16()) : undefined;
  const planes: Uint8Array[] = [];
  for (let c = 0; c < Math.min(nChan, grey ? 2 : 4); c++) {
    planes.push(channel(r, bytes.length, width, height, depth, comp, counts?.slice(c * height, (c + 1) * height)));
    if (comp === 1) r.p += counts!.slice(c * height, (c + 1) * height).reduce((a, b) => a + b, 0);
    else r.p += width * height * (depth / 8);
  }
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  const alpha = grey ? planes[1] : planes[3];
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = planes[0]![i]!;
    rgba[i * 4 + 1] = (grey ? planes[0] : planes[1])![i]!;
    rgba[i * 4 + 2] = (grey ? planes[0] : planes[2])![i]!;
    rgba[i * 4 + 3] = alpha ? alpha[i]! : 255;
  }
  return { width, height, layers: [{ name: 'Picture', left: 0, top: 0, width, height, rgba, opacity: 1, visible: true, blend: 'normal', clip: false }] };
}
