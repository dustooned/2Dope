import { describe, expect, it } from 'vitest';
import { GIF_CLEAR, gifFrame, gifHeader } from './gif';
import { planGif } from './exportgif';
import { drawingsLayer, newComp } from '../core/comp';

// Independent LZW decoder, including dictionary growth, to catch bit/block boundary errors.
function decode(frame: Uint8Array): number[] {
  let offset = 19;
  const bytes: number[] = [];
  while (frame[offset]) { const count = frame[offset++]!; bytes.push(...frame.slice(offset, offset + count)); offset += count; }
  let bit = 0, size = 9, next = 258;
  let table: number[][] = [], previous: number[] | null = null;
  const output: number[] = [];
  while (bit + size <= bytes.length * 8) {
    let code = 0;
    for (let j = 0; j < size; j++, bit++) code |= ((bytes[bit >> 3]! >> (bit & 7)) & 1) << j;
    if (code === 256) { table = Array.from({ length: 256 }, (_, i) => [i]); next = 258; size = 9; previous = null; continue; }
    if (code === 257) return output;
    const entry: number[] | null = table[code] ?? (previous && code === next ? [...previous, previous[0]!] : null);
    if (!entry) throw new Error('Invalid LZW code');
    output.push(...entry);
    if (previous) { table[next++] = [...previous, entry[0]!]; if (next === 1 << size && size < 12) size++; }
    previous = entry;
  }
  throw new Error('No end code');
}

describe('GIF encoding and budgets', () => {
  it.each([1, 249, 250, 251, 1000, 480 * 270])('decodes all %i pixels across clear codes and data sub-blocks', count => {
    const rgba = new Uint8ClampedArray(count * 4);
    const expected: number[] = [];
    for (let i = 0; i < count; i++) {
      const index = i % 256; expected.push(index);
      rgba.set([Math.round((index >> 5) * 255 / 7), Math.round(((index >> 2) & 7) * 255 / 7), (index & 3) * 85, 255], i * 4);
    }
    const width = count === 1000 ? 250 : Math.min(count, 480);
    const frame = gifFrame(rgba, width, count / width, 8);
    expect(decode(frame)).toEqual(expected);
    expect([...frame.slice(0, 8)]).toEqual([0x21, 0xf9, 4, 4, 8, 0, 0, 0]);
  });
  it('a transparent frame marks see-through pixels, keeps real magenta visible, and clears between frames', () => {
    const rgba = new Uint8ClampedArray(3 * 4);
    rgba.set([0, 0, 0, 0], 0); // see-through
    rgba.set([255, 0, 255, 255], 4); // drawn magenta
    rgba.set([255, 255, 255, 255], 8); // white
    const frame = gifFrame(rgba, 3, 1, 5, true);
    expect([...frame.slice(0, 8)]).toEqual([0x21, 0xf9, 4, 0b1001, 5, 0, GIF_CLEAR, 0]);
    expect(decode(frame)).toEqual([GIF_CLEAR, GIF_CLEAR - 1, 255]);
  });
  it('writes GIF89a with a full palette and infinite loop extension', () => {
    const header = gifHeader(320, 180);
    expect(new TextDecoder().decode(header.slice(0, 6))).toBe('GIF89a');
    expect([...header.slice(6, 10)]).toEqual([64, 1, 180, 0]);
    expect(new TextDecoder().decode(header.slice(784, 795))).toBe('NETSCAPE2.0');
    expect([...header.slice(-5)]).toEqual([3, 1, 0, 0, 0]);
  });
  it('uses the main comp and caps output sampling and Lite size without editing timing', () => {
    const main = newComp('main', 'Shot', 1920, 1080, 24);
    main.layers.push(drawingsLayer('L1', 'Art', [{ drawing: 'd1', length: 48 }], 1920, 1080));
    const nested = newComp('nested', 'Group', 100, 100, 12);
    const p = { main: main.id, comp: nested, comps: new Map([[main.id, main], [nested.id, nested]]) };
    expect(planGif(p, false)).toMatchObject({ comp: 'main', samples: 24, duration: 2, width: 480, height: 270 });
    expect(planGif(p, true)).toMatchObject({ width: 320, height: 180 });
    main.duration = 24 * 16;
    expect(() => planGif(p, false)).toThrow(/15 seconds/);
    main.duration = 24 * 15; main.width = main.height = 1920;
    expect(() => planGif(p, false)).toThrow(/device limit/);
    main.fps = 0;
    expect(() => planGif(p, false)).toThrow(/timing/);
  });
});
