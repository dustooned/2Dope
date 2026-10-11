import { describe, expect, it } from 'vitest';
import type { Drawing, Parked, Project } from './project';
import { recordSaved, referencedKeys, Residency, type PlaneOps } from './residency';

/** A stand-in canvas: its "pixels" are a string, '' means blank. */
interface FakeCanvas {
  width: number;
  height: number;
  px: string;
}

const W = 10;
const H = 10;
const PLANE = W * H * 4;

function fakeOps(log: string[] = []): PlaneOps {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    isBlank: (c) => (c as unknown as FakeCanvas).px === '',
    encode: async (c) => {
      const px = (c as unknown as FakeCanvas).px; // snapshot now, like toBlob
      await new Promise((r) => setTimeout(r, 1));
      log.push(`encode ${px}`);
      return enc.encode(px);
    },
    decodeInto: async (c, bytes) => {
      await new Promise((r) => setTimeout(r, 1));
      (c as unknown as FakeCanvas).px = dec.decode(bytes);
    },
    resize: (c, w, h) => {
      const f = c as unknown as FakeCanvas;
      f.width = w;
      f.height = h;
      f.px = '';
    },
    newCanvas: (w, h) => ({ width: w, height: h, px: '' }) as unknown as HTMLCanvasElement,
    thumb: (d) => ({ width: 4, height: 2, px: `thumb:${(d.line as unknown as FakeCanvas).px}` }) as unknown as HTMLCanvasElement,
    defer: (fn) => setTimeout(fn, 0),
  };
}

function canvas(px: string, live = true): HTMLCanvasElement {
  return { width: live ? W : 0, height: live ? H : 0, px } as unknown as HTMLCanvasElement;
}

function drawing(id: string, px: string, parked: Parked | null = null): Drawing {
  return { id, num: Number(id.slice(1)) || 1, line: canvas(parked ? '' : px, !parked), fill: null, vectors: [], role: null, rev: 0, parked, saved: null, thumb: null, thumbRev: -1 };
}

function project(ds: Drawing[]): Project {
  return { width: W, height: H, drawings: new Map(ds.map((d) => [d.id, d])) } as unknown as Project;
}

const px = (d: Drawing) => (d.line as unknown as FakeCanvas).px;

describe('residency', () => {
  it('parks the least recently used drawings to fit the budget and brings them back intact', async () => {
    const ds = ['a', 'b', 'c', 'd'].map((x, i) => drawing(`d${i + 1}`, x));
    const r = new Residency(fakeOps(), async () => null, PLANE * 2);
    r.setProject(project(ds));
    r.use([ds[3]!]); // d4 is current
    r.touch(ds[2]!);
    await r.settle();
    expect(r.liveBytes()).toBeLessThanOrEqual(PLANE * 2);
    expect(ds[3]!.parked).toBeNull(); // wanted: never parked
    const parked = ds.filter((d) => d.parked);
    expect(parked.length).toBe(2);
    for (const d of parked) expect(d.line.width).toBe(0); // memory handed back
    await r.ensure(ds[0]!);
    expect(ds[0]!.parked).toBeNull();
    expect(px(ds[0]!)).toBe('a');
    expect(ds[0]!.line.width).toBe(W);
  });

  it('blank planes park as nothing and come back blank', async () => {
    const d = drawing('d1', '');
    const r = new Residency(fakeOps(), async () => null, 0);
    r.setProject(project([d]));
    await r.settle();
    expect(d.parked).toEqual({ rev: 0, line: null, fill: null });
    await r.ensure(d);
    expect(px(d)).toBe('');
    expect(d.line.width).toBe(W);
  });

  it('a drawing already saved at this revision parks as a key only, and loads from storage', async () => {
    const log: string[] = [];
    const d = drawing('d1', 'ink');
    d.saved = { rev: 0, line: 'assets/ink.png', fill: null };
    const reads: string[] = [];
    const r = new Residency(fakeOps(log), async (k) => (reads.push(k), new TextEncoder().encode('ink')), 0);
    r.setProject(project([d]));
    await r.settle();
    expect(d.parked?.line).toEqual({ key: 'assets/ink.png', bytes: null });
    expect(log.filter((l) => l.startsWith('encode'))).toEqual([]); // nothing re-encoded
    await r.ensure(d);
    expect(reads).toEqual(['assets/ink.png']);
    expect(px(d)).toBe('ink');
  });

  it('does not park a drawing that changed while it was being compressed', async () => {
    const d = drawing('d1', 'v1');
    const r = new Residency(fakeOps(), async () => null, 0);
    r.setProject(project([d]));
    // change it right after parking began (encode is in flight)
    setTimeout(() => {
      d.rev += 1;
      (d.line as unknown as FakeCanvas).px = 'v2';
    }, 0);
    await new Promise((res) => setTimeout(res, 40));
    // the first attempt was abandoned; a later pump may park the new content, never the old one
    if (d.parked) {
      await r.ensure(d);
      expect(px(d)).toBe('v2');
    } else {
      expect(px(d)).toBe('v2');
    }
  });

  it('pinned and wanted drawings stay live', async () => {
    const a = drawing('d1', 'a');
    const b = drawing('d2', 'b');
    const r = new Residency(fakeOps(), async () => null, 0);
    r.setProject(project([a, b]));
    r.use([a]);
    await r.pin(b);
    await r.settle();
    expect(a.parked).toBeNull();
    expect(b.parked).toBeNull();
    r.unpin(b);
    await r.settle();
    expect(b.parked).not.toBeNull();
  });

  it('loading a project is lazy, and thumbnails are filled in in the background', async () => {
    const enc = new TextEncoder();
    const ds = [1, 2, 3].map((i) => drawing(`d${i}`, '', { rev: 0, line: { key: `k${i}`, bytes: null }, fill: null }));
    const r = new Residency(fakeOps(), async (k) => enc.encode(`ink-${k}`), PLANE);
    r.setProject(project(ds));
    await r.settle();
    for (const d of ds) {
      expect(d.thumbRev).toBe(d.rev);
      expect((d.thumb as unknown as FakeCanvas).px).toBe(`thumb:ink-k${d.num}`);
    }
    expect(r.liveBytes()).toBeLessThanOrEqual(PLANE);
  });

  it('a missing image is reported and the plane comes back blank', async () => {
    const warnings: string[] = [];
    const d = drawing('d1', '', { rev: 0, line: { key: 'gone', bytes: null }, fill: null });
    const r = new Residency(fakeOps(), async () => null, PLANE * 10);
    r.onWarning = (m) => warnings.push(m);
    r.setProject(project([d]));
    await r.ensure(d);
    expect(d.parked).toBeNull();
    expect(px(d)).toBe('');
    expect(warnings[0]).toMatch(/missing/);
  });

  it('once autosave stored a parked drawing, its in-memory bytes are dropped for the key', () => {
    const d = drawing('d1', '', { rev: 3, line: { key: null, bytes: new Uint8Array([1, 2]) }, fill: null });
    d.rev = 3;
    recordSaved(d, 3, 'assets/x.png', null);
    expect(d.parked!.line).toEqual({ key: 'assets/x.png', bytes: null });
    expect(d.saved).toEqual({ rev: 3, line: 'assets/x.png', fill: null });
    expect(referencedKeys(project([d]))).toEqual(new Set(['assets/x.png']));
  });
});
