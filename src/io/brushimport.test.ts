import { describe, expect, it } from 'vitest';
import { BrushImportError, parseBplist, parseXmlPlist, readAbr, readBrushFile, readProcreate, unarchive } from './brushimport';
import { writeZip } from './zip';

// ---- fixture writers (the formats as published) ----

/** A minimal bplist00 writer: strings, ints, reals, UIDs, arrays, dicts. */
function bplist(root: unknown): Uint8Array {
  type Obj = { t: 'str'; v: string } | { t: 'int'; v: number } | { t: 'real'; v: number } | { t: 'uid'; v: number } | { t: 'arr'; v: number[] } | { t: 'dict'; k: number[]; v: number[] };
  const objs: Obj[] = [];
  const add = (x: unknown): number => {
    const i = objs.length;
    objs.push({ t: 'int', v: 0 });
    if (typeof x === 'string') objs[i] = { t: 'str', v: x };
    else if (typeof x === 'number') objs[i] = Number.isInteger(x) ? { t: 'int', v: x } : { t: 'real', v: x };
    else if (Array.isArray(x)) objs[i] = { t: 'arr', v: x.map(add) };
    else if (x && typeof x === 'object' && 'uid' in x) objs[i] = { t: 'uid', v: (x as { uid: number }).uid };
    else {
      const e = Object.entries(x as Record<string, unknown>);
      const k = e.map(([key]) => add(key));
      objs[i] = { t: 'dict', k, v: e.map(([, val]) => add(val)) };
    }
    return i;
  };
  add(root);
  const bytes: number[] = [...'bplist00'].map((c) => c.charCodeAt(0));
  const offsets: number[] = [];
  const len = (type: number, n: number) => {
    if (n < 15) bytes.push((type << 4) | n);
    else bytes.push((type << 4) | 15, 0x11, n >> 8, n & 255);
  };
  for (const o of objs) {
    offsets.push(bytes.length);
    if (o.t === 'str') { len(5, o.v.length); for (const c of o.v) bytes.push(c.charCodeAt(0)); }
    else if (o.t === 'int') bytes.push(0x12, (o.v >>> 24) & 255, (o.v >> 16) & 255, (o.v >> 8) & 255, o.v & 255);
    else if (o.t === 'real') { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, o.v); bytes.push(0x23, ...b); }
    else if (o.t === 'uid') bytes.push(0x80, o.v);
    else if (o.t === 'arr') { len(10, o.v.length); bytes.push(...o.v.map((r) => r)); }
    else { len(13, o.k.length); bytes.push(...o.k, ...o.v); }
  }
  const table = bytes.length;
  for (const off of offsets) bytes.push(off >> 8, off & 255);
  const trailer = new Uint8Array(32);
  const dv = new DataView(trailer.buffer);
  trailer[6] = 2; // offset size
  trailer[7] = 1; // ref size (fixtures stay under 256 objects)
  dv.setBigUint64(8, BigInt(objs.length));
  dv.setBigUint64(16, 0n);
  dv.setBigUint64(24, BigInt(table));
  return new Uint8Array([...bytes, ...trailer]);
}

/** NSKeyedArchiver layout around a flat root dictionary. */
function keyedArchive(root: Record<string, unknown>): Uint8Array {
  const objects: unknown[] = ['$null'];
  const rootObj: Record<string, unknown> = {};
  objects.push(rootObj);
  for (const [k, v] of Object.entries(root)) {
    if (typeof v === 'string') {
      objects.push(v);
      rootObj[k] = { uid: objects.length - 1 };
    } else rootObj[k] = v;
  }
  return bplist({ $archiver: 'NSKeyedArchiver', $objects: objects, $top: { root: { uid: 1 } }, $version: 100000 });
}

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

