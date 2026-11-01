import { describe, expect, it } from 'vitest';
import { BrushImportError, curvePoints, parseBplist, parseXmlPlist, readAbr, readBrushFile, readProcreate, unarchive } from './brushimport';
import { TEST_BRUSH_B64 } from './fixtures/testbrush';
import { cloneBrush, dyn, evalDynamic, PRESETS } from '../core/brush';
import { readBrush } from '../core/brushlib';
import { taperProfile } from '../brush/dabs';
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

describe('Procreate import accuracy', () => {
  const fixture = () => Uint8Array.from(atob(TEST_BRUSH_B64), (c) => c.charCodeAt(0));

  it('reads a real-format .brush: curves, inversion, tapers, smoothing, scatter and grain', async () => {
    const [b] = await readBrushFile(fixture(), 'Fixture.brush');
    expect(b).toMatchObject({
      name: 'Fixture Dry Ink',
      size: 12,
      opacity: 0.9,
      spacing: 0.08,
      scatter: 5.5,
      pressureSize: 0.6,
      pressureSizeInvert: true,
      sizeCurve: [[0, 0], [0.25, 0.6], [1, 1]],
      pressureOpacity: 0.5,
      sizeJitter: 0.3,
      taperStart: 0.25,
      taperEnd: 0.5,
      taperSize: 0.7,
      taperOpacity: 0.4,
      taperShape: 0.5,
      smoothing: 0.35,
      stabilize: 0.4,
    });
    // a straight curve is not stored; speed does not take over a dynamic pressure already drives
    expect(b!.opacityCurve).toBeUndefined();
    expect(b!.speedSize).toBeUndefined();
    // the picture bundledGrainPath names, from the brush folder, and the named shape
    expect(b!.tip?.kind).toBe('png');
    expect(b!.grain).toMatchObject({ mode: 'height', depth: 0.2, depthMin: 0.05, scale: 0.5, movement: 0.4, zoom: 1, rotation: 45, invert: false });
    expect(String.fromCharCode(...b!.grain!.bytes.subarray(1, 4))).toBe('PNG');
  });

  it('reports every archive key as mapped, not supported (with why) or unknown', async () => {
    const [b] = await readBrushFile(fixture(), 'Fixture.brush');
    const r = b!.report!;
    expect(r.unknown).toEqual(['fixtureFutureKey']);
    expect(r.mapped).toEqual(expect.arrayContaining(['dynamicsPressureSizeCurve', 'grainBlendMode', 'bundledGrainPath', 'plotMovingAverageStabilization', 'pencilTaperShape', 'textureOrientation']));
    const why = Object.fromEntries(r.unsupported.map((u) => [u.key, u.why]));
    expect(why.dynamicsTiltSize).toMatch(/tilt/);
    expect(why.dynamicsSpeedSize).toMatch(/pressure already/);
    expect(why.taperPressure).toMatch(/touch taper/);
    expect(r.mapped).toContain('dynamicsPressureOpacityCurve'); // read (a straight line)
    // nothing is dropped silently: the three lists cover every key once
    const all = [...r.mapped, ...r.unsupported.map((u) => u.key), ...r.unknown];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(37);
  });

  it('has a reason for every key of the Procreate 5.4.9 Signature brush', async () => {
    // two halves: the test plist writer keeps under 256 objects
    const half = (keys: string[]) => keyedArchive(Object.fromEntries(keys.map((k) => [k, k === 'name' ? 'Sig' : 0])));
    const mid = SIGNATURE_KEYS.length >> 1;
    const out = await readProcreate(writeZip([{ name: 'A/Brush.archive', data: half(SIGNATURE_KEYS.slice(0, mid)) }, { name: 'B/Brush.archive', data: half(SIGNATURE_KEYS.slice(mid)) }]), 'S.brushset');
    expect(out.flatMap((b) => b.report!.unknown)).toEqual([]);
    expect(out.reduce((n, b) => n + b.report!.mapped.length + b.report!.unsupported.length, 0)).toBe(SIGNATURE_KEYS.length);
  });

  it('maps unsupported grain blends and speed-only dynamics', async () => {
    const zip = writeZip([
      { name: 'A/Brush.archive', data: keyedArchive({ name: 'Speedy', bundledGrainPath: 'Not-Here.png', grainBlendMode: 10, dynamicsPressureSize: 0, dynamicsSpeedSize: -0.5, plotJitter: 12 }) },
      { name: 'A/Grain.png', data: PNG },
    ]);
    const [b] = await readProcreate(zip, 'A.brush');
    expect(b).toMatchObject({ speedSize: -0.5, scatter: 8 });
    expect(b!.grain?.mode).toBeUndefined();
    const why = Object.fromEntries(b!.report!.unsupported.map((u) => [u.key, u.why]));
    expect(why.grainBlendMode).toMatch(/blend 10/);
    expect(why.bundledGrainPath).toMatch(/Not-Here/);
  });

  it('fails cleanly on a damaged archive and a damaged curve', async () => {
    const garbage = writeZip([{ name: 'X/Brush.archive', data: enc('bplist00 this is not really a plist at all, no trailer') }, { name: 'X/Shape.png', data: PNG }]);
    await expect(readProcreate(garbage, 'X.brush')).rejects.toThrow(/could not be read/);
    const trunc = fixture().subarray(0, 900);
    await expect(readBrushFile(trunc, 'Cut.brush')).rejects.toBeInstanceOf(BrushImportError);
    expect(curvePoints({ points: { 'NS.objects': ['{0, 0}', 'nonsense'] } })).toBeNull();
    expect(curvePoints({ points: { 'NS.objects': ['{0.000000, 0.000000}', '{0.5, 0.2}', '{1, 1}'] } })).toEqual([[0, 0], [0.5, 0.2], [1, 1]]);
  });
});

