/**
 * Animated GIF reader (GIF87a / GIF89a), so animations from other programs come in frame by frame.
 * Every frame is returned whole (each one already drawn over the ones before it, honouring the
 * frame's disposal), with its delay in hundredths of a second. Written from the GIF89a spec:
 * https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 */

export interface GifFrameOut {
  rgba: Uint8ClampedArray;
  /** Hundredths of a second (0 in the file is read as 10, as browsers do). */
  delay: number;
}

export interface GifOut {
  width: number;
  height: number;
  frames: GifFrameOut[];
}

/** Limits that keep a hostile or huge file from taking the memory. */
const MAX_SIDE = 4096;
const MAX_FRAMES = 600;

/** LZW-decode one image's data sub-blocks into palette indices. */
function lzw(data: Uint8Array, minSize: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const clear = 1 << minSize, eoi = clear + 1;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), lengths = new Uint16Array(4096);
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; lengths[i] = 1; }
  let size = minSize + 1, next = eoi + 1, prev = -1, o = 0;
  let bits = 0, acc = 0, p = 0;
  const stack = new Uint8Array(4096);
  while (o < count) {
    while (bits < size) {
      if (p >= data.length) return out; // short data: keep what we have
      acc |= data[p++]! << bits;
      bits += 8;
    }
    const code = acc & ((1 << size) - 1);
    acc >>>= size;
    bits -= size;
    if (code === clear) { size = minSize + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    let c = code, first: number;
    if (code >= next) {
      // the KwKwK case: the previous string plus its own first character
      if (prev < 0) break;
      c = prev;
    }
    // unwind the string into the stack
    let sp = 0;
    while (c >= clear) { stack[sp++] = suffix[c]!; c = prefix[c]!; if (sp >= 4096) return out; }
    first = c;
    stack[sp++] = c;
    if (code >= next) {
      // (the first character again at the end)
      for (let i = sp - 1; i >= 0 && o < count; i--) out[o++] = stack[i]!;
      if (o < count) out[o++] = first;
    } else for (let i = sp - 1; i >= 0 && o < count; i--) out[o++] = stack[i]!;
    if (prev >= 0 && next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      lengths[next] = lengths[prev]! + 1;
      next++;
      if (next === 1 << size && size < 12) size++;
    }
    prev = code;
  }
  return out;
}

export function decodeGif(bytes: Uint8Array): GifOut {
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('not a GIF');
  const u16 = (i: number) => bytes[i]! | (bytes[i + 1]! << 8);
  const width = u16(6), height = u16(8);
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new Error('this GIF is too big');
  const flags = bytes[10]!;
  let p = 13;
  let global: Uint8Array | null = null;
  if (flags & 0x80) {
    const n = 3 * (1 << ((flags & 7) + 1));
    global = bytes.subarray(p, p + n);
    p += n;
  }
  const canvas = new Uint8ClampedArray(width * height * 4);
  const frames: GifFrameOut[] = [];
  let delay = 10, transIndex = -1, disposal = 0;
  // what to restore to before the next frame (disposal 3: the previous picture)
  let restore: Uint8ClampedArray | null = null;
  let lastRect: [number, number, number, number] | null = null, lastDisposal = 0;
  const subBlocks = (): Uint8Array => {
    const parts: Uint8Array[] = [];
    let total = 0;
    while (p < bytes.length) {
      const n = bytes[p++]!;
      if (!n) break;
      parts.push(bytes.subarray(p, p + n));
      total += n;
      p += n;
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  };
  while (p < bytes.length && frames.length < MAX_FRAMES) {
    const b = bytes[p++]!;
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      const label = bytes[p++]!;
      if (label === 0xf9 && bytes[p] === 4) {
        const pf = bytes[p + 1]!;
        disposal = (pf >> 2) & 7;
        delay = u16(p + 2) || 10;
        transIndex = pf & 1 ? bytes[p + 4]! : -1;
        p += 6; // size, 4 bytes, terminator
      } else subBlocks();
      continue;
    }
    if (b !== 0x2c) break; // not an image: stop here
    // the previous frame's disposal applies before this one is drawn
    if (lastRect && lastDisposal === 2) {
      const [x0, y0, w0, h0] = lastRect;
      for (let y = y0; y < Math.min(height, y0 + h0); y++) canvas.fill(0, (y * width + x0) * 4, (y * width + Math.min(width, x0 + w0)) * 4);
    } else if (lastRect && lastDisposal === 3 && restore) canvas.set(restore);
    const x = u16(p), y = u16(p + 2), w = u16(p + 4), h = u16(p + 6), f = bytes[p + 8]!;
    p += 9;
    let table = global;
    if (f & 0x80) {
      const n = 3 * (1 << ((f & 7) + 1));
      table = bytes.subarray(p, p + n);
      p += n;
    }
    const interlaced = !!(f & 0x40);
    const minSize = bytes[p++]!;
    if (minSize < 2 || minSize > 11) throw new Error('this GIF is damaged');
    const idx = lzw(subBlocks(), minSize, w * h);
    restore = disposal === 3 ? canvas.slice() : null;
    if (table) {
      // interlaced rows come in the order 0,8,16.. 4,12.. 2,6.. 1,3..
      const rows: number[] = [];
      if (interlaced) for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) for (let r = start; r < h; r += step) rows.push(r);
      for (let r = 0; r < h; r++) {
        const row = interlaced ? rows[r]! : r;
        const cy = y + row;
        if (cy >= height) continue;
        for (let c = 0; c < w; c++) {
          const cx = x + c;
          if (cx >= width) continue;
          const k = idx[r * w + c]!;
          if (k === transIndex || k * 3 + 2 >= table.length) continue;
          const o = (cy * width + cx) * 4;
          canvas[o] = table[k * 3]!; canvas[o + 1] = table[k * 3 + 1]!; canvas[o + 2] = table[k * 3 + 2]!; canvas[o + 3] = 255;
        }
      }
    }
    frames.push({ rgba: canvas.slice(), delay });
    lastRect = [x, y, w, h];
    lastDisposal = disposal;
    delay = 10; transIndex = -1; disposal = 0;
  }
  if (!frames.length) throw new Error('this GIF has no pictures');
  return { width, height, frames };
}

/** A GIF's frame delays as holds in frames at `fps` (at least 1 each, rounding kept in step). */
export function gifHolds(delays: number[], fps: number): number[] {
  let t = 0, at = 0;
  return delays.map((d) => {
    t += d / 100;
    const end = Math.max(at + 1, Math.round(t * fps));
    const n = end - at;
    at = end;
    return n;
  });
}
