/** Small bounded GIF89a writer. Fixed RGB332 palette; clear codes keep LZW at nine bits.
 * This trades compression for predictable memory and avoids another runtime dependency.
 * Format: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 */
export function gifHeader(width: number, height: number): Uint8Array {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 480)) throw new Error('Invalid GIF size.');
  const bytes = new Uint8Array(13 + 768 + 19);
  bytes.set(new TextEncoder().encode('GIF89a'));
  bytes.set([width & 255, width >> 8, height & 255, height >> 8, 0xf7, 0, 0], 6);
  for (let i = 0; i < 256; i++) bytes.set([Math.round((i >> 5) * 255 / 7), Math.round(((i >> 2) & 7) * 255 / 7), (i & 3) * 85], 13 + i * 3);
  bytes.set([0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, 0, 0, 0], 781);
  return bytes;
}

/** Palette index used for see-through pixels in a transparent GIF (pure magenta, rarely drawn). */
export const GIF_CLEAR = 0b11100011;

/**
 * One frame. With `transparent`, pixels under half opacity become see-through (GIF has only on/off
 * transparency) and each frame clears the last, so moving art leaves no trail.
 */
export function gifFrame(rgba: Uint8ClampedArray, width: number, height: number, delay: number, transparent = false): Uint8Array {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 480) || rgba.length !== width * height * 4 || !Number.isInteger(delay) || delay < 1 || delay > 65535) throw new Error('Invalid GIF frame.');
  const pixels = width * height;
  // A clear before each 250 literals prevents the decoder dictionary reaching 512 entries.
  const codes = pixels + Math.ceil(pixels / 250) + 1;
  const packed = new Uint8Array(Math.ceil(codes * 9 / 8));
  let bit = 0;
  const write = (code: number) => {
    const at = bit >> 3, shift = bit & 7;
    packed[at] = packed[at]! | ((code << shift) & 255);
    if (at + 1 < packed.length) packed[at + 1] = packed[at + 1]! | (code >> (8 - shift));
    bit += 9;
  };
  for (let i = 0; i < pixels; i++) {
    if (i % 250 === 0) write(256);
    const p = i * 4;
    let index = (Math.round(rgba[p]! * 7 / 255) << 5) | (Math.round(rgba[p + 1]! * 7 / 255) << 2) | Math.round(rgba[p + 2]! * 3 / 255);
    if (transparent) {
      if (rgba[p + 3]! < 128) index = GIF_CLEAR;
      else if (index === GIF_CLEAR) index = GIF_CLEAR - 1; // real magenta stays visible, one shade bluer
    }
    write(index);
  }
  write(257);
  const out = new Uint8Array(19 + packed.length + Math.ceil(packed.length / 255) + 1);
  // Graphic control: disposal 1 (keep) when opaque; disposal 2 (clear) plus the see-through index when transparent
  out.set([0x21, 0xf9, 4, transparent ? 0b1001 : 4, delay & 255, delay >> 8, transparent ? GIF_CLEAR : 0, 0, 0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0, 8]);
  let offset = 19;
  for (let i = 0; i < packed.length; i += 255) {
    const chunk = packed.subarray(i, i + 255);
    out[offset++] = chunk.length; out.set(chunk, offset); offset += chunk.length;
  }
  return out;
}