describe('imported dynamics and tapers in the engine', () => {
  it('an inverted pressure curve: firmer is smaller, shaped by the curve', () => {
    const d = { ...dyn('pressure', 0.4), invert: true, points: [[0, 0], [0.25, 0.6], [1, 1]] as [number, number][] };
    const at = (p: number) => evalDynamic(d, { pressure: p, tilt: 0, speed: 0 }, 0);
    expect(at(0)).toBeCloseTo(1);
    expect(at(0.25)).toBeCloseTo(0.4 + 0.6 * 0.4);
    expect(at(1)).toBeCloseTo(0.4);
    // without points the exponent curve still applies
    expect(evalDynamic(dyn('pressure', 0, 2), { pressure: 0.5, tilt: 0, speed: 0 }, 0)).toBeCloseTo(0.25);
  });

  it('taper size, opacity and shape', () => {
    const b = { ...cloneBrush(PRESETS[0]!), size: 10, taperStart: 100, taperEnd: 0 };
    expect(taperProfile(b, 0).size).toBeCloseTo(0);
    expect(taperProfile(b, 200)).toEqual({ size: 1, alpha: 1 });
    const half = taperProfile({ ...b, taperSize: 0.5, taperOpacity: 0.4 }, 0);
    expect(half.size).toBeCloseTo(0.5);
    expect(half.alpha).toBeCloseTo(0.6);
    expect(taperProfile({ ...b, taperShape: 1 }, 50).size).toBeLessThan(taperProfile(b, 50).size);
  });

  it('keeps valid imported fields from storage and drops bad ones', () => {
    const b = readBrush({ ...cloneBrush(PRESETS[0]!), name: 'X', sizeDyn: { ...dyn('pressure'), points: [[0, 0], [2, 1]] }, opacityDyn: { ...dyn('pressure'), points: [[0, 0], [0.5, 0.8], [1, 1]] }, taperSize: 3, grainMode: 'weird', grainMovement: 0.3 })!;
    expect(b.sizeDyn.points).toBeUndefined();
    expect(b.opacityDyn.points).toEqual([[0, 0], [0.5, 0.8], [1, 1]]);
    expect(b.taperSize).toBe(1);
    expect(b.grainMode).toBeUndefined();
    expect(b.grainMovement).toBe(0.3);
  });
});

