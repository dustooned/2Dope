import { describe, expect, it } from 'vitest';
import { fillFrom, polygonMask, prepareFill } from './fill';

describe('selected region fill', () => {
  const w = 20, h = 20;
  const selection = polygonMask([[2, 2], [10, 2], [10, 15], [2, 15]], w, h)!;

  it('fills open artwork up to the selection and rejects outside seeds', () => {
    const map = prepareFill(new Uint8Array(w * h), w, h);
    const r = fillFrom(map, 4, 4, false, selection.mask)!;
    expect(r.mask).toEqual(selection.mask);
    expect(r.count).toBe(8 * 13);
    expect(fillFrom(map, 14, 4, false, selection.mask)).toBeNull();
  });

  it('keeps ink-separated regions separate, including under-line growth', () => {
    const alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) alpha[y * w + 6] = 255;
    const map = prepareFill(alpha, w, h, { threshold: 24, gap: 4, under: 5 });
    const left = fillFrom(map, 3, 6, true, selection.mask)!;
    expect(left.mask[6 * w + 8]).toBe(0);
    expect(left.mask[6 * w + 6]).toBe(1);
    for (let i = 0; i < left.mask.length; i++) if (!selection.mask[i]) expect(left.mask[i]).toBe(0);
    const right = fillFrom(map, 8, 6, true, selection.mask)!;
    expect(right.mask[6 * w + 3]).toBe(0);
    expect(right.mask[6 * w + 8]).toBe(1);
  });

  it('cannot connect selection islands by flooding through unselected pixels', () => {
    const mask = new Uint8Array(w * h);
    for (let y = 3; y < 8; y++) for (const x of [3, 4, 12, 13]) mask[y * w + x] = 1;
    const map = prepareFill(new Uint8Array(w * h), w, h);
    const r = fillFrom(map, 3, 4, true, mask)!;
    expect(r.count).toBe(10);
    expect(r.mask[4 * w + 12]).toBe(0);
  });

  it('without a selection retains the ordinary full-background fill', () => {
    const map = prepareFill(new Uint8Array(w * h), w, h);
    expect(fillFrom(map, 4, 4)!.count).toBe(w * h);
  });

  it('a selected mask includes ink-covered pixels without closed-region detection', () => {
    const area = polygonMask([[2, 2], [10, 2], [10, 15], [2, 15]], w, h)!;
    expect(area.mask[6 * w + 6]).toBe(1);
    expect(polygonMask([[2, 2], [3, 3]], w, h)).toBeNull();
  });
});
