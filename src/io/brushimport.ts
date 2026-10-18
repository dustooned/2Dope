/**
 * Brush files from other apps: Procreate (.brushset, .brush) and Photoshop (.abr).
 *
 * What comes across is each brush's name and its tip picture, plus the few settings whose meaning
 * is clear (size, opacity, spacing, scatter, pressure size). The rest of Procreate's and
 * Photoshop's engines (grain textures, dual brushes, wet mixing, most dynamics) does not exist in
 * 2Dope, so imported brushes are close, not identical. Everything is parsed locally; malformed or
 * oversized files are refused with a message.
 *
 * Formats, as published and implemented elsewhere:
 * - .brushset / .brush: a zip; each brush is a folder with Brush.archive (an NSKeyedArchiver binary
 *   property list) and Shape.png (white paints, black does not).
 * - .abr v1/v2: a list of brushes; sampled ones carry an 8-bit tip image (raw or PackBits).
 * - .abr v6+: 8BIM sections; "samp" holds the sampled tips.
 */

import { readZip } from './zip';

/** A tip as alpha (0..255, 255 paints) or as a PNG to decode. */
export type ImportedTip = { kind: 'alpha'; w: number; h: number; alpha: Uint8Array } | { kind: 'png'; bytes: Uint8Array };

export interface ImportedBrush {
  name: string;
  tip: ImportedTip;
  /** Dab spacing as a fraction of the diameter. */
  spacing?: number;
  /** Diameter in pixels. */
  size?: number;
  opacity?: number;
  scatter?: number;
  /** 0..1: how much pen pressure changes the size. */
  pressureSize?: number;
}

export class BrushImportError extends Error {}

const MAX_BRUSHES = 120;
const MAX_TIP = 4096;

// ---------------------------------------------------------------------------------------------
// Property lists

/** A keyed-archive reference. */
export interface Uid {
  uid: number;
}

const isUid = (v: unknown): v is Uid => typeof v === 'object' && v !== null && 'uid' in v && Object.keys(v).length === 1;
/** XML archives write references as { CF$UID: n }. */
const asUid = (v: unknown): Uid | null => (isUid(v) ? v : typeof v === 'object' && v !== null && 'CF$UID' in v && Object.keys(v).length === 1 ? { uid: Number((v as Record<string, unknown>)['CF$UID']) } : null);

/** Parse a binary property list (bplist00). */
export function parseBplist(b: Uint8Array): unknown {
  if (b.length < 40 || String.fromCharCode(...b.subarray(0, 8)) !== 'bplist00') throw new BrushImportError('not a binary property list');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const t = b.length - 32;
  const offSize = b[t + 6]!;
  const refSize = b[t + 7]!;
  const count = Number(v.getBigUint64(t + 8));
  const top = Number(v.getBigUint64(t + 16));
  const tableAt = Number(v.getBigUint64(t + 24));
  if (count > 1_000_000 || tableAt + count * offSize > t || top >= count) throw new BrushImportError('corrupt property list');
  const uint = (at: number, n: number) => {
    let x = 0;
    for (let i = 0; i < n; i++) x = x * 256 + b[at + i]!;
    return x;
  };
  const offsets = Array.from({ length: count }, (_, i) => uint(tableAt + i * offSize, offSize));
  const cache = new Map<number, unknown>();
  const read = (ref: number, depth: number): unknown => {
    if (depth > 64) throw new BrushImportError('property list nests too deeply');
    if (cache.has(ref)) return cache.get(ref);
    const at = offsets[ref];
    if (at === undefined || at >= t) throw new BrushImportError('corrupt property list');
    const marker = b[at]!;
    const type = marker >> 4;
    let info = marker & 15;
    let p = at + 1;
    const length = () => {
      if (info !== 15) return info;
      const m = b[p]!;
      const n = 1 << (m & 15);
      const len = uint(p + 1, n);
      p += 1 + n;
      return len;
    };
    let out: unknown;
    switch (type) {
      case 0x0:
        out = info === 8 ? false : info === 9 ? true : null;
        break;
      case 0x1: {
        const n = 1 << info;
        out = n === 8 ? Number(v.getBigInt64(p)) : uint(p, n);
        break;
      }
      case 0x2:
        out = info === 2 ? v.getFloat32(p) : v.getFloat64(p);
        break;
      case 0x3:
        out = v.getFloat64(p);
        break;
      case 0x4: {
        const n = length();
        out = b.slice(p, p + n);
        break;
      }
      case 0x5: {
        const n = length();
        out = String.fromCharCode(...b.subarray(p, p + n));
        break;
      }
      case 0x6: {
        const n = length();
        let s = '';
        for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint16(p + i * 2));
        out = s;
        break;
      }
      case 0x8:
        out = { uid: uint(p, info + 1) };
        break;
      case 0xa: {
        const n = length();
        const arr: unknown[] = [];
        cache.set(ref, arr);
        for (let i = 0; i < n; i++) arr.push(read(uint(p + i * refSize, refSize), depth + 1));
        return arr;
      }
      case 0xd: {
        const n = length();
        const obj: Record<string, unknown> = {};
        cache.set(ref, obj);
        for (let i = 0; i < n; i++) {
          const k = read(uint(p + i * refSize, refSize), depth + 1);
          obj[String(k)] = read(uint(p + (n + i) * refSize, refSize), depth + 1);
        }
        return obj;
      }
      default:
        out = null;
    }
    cache.set(ref, out);
    return out;
  };
  return read(top, 0);
}