class W {
  b: number[] = [];
  u8(x: number) { this.b.push(x & 255); return this; }
  u16(x: number) { this.b.push((x >> 8) & 255, x & 255); return this; }
  u32(x: number) { this.b.push((x >>> 24) & 255, (x >> 16) & 255, (x >> 8) & 255, x & 255); return this; }
  str(s: string) { for (const c of s) this.b.push(c.charCodeAt(0)); return this; }
  bytes(a: ArrayLike<number>) { for (let i = 0; i < a.length; i++) this.b.push(a[i]!); return this; }
  zeros(n: number) { for (let i = 0; i < n; i++) this.b.push(0); return this; }
  get out() { return new Uint8Array(this.b); }
}

describe('property lists', () => {
  it('reads binary plists and unarchives keyed archives', () => {
    const p = parseBplist(bplist({ a: 'x', n: 7, r: 0.5, list: [1, 2] })) as Record<string, unknown>;
    expect(p).toEqual({ a: 'x', n: 7, r: 0.5, list: [1, 2] });
    const root = unarchive(parseBplist(keyedArchive({ name: 'Soft Pencil', paintSize: 0.25 })));
    expect(root).toMatchObject({ name: 'Soft Pencil', paintSize: 0.25 });
  });

  it('reads XML plists, including XML keyed archives', () => {
    const xml = `<?xml version="1.0"?><plist version="1.0"><dict><key>$objects</key><array><string>$null</string><dict><key>name</key><dict><key>CF$UID</key><integer>2</integer></dict><key>plotSpacing</key><real>0.3</real></dict><string>Chalk &amp; Ink</string></array><key>$top</key><dict><key>root</key><dict><key>CF$UID</key><integer>1</integer></dict></dict></dict></plist>`;
    expect(unarchive(parseXmlPlist(xml))).toMatchObject({ name: 'Chalk & Ink', plotSpacing: 0.3 });
  });
});

describe('Procreate brushes', () => {
  it('reads a brushset: names, tips and the clear settings, in the set order', async () => {
    const zip = writeZip([
      { name: 'brushset.plist', data: bplist({ name: 'Kit', brushes: ['B2', 'A1'] }) },
      { name: 'A1/Brush.archive', data: keyedArchive({ name: 'Second', paintSize: 0.3, paintOpacity: 0.8, plotSpacing: 0.12, plotJitter: 0.4, dynamicsPressureSize: 0.6 }) },
      { name: 'A1/Shape.png', data: PNG },
      { name: 'B2/Brush.archive', data: keyedArchive({ name: 'First' }) },
      { name: 'B2/Shape.png', data: PNG },
      { name: 'C3/Brush.archive', data: keyedArchive({ name: 'Round only' }) },
    ]);
    const out = await readProcreate(zip, 'Kit.brushset');
    // a brush with Procreate's own round shape comes in too, with the round tip
    expect(out.map((b) => b.name)).toEqual(['First', 'Second', 'Round only']);
    expect(out[2]!.tip).toBeNull();
    expect(out[1]).toMatchObject({ size: 30, opacity: 0.8, spacing: 0.12, scatter: 0.4, pressureSize: 0.6 });
    expect(out[1]!.tip).toEqual({ kind: 'png', bytes: PNG });
  });

  it('reads a single .brush and refuses files without brushes', async () => {
    const one = writeZip([{ name: 'Brush.archive', data: keyedArchive({ name: 'Solo' }) }, { name: 'Shape.png', data: PNG }]);
    expect((await readBrushFile(one, 'Solo.brush')).map((b) => b.name)).toEqual(['Solo']);
    await expect(readProcreate(writeZip([{ name: 'x.txt', data: enc('hi') }]), 'x.brushset')).rejects.toBeInstanceOf(BrushImportError);
    await expect(readProcreate(enc('not a zip at all, sorry'), 'x.brushset')).rejects.toBeInstanceOf(BrushImportError);
  });
});