/** Opt-in: BRUSH_CORPUS = a folder of real .brush files (see the handoff); every key must have a reason. */
describe('local brush corpus', () => {
  const dir = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BRUSH_CORPUS;
  it.skipIf(!dir)('imports every brush with no unknown keys', async () => {
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as { readdirSync(p: string): string[]; readFileSync(p: string): Uint8Array; writeFileSync(p: string, s: string): void };
    const report: Record<string, unknown> = {};
    const unknown = new Set<string>();
    for (const f of fs.readdirSync(dir!).filter((n) => n.endsWith('.brush'))) {
      const [b] = await readBrushFile(new Uint8Array(fs.readFileSync(`${dir}/${f}`)), f);
      for (const k of b!.report!.unknown) unknown.add(k);
      const { tip, grain, report: r, ...rest } = b!;
      report[f] = { ...rest, tip: !!tip, grain: grain ? { ...grain, bytes: grain.bytes.length } : null, mapped: r!.mapped, unsupported: r!.unsupported, unknown: r!.unknown };
    }
    fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 1));
    expect([...unknown]).toEqual([]);
  }, 60_000);
});

const SIGNATURE_KEYS = 'authorName blendGammaCorrect blendMode bundledGrainPath bundledShapePath cloneOpacity cloneSize color dualBlendMode dynamicsBlur dynamicsBlurJitter dynamicsFalloff dynamicsGlazeFlow dynamicsJitterDarkness dynamicsJitterHue dynamicsJitterLightness dynamicsJitterOpacity dynamicsJitterSaturation dynamicsJitterSize dynamicsJitterStrokeDarkness dynamicsJitterStrokeHue dynamicsJitterStrokeLightness dynamicsJitterStrokeSaturation dynamicsLoad dynamicsMix dynamicsMixSoftening dynamicsPressureBleed dynamicsPressureBleedCurve dynamicsPressureBleedSpeed dynamicsPressureBrightness dynamicsPressureBrightnessCurve dynamicsPressureHue dynamicsPressureHueCurve dynamicsPressureMix dynamicsPressureOpacity dynamicsPressureOpacityCurve dynamicsPressureOpacitySpeed dynamicsPressureResponse dynamicsPressureSaturation dynamicsPressureSaturationCurve dynamicsPressureSecondaryColor dynamicsPressureSecondaryColorCurve dynamicsPressureSize dynamicsPressureSizeCurve dynamicsPressureSizeSpeed dynamicsPressureSmoothing dynamicsRenderType dynamicsSmudgeAccumulation dynamicsSpeedOpacity dynamicsSpeedSize dynamicsTiltAngle dynamicsTiltBleed dynamicsTiltBrightness dynamicsTiltCompression dynamicsTiltGradation dynamicsTiltHue dynamicsTiltOpacity dynamicsTiltSaturation dynamicsTiltSecondaryColor dynamicsTiltSize dynamicsWetAccumulation dynamicsWetnessJitter eraseOpacity eraseSize extendedBlend grainBlendMode grainDepth grainDepthJitter grainDepthMinimum jitterSecondary jitterStrokeSecondary maxOpacity maxSize minOpacity minSize name oriented paintOpacity paintSize pencilTaperEndLength pencilTaperOpacity pencilTaperShape pencilTaperSize pencilTaperSizeLinked pencilTaperStartLength pencilTipAnimation plotJitter plotSmoothing plotSpacing previewSize secondaryBrush shapeAzimuth shapeCount shapeCountJitter shapeFilter shapeFilterMode shapeFlipXJitter shapeFlipYJitter shapeInverted shapeOrientation shapeRandomise shapeRotation shapeScatter smudgeOpacity smudgeSize stamp taperEndLength taperOpacity taperPressure taperShape taperSize taperSizeLinked taperStartLength taperVersion textureFilter textureFilterMode textureInverted textureMovement textureOffsetJitter textureOrientation textureRotation textureScale textureZoom version'.split(' ');