/** Parse an XML property list (the subset brush files use). */
export function parseXmlPlist(text: string): unknown {
  const tokens = text.replace(/<\?[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g) ?? [];
  let i = 0;
  const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const next = () => {
    while (i < tokens.length && !tokens[i]!.trim()) i++;
    return tokens[i++];
  };
  const text_ = (tag: string) => {
    let s = '';
    while (i < tokens.length && tokens[i] !== `</${tag}>`) s += tokens[i++];
    i++;
    return unescape(s.trim());
  };
  const value = (depth: number): unknown => {
    if (depth > 64) throw new BrushImportError('property list nests too deeply');
    const tag = next();
    if (!tag) throw new BrushImportError('property list ends early');
    if (tag === '<plist>' || tag.startsWith('<plist ')) return value(depth);
    if (tag === '<dict/>') return {};
    if (tag === '<array/>') return [];
    if (tag === '<true/>') return true;
    if (tag === '<false/>') return false;
    if (tag === '<string/>') return '';
    if (tag === '<dict>') {
      const obj: Record<string, unknown> = {};
      for (;;) {
        const k = next();
        if (k === '</dict>') return obj;
        if (k !== '<key>') throw new BrushImportError('bad property list');
        const key = text_('key');
        obj[key] = value(depth + 1);
      }
    }
    if (tag === '<array>') {
      const arr: unknown[] = [];
      for (;;) {
        while (i < tokens.length && !tokens[i]!.trim()) i++;
        if (tokens[i] === '</array>') {
          i++;
          return arr;
        }
        arr.push(value(depth + 1));
      }
    }
    const m = /^<(string|integer|real|date|data)>$/.exec(tag);
    if (m) {
      const s = text_(m[1]!);
      if (m[1] === 'integer' || m[1] === 'real') return Number(s);
      return s;
    }
    throw new BrushImportError(`unexpected ${tag} in property list`);
  };
  return value(0);
}

export function parsePlist(b: Uint8Array): unknown {
  if (b.length >= 8 && String.fromCharCode(...b.subarray(0, 6)) === 'bplist') return parseBplist(b);
  return parseXmlPlist(new TextDecoder().decode(b));
}

/** The root object of an NSKeyedArchiver plist, its references resolved (a few levels deep). */
export function unarchive(plist: unknown): Record<string, unknown> | null {
  if (!plist || typeof plist !== 'object') return null;
  const p = plist as { $objects?: unknown[]; $top?: Record<string, unknown> };
  if (!Array.isArray(p.$objects) || !p.$top) return plist as Record<string, unknown>;
  const objects = p.$objects;
  const resolve = (x: unknown, depth: number): unknown => {
    if (depth > 6) return null;
    const u = asUid(x);
    if (u) return resolve(objects[u.uid], depth + 1);
    if (x === '$null') return null;
    return x;
  };
  const rootRef = p.$top.root ?? Object.values(p.$top)[0];
  const root = resolve(rootRef, 0);
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(root)) out[k] = resolve(val, 0);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Procreate

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The brushes in a Procreate .brushset or .brush (a zip). */
export async function readProcreate(bytes: Uint8Array, fileName: string): Promise<ImportedBrush[]> {
  let files: Map<string, Uint8Array>;
  try {
    files = await readZip(bytes);
  } catch (e) {
    throw new BrushImportError(`${fileName} is not a Procreate brush file (${e instanceof Error ? e.message : 'unreadable'}).`);
  }
  const lower = new Map([...files.keys()].map((k) => [k.toLowerCase(), k]));
  const archives = [...files.keys()].filter((k) => /(^|\/)brush\.archive$/i.test(k));
  if (!archives.length) throw new BrushImportError(`${fileName} has no Procreate brushes in it.`);
  // the set's own order, when it lists one
  const setPlist = lower.get('brushset.plist');
  let order: string[] = [];
  if (setPlist) {
    try {
      const s = parsePlist(files.get(setPlist)!) as { brushes?: unknown };
      if (Array.isArray(s.brushes)) order = s.brushes.filter((x): x is string => typeof x === 'string');
    } catch {
      // no order: zip order
    }
  }
  const dirOf = (k: string) => k.slice(0, k.length - 'brush.archive'.length);
  archives.sort((a, b) => {
    const ia = order.indexOf(dirOf(a).replace(/\/$/, '')), ib = order.indexOf(dirOf(b).replace(/\/$/, ''));
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  const base = fileName.replace(/\.[a-z]+$/i, '');
  const out: ImportedBrush[] = [];
  for (const arch of archives.slice(0, MAX_BRUSHES)) {
    const dir = dirOf(arch);
    const shapeKey = lower.get(`${dir}shape.png`.toLowerCase());
    if (!shapeKey) continue; // Procreate's own round tip: nothing to bring
    let info: Record<string, unknown> | null = null;
    try {
      info = unarchive(parsePlist(files.get(arch)!));
    } catch {
      info = null;
    }
    const name = typeof info?.name === 'string' && info.name.trim() ? info.name.trim() : archives.length === 1 ? base : `${base} ${out.length + 1}`;
    const b: ImportedBrush = { name: name.slice(0, 60), tip: { kind: 'png', bytes: files.get(shapeKey)! } };
    const size = num(info?.paintSize);
    if (size !== undefined) b.size = clamp(Math.round(size * 100), 2, 200);
    const op = num(info?.paintOpacity);
    if (op !== undefined) b.opacity = clamp(op, 0.05, 1);
    const sp = num(info?.plotSpacing);
    if (sp !== undefined) b.spacing = clamp(sp, 0.02, 2);
    const jit = num(info?.plotJitter);
    if (jit !== undefined) b.scatter = clamp(jit, 0, 2);
    const ps = num(info?.dynamicsPressureSize);
    if (ps !== undefined) b.pressureSize = clamp(ps, 0, 1);
    out.push(b);
  }
  if (!out.length) throw new BrushImportError(`${fileName}: its brushes use Procreate's round tip only; nothing to bring in.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Photoshop ABR

class Reader {
  p = 0;
  readonly v: DataView;
  constructor(readonly b: Uint8Array) {
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  need(n: number): void {
    if (n < 0 || this.p + n > this.b.length) throw new BrushImportError('the brush file ends early');
  }
  u8(): number { this.need(1); return this.b[this.p++]!; }
  u16(): number { this.need(2); const x = this.v.getUint16(this.p); this.p += 2; return x; }
  i16(): number { this.need(2); const x = this.v.getInt16(this.p); this.p += 2; return x; }
  u32(): number { this.need(4); const x = this.v.getUint32(this.p); this.p += 4; return x; }
  i32(): number { this.need(4); const x = this.v.getInt32(this.p); this.p += 4; return x; }
  str4(): string { this.need(4); const s = String.fromCharCode(...this.b.subarray(this.p, this.p + 4)); this.p += 4; return s; }
  skip(n: number): void { this.need(n); this.p += n; }
}

/** One sampled tip: bounds, depth, compression, then the pixels (8 or 16 bit grey, 255 paints). */
function readSample(r: Reader, top: number, left: number, bottom: number, right: number): { w: number; h: number; alpha: Uint8Array } {
  const depth = r.u16();
  const compressed = r.u8();
  const w = right - left, h = bottom - top;
  if (w <= 0 || h <= 0 || w > MAX_TIP || h > MAX_TIP) throw new BrushImportError('a brush tip has an impossible size');
  if (depth !== 8 && depth !== 16) throw new BrushImportError(`brush tips of ${depth}-bit depth are not supported`);
  const bpp = depth / 8;
  const raw = new Uint8Array(w * h * bpp);
  if (!compressed) {
    r.need(raw.length);
    raw.set(r.b.subarray(r.p, r.p + raw.length));
    r.p += raw.length;
  } else {
    // PackBits, row by row, after a table of row byte counts
    const rows = Array.from({ length: h }, () => r.u16());
    let o = 0;
    for (let y = 0; y < h; y++) {
      const end = r.p + rows[y]!;
      while (r.p < end) {
        let n = r.u8();
        if (n >= 128) n -= 256;
        if (n === -128) continue;
        if (n < 0) {
          const c = r.u8();
          for (let k = 0; k < 1 - n && o < raw.length; k++) raw[o++] = c;
        } else {
          r.need(n + 1);
          for (let k = 0; k < n + 1 && o < raw.length; k++) raw[o++] = r.b[r.p++]!;
          if (o >= raw.length) r.p = Math.max(r.p, end);
        }
      }
      r.p = end;
    }
  }
  const alpha = bpp === 1 ? raw : raw.filter((_, i) => i % 2 === 0); // 16 bit: the high byte
  return { w, h, alpha };
}

/** The sampled brushes in a Photoshop .abr. */
export function readAbr(bytes: Uint8Array, fileName: string): ImportedBrush[] {
  const r = new Reader(bytes);
  const base = fileName.replace(/\.[a-z]+$/i, '');
  const version = r.u16();
  const out: ImportedBrush[] = [];
  if (version === 1 || version === 2) {
    const count = r.u16();
    for (let i = 0; i < count && out.length < MAX_BRUSHES; i++) {
      const type = r.u16();
      const size = r.u32();
      const next = r.p + size;
      if (next > bytes.length) throw new BrushImportError('the brush file ends early');
      if (type === 2) {
        r.skip(4); // misc
        const spacing = r.u16();
        let name = '';
        if (version === 2) {
          const n = r.u32();
          if (n > 1024) throw new BrushImportError('a brush name is too long');
          for (let k = 0; k < n; k++) name += String.fromCharCode(r.u16());
          name = name.replace(/\0+$/, '').trim();
        }
        r.skip(9); // anti-alias, short bounds
        const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
        const tip = readSample(r, top, left, bottom, right);
        out.push({ name: (name || `${base} ${out.length + 1}`).slice(0, 60), tip: { kind: 'alpha', ...tip }, spacing: spacing > 0 ? clamp(spacing / 100, 0.02, 2) : undefined, size: clamp(Math.max(tip.w, tip.h), 2, 200) });
      }
      r.p = next;
    }
  } else if (version === 6 || version === 7 || version === 10) {
    const sub = r.u16();
    // find the "samp" section among the 8BIM sections
    let end = -1;
    while (r.p + 12 <= bytes.length) {
      const sig = r.str4();
      if (sig !== '8BIM' && sig !== '8B64') throw new BrushImportError('unrecognised section in the brush file');
      const key = r.str4();
      const len = r.u32();
      if (key === 'samp') {
        end = Math.min(bytes.length, r.p + len);
        break;
      }
      r.skip(len);
    }
    if (end < 0) throw new BrushImportError(`${fileName} has no sampled brush tips (only computed round brushes?).`);
    while (r.p + 4 < end && out.length < MAX_BRUSHES) {
      let len = r.u32();
      while (len % 4) len++;
      const next = r.p + len;
      if (next > bytes.length) throw new BrushImportError('the brush file ends early');
      r.skip(sub === 1 ? 47 : 301);
      const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
      try {
        const tip = readSample(r, top, left, bottom, right);
        out.push({ name: `${base} ${out.length + 1}`, tip: { kind: 'alpha', ...tip }, size: clamp(Math.max(tip.w, tip.h), 2, 200) });
      } catch (e) {
        if (!out.length && next >= end) throw e;
        // one unreadable tip: skip it, keep the others
      }
      r.p = next;
    }
  } else throw new BrushImportError(`${fileName}: Photoshop brush version ${version} is not supported.`);
  if (!out.length) throw new BrushImportError(`${fileName} has no sampled brush tips (only computed round brushes?).`);
  return out;
}

/** Read any supported brush file. */
export async function readBrushFile(bytes: Uint8Array, fileName: string): Promise<ImportedBrush[]> {
  if (/\.abr$/i.test(fileName)) return readAbr(bytes, fileName);
  if (/\.(brushset|brush|zip)$/i.test(fileName)) return readProcreate(bytes, fileName);
  // by content: zip or ABR
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readProcreate(bytes, fileName);
  return readAbr(bytes, fileName);
}