describe('Photoshop ABR', () => {
  it('reads v2 sampled brushes (raw) with names and spacing, skipping computed ones', () => {
    const tip = [0, 128, 255, 64, 32, 16]; // 3 x 2
    const sampled = new W().u32(0).u16(25).u32(4).u16(65).u16(105).u16(99).u16(0).u8(1).zeros(8).u32(0).u32(0).u32(2).u32(3).u16(8).u8(0).bytes(tip).out;
    const computed = new W().zeros(10).out;
    const abr = new W().u16(2).u16(2).u16(1).u32(computed.length).bytes(computed).u16(2).u32(sampled.length).bytes(sampled).out;
    const out = readAbr(abr, 'Set.abr');
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Aic');
    expect(out[0]!.spacing).toBe(0.25);
    expect(out[0]!.tip).toEqual({ kind: 'alpha', w: 3, h: 2, alpha: new Uint8Array(tip) });
  });

  it('reads v6 sampled tips from the samp section (PackBits)', () => {
    // 4 x 2: row 1 = four 200s (a run), row 2 = 1 2 3 4 (literal)
    const rle = new W().u16(2).u16(5).u8(0xfd).u8(200).u8(3).bytes([1, 2, 3, 4]).out;
    const body = new W().zeros(47).u32(0).u32(0).u32(2).u32(4).u16(8).u8(1).bytes(rle).out;
    const padded = new W().bytes(body).zeros((4 - (body.length % 4)) % 4).out;
    const samp = new W().u32(body.length).bytes(padded).out;
    const abr = new W().u16(6).u16(1).str('8BIM').str('desc').u32(4).zeros(4).str('8BIM').str('samp').u32(samp.length).bytes(samp).out;
    const out = readAbr(abr, 'Pack.abr');
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Pack 1');
    expect(out[0]!.tip).toEqual({ kind: 'alpha', w: 4, h: 2, alpha: new Uint8Array([200, 200, 200, 200, 1, 2, 3, 4]) });
  });

  it('refuses unknown versions and truncated files', () => {
    expect(() => readAbr(new W().u16(3).u16(0).out, 'x.abr')).toThrow(BrushImportError);
    expect(() => readAbr(new W().u16(2).u16(1).u16(2).u32(500).out, 'x.abr')).toThrow(BrushImportError);
  });
});

describe('more brush files', () => {
  it('skips the Reset backups, reads NSString names, grain pictures and inverted shapes', async () => {
    const archive = (root: Record<string, unknown>) => bplist({ $objects: ['$null', root, { 'NS.string': 'Chalky' }], $top: { root: { uid: 1 } } });
    const zip = writeZip([
      { name: 'A/Brush.archive', data: archive({ name: { uid: 2 }, textureDepth: 0.6, shapeInverted: 1, dynamicsPressureOpacity: 0.5, shapeRotation: 1 }) },
      { name: 'A/Shape.png', data: PNG },
      { name: 'A/Reset/Brush.archive', data: archive({ name: { uid: 2 } }) },
      { name: 'A/Reset/Grain.png', data: PNG },
    ]);
    const out = await readProcreate(zip, 'Set.brushset');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Chalky', tipInvert: true, pressureOpacity: 0.5, follow: true });
    expect(out[0]!.grain).toMatchObject({ bytes: PNG, depth: 0.6 });
  });

  it('names ABR v6 tips from their presets, with size and spacing', async () => {
    const { abrPresets } = await import('./brushimport');
    const utf16 = (t: string) => { const w = new W().u32(t.length + 1); for (const c of t) w.u16(c.charCodeAt(0)); return w.u16(0).out; };
    const dbl = (x: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; };
    const desc = new W().str('Nm  TEXT').bytes(utf16('Dry Ink')).str('DmtrUntF#Pxl').bytes(dbl(42)).str('SpcnUntF#Prc').bytes(dbl(25)).str('sampledDataTEXT').bytes(utf16('$abc')).out;
    const p = abrPresets(desc);
    expect(p.get('$abc')).toEqual({ name: 'Dry Ink', diameter: 42, spacing: 25 });
  });
});
