import { describe, expect, it } from 'vitest';
import { assembleApng } from './apng';
import { crc32 } from './zip';

/** A minimal PNG: signature, IHDR, one IDAT, IEND (contents need not decode for the layout test). */
function png(idat: number[]): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const body = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat(data));
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(body, 4);
    v.setUint32(8 + data.length, crc32(body));
    return [...out];
  };
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]), ...chunk('IDAT', idat), ...chunk('IEND', [])]);
}

function types(b: Uint8Array): string[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: string[] = [];
  for (let p = 8; p + 12 <= b.length;) {
    const len = v.getUint32(p);
    out.push(String.fromCharCode(...b.subarray(p + 4, p + 8)));
    p += 12 + len;
  }
  return out;
}

describe('animated PNG', () => {
  it('lays out acTL, one fcTL per frame, IDAT first then fdAT, with frame holds as delays', () => {
    const out = assembleApng([{ png: png([1, 2, 3]), hold: 2 }, { png: png([4, 5]), hold: 1 }], 24, 2, 2);
    expect(types(out)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
    const v = new DataView(out.buffer);
    // acTL: 2 frames, loop forever
    const ac = 8 + 25 + 8;
    expect(v.getUint32(ac)).toBe(2);
    expect(v.getUint32(ac + 4)).toBe(0);
    // first fcTL: sequence 0, delay 2/24
    const fc = ac + 8 + 4;
    expect(v.getUint32(fc + 8)).toBe(0);
    expect(v.getUint16(fc + 8 + 20)).toBe(2);
    expect(v.getUint16(fc + 8 + 22)).toBe(24);
  });
});
