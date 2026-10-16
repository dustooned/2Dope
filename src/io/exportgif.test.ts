import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Drawing, Project } from '../core/project';
import { drawingsLayer, newComp } from '../core/comp';
import { exportGif } from './exportgif';

const rig = vi.hoisted(() => ({ frames: [] as number[], released: 0, canvas: { width: 0, height: 0 }, fail: false }));
vi.mock('../brush/raster', () => ({ makeCanvas: (width: number, height: number) => {
  rig.canvas = { width, height };
  return Object.assign(rig.canvas, { getContext: () => ({ setTransform() {}, fillRect() {},
    getImageData: () => { if (rig.fail) throw new Error('read failed'); return { data: new Uint8ClampedArray(width * height * 4).fill(255) }; },
  }) });
} }));
vi.mock('../view/composite', () => ({ drawComp: (_g: unknown, _p: unknown, _c: unknown, frame: number) => rig.frames.push(frame), releaseScratch: () => rig.released++ }));
function project() {
  const comp = newComp('main', 'Shot', 4, 2, 24);
  comp.layers.push(drawingsLayer('L1', 'Art', [{ drawing: 'd1', length: 5 }], 4, 2));
  return { main: comp.id, comp, comps: new Map([[comp.id, comp]]), drawings: new Map([['d1', { id: 'd1' }]]) } as unknown as Project;
}
function hold(fail = false) {
  return { pin: vi.fn(async (_d: Drawing) => { if (fail) throw new Error('load failed'); }), unpin: vi.fn() };
}
beforeEach(() => { rig.frames = []; rig.released = 0; rig.fail = false; });
describe('GIF render lifecycle', () => {
  it('samples the main clock, emits a GIF and releases all pixel residency', async () => {
    const h = hold(), progress = vi.fn(), p = project();
    const blob = await exportGif(p, false, new AbortController().signal, h, progress);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('image/gif'); expect(bytes.at(-1)).toBe(0x3b);
    expect(rig.frames).toEqual([0, 1, 3]);
    // Sum centisecond frame delays: rounded full 5/24 sec, without cumulative drift.
    let at = 800, duration = 0;
    while (bytes[at] === 0x21) {
      duration += bytes[at + 4]! + bytes[at + 5]! * 256; at += 19;
      while (bytes[at]) at += bytes[at]! + 1;
      at++;
    }
    expect(duration).toBe(21); expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(h.pin).toHaveBeenCalledTimes(3); expect(h.unpin).toHaveBeenCalledTimes(3);
    expect(rig.canvas).toMatchObject({ width: 0, height: 0 }); expect(rig.released).toBe(1);
    expect(p.comp.fps).toBe(24);
  });
  it('cancels between frames and frees the current frame', async () => {
    const h = hold(), c = new AbortController();
    await expect(exportGif(project(), false, c.signal, h, () => c.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(rig.frames).toEqual([0]); expect(h.unpin).toHaveBeenCalledTimes(1); expect(rig.released).toBe(1);
  });
  it.each(['pin', 'render'])('cleans up a failing %s', async where => {
    const h = hold(where === 'pin'); rig.fail = where === 'render';
    await expect(exportGif(project(), false, new AbortController().signal, h, () => {})).rejects.toThrow(/failed/);
    expect(h.unpin).toHaveBeenCalledTimes(1); expect(rig.canvas.width).toBe(0); expect(rig.released).toBe(1);
  });
});
