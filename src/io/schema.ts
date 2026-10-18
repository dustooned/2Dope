import { readEffects, type LayerEffect } from '../core/effects';
import type { Interp, Key, Prop, Side, Value, Vec2 } from '../core/anim';
import { PRESETS, type BrushSettings } from '../core/brush';
import {
  BLEND_MODES,
  compLength,
  defaultPart,
  isDefaultPart,
  PART_NAMES,
  PIN_PROPS,
  PLAY_MODES,
  wouldCycle,
  type PlayMode,
  type BinFolder,
  type BlendMode,
  type Comp,
  type DrawingsLayer,
  type Layer,
  type PartName,
  type PinProp,
  type Transform,
} from '../core/comp';
import { CAPTION_FIELDS } from '../core/timeline';
import type { SoundClip } from '../core/audio';
import type { StrokePoint, StrokeRecord, Tool } from '../core/stroke';

/**
 * The 2Dope project file. A `.2dope` is a ZIP holding `project.json` plus `assets/*.png`
 * (content-addressed: the file name is a hash of the bytes, so identical drawings share one file).
 * `project.json` is plain, versioned JSON so scripts, diffs and other tools can read it.
 *
 * Rules for changing this file:
 * - Additive changes (new optional fields) keep `schema` as is.
 * - Anything else bumps SCHEMA and adds a step to `migrate`, which upgrades older files on open.
 * - Files from a NEWER schema are refused with a clear message, never half-read.
 */
export const SCHEMA = 3;
export const FORMAT = '2dope';

export interface ExposureFile {
  drawing: string;
  length: number;
  /** Optional exposure-sheet note (added without a schema bump). */
  note?: string;
  /** Storyboard captions (added without a schema bump). */
  dialogue?: string;
  action?: string;
  slug?: string;
}

/** A keyframe side (see core/anim.ts). `slope` and `influence` only matter for bezier. */
export interface SideFile {
  interp: Interp;
  slope?: number;
  influence?: number;
}

export interface KeyFile<T extends Value = Value> {
  f: number;
  v: T;
  in: SideFile;
  out: SideFile;
}

/** An animatable value: `value` when still, `keys` (frame-sorted, layer time) when animated. */
export interface PropFile<T extends Value = Value> {
  value: T;
  keys?: KeyFile<T>[];
}

export interface TransformFile {
  anchor: PropFile<Vec2>;
  position: PropFile<Vec2>;
  scale: PropFile<Vec2>;
  rotation: PropFile<number>;
  opacity: PropFile<number>;
}

export interface PartFile {
  visible?: boolean;
  opacity?: PropFile<number>;
  /** "#rrggbb" */
  tint?: string;
  offset?: PropFile<Vec2>;
  /** With a tint: a gradient to a second colour. */
  grad?: { kind: 'linear' | 'radial'; color2: string; angle: number };
}

export interface LayerFile {
  id: string;
  name: string;
  kind: 'drawings' | 'comp' | 'camera' | 'null';
  start: number;
  in: number;
  out: number | null;
  parent: string | null;
  visible: boolean;
  locked: boolean;
  label: number;
  blend: BlendMode;
  transform: TransformFile;
  /** drawings: run-length exposures in layer time. */
  exposures?: ExposureFile[];
  /** drawings / comp: how the content plays (older files: `loop: true` = "loop"). */
  play?: PlayMode;
  /** drawings / comp: playback rate, default 1. */
  speed?: number;
  /** drawings / comp: the frame "single" shows (0-based). */
  single?: number;
  /** drawings / comp: which content frame to show, keyed (0-based); overrides play and speed. */
  timeRemap?: PropFile<number>;
  /** A guide layer (storyboard / reference): left out of exports unless guideExport. */
  guide?: boolean;
  guideExport?: boolean;
  cel?: string;
  still?: boolean;
  clip?: boolean;
  alphaLock?: boolean;
  reference?: boolean;
  mask?: string;
  effects?: LayerEffect[];
  /** Written by early schema-2 files; read as play "loop". */
  loop?: boolean;
  /** drawings: Line / Fill part settings that differ from the defaults (additive, no version bump). */
  parts?: Partial<Record<PartName, PartFile>>;
  /** comp: the nested comp's id. */
  comp?: string;
  /** camera: 100 = the comp as is. */
  zoom?: PropFile<number>;
  /** comp: this instance's values for the comp's pinned properties, by "layerId:prop". */
  overrides?: Record<string, PropFile>;
}

export interface CompFile {
  audio?: SoundClip[];
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number | null;
  background: string | null;
  folder: string | null;
  /** Top of the stack first. */
  layers: LayerFile[];
  /** Properties shown as controls on every instance of this comp. */
  pins?: { layer: string; prop: PinProp }[];
}

export interface DrawingFile {
  /** Cel number shown in the UI. */
  num: number;
  /** Asset paths (assets/<hash>.png) or null for an empty plane. */
  line: string | null;
  fill: string | null;
  vectors: StrokeRecord[];
  /** Optional (added without a schema bump): key / breakdown / inbetween. Unknown values are ignored. */
  role?: 'key' | 'breakdown' | 'inbetween' | null;
}

export interface ProjectFile {
  sounds?: Record<string, { name: string; path: string; duration: number }>;
  format: typeof FORMAT;
  schema: number;
  /** The app version that wrote the file. */
  savedBy: string;
  name: string;
  created: string;
  modified: string;
  /** Pixel size of every drawing's page. */
  canvas: { width: number; height: number };
  /** The main comp's frame rate (repeated here for simple readers). */
  fps: number;
  /** The comp that is "the shot". */
  main: string;
  comps: Record<string, CompFile>;
  /** Project bin folders. */
  folders: Record<string, { name: string; parent: string | null }>;
  drawings: Record<string, DrawingFile>;
}

export class SchemaError extends Error {}

const MAX_DIM = 8192;
const MAX_DRAWINGS = 20_000;
const MAX_FRAMES = 1_000_000;
const MAX_VECTORS = 50_000;
const MAX_POINTS = 200_000;
const MAX_COMPS = 500;
const MAX_LAYERS = 1000;
const MAX_KEYS = 100_000;
export const ASSET_PATH = /^assets\/[A-Za-z0-9_.-]{1,120}\.png$/;
export const SOUND_PATH = /^assets\/[A-Za-z0-9_.-]{1,120}\.wav$/;
const TOOLS: Tool[] = ['brush', 'eraser', 'pen', 'fill'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new SchemaError(`${what} must be a number from ${min} to ${max}`);
  return v;
}

function int(v: unknown, what: string, min: number, max: number): number {
  const n = num(v, what, min, max);
  if (!Number.isInteger(n)) throw new SchemaError(`${what} must be a whole number`);
  return n;
}

function str(v: unknown, what: string, max = 200): string {
  if (typeof v !== 'string' || v.length > max) throw new SchemaError(`${what} must be text (up to ${max} characters)`);
  return v;
}

function point(v: unknown): StrokePoint {
  if (!isObj(v)) throw new SchemaError('a stroke point is not an object');
  const out: StrokePoint = {
    x: num(v.x, 'point x', -1e6, 1e6),
    y: num(v.y, 'point y', -1e6, 1e6),
    pressure: num(v.pressure, 'point pressure', 0, 1),
    tiltX: num(v.tiltX ?? 0, 'point tiltX', -90, 90),
    tiltY: num(v.tiltY ?? 0, 'point tiltY', -90, 90),
    t: num(v.t ?? 0, 'point time', 0, 1e9),
  };
  // per-point width from point editing (optional; older files have none)
  if (v.w !== undefined) out.w = num(v.w, 'point width', 0.05, 20);
  return out;
}

/** Brush settings from a file: unknown or missing fields fall back to the default brush. */
function brush(v: unknown): BrushSettings {
  if (!isObj(v)) throw new SchemaError('a stroke has no brush settings');
  const base = structuredClone(PRESETS[0]!);
  const merged = { ...base, ...v } as BrushSettings;
  merged.tiltShade = { ...base.tiltShade, ...(isObj(v.tiltShade) ? v.tiltShade : {}) };
  for (const k of ['sizeDyn', 'opacityDyn', 'flowDyn'] as const) merged[k] = { ...base[k], ...(isObj(v[k]) ? (v[k] as object) : {}) };
  for (const k of ['size', 'hardness', 'spacing', 'opacity', 'flow', 'roundness', 'angle', 'scatter', 'grain', 'grainScale', 'taperStart', 'taperEnd', 'smoothing'] as const) {
    if (typeof merged[k] !== 'number' || !Number.isFinite(merged[k])) throw new SchemaError(`brush ${k} must be a number`);
  }
  return merged;
}

function stroke(v: unknown): StrokeRecord {
  if (!isObj(v)) throw new SchemaError('a vector stroke is not an object');
  const tool = v.tool;
  if (typeof tool !== 'string' || !TOOLS.includes(tool as Tool)) throw new SchemaError('a stroke has an unknown tool');
  if (!Array.isArray(v.points) || v.points.length > MAX_POINTS) throw new SchemaError('a stroke has too many points');
  const color = str(v.color, 'stroke color', 9);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new SchemaError('a stroke color must look like #rrggbb');
  return {
    id: str(v.id, 'stroke id', 64),
    tool: tool as Tool,
    brush: brush(v.brush),
    color,
    seed: int(v.seed, 'stroke seed', 0, 0xffffffff),
    points: v.points.map(point),
  };
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A still property as written in files. */
function still<T extends Value>(value: T): PropFile<T> {
  return { value };
}

function defaultTransformFile(w: number, h: number): TransformFile {
  return { anchor: still<Vec2>([w / 2, h / 2]), position: still<Vec2>([w / 2, h / 2]), scale: still<Vec2>([100, 100]), rotation: still(0), opacity: still(100) };
}

/**
 * Schema 1 had one list of drawing layers and no comps. It becomes one comp (the shot) holding
 * those layers, each placed exactly over the page as before.
 */
function from1to2(raw: Record<string, unknown>): Record<string, unknown> {
  const canvas = isObj(raw.canvas) ? raw.canvas : {};
  const w = typeof canvas.width === 'number' ? canvas.width : 1920;
  const h = typeof canvas.height === 'number' ? canvas.height : 1080;
  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  const comp: CompFile = {
    name: 'Shot',
    width: w,
    height: h,
    fps: typeof raw.fps === 'number' ? raw.fps : 12,
    duration: null,
    background: null,
    folder: null,
    layers: layers.map((l: unknown, i: number) => {
      const o = isObj(l) ? l : {};
      return {
        id: typeof o.id === 'string' && ID.test(o.id) ? o.id : `layer${i + 1}`,
        name: typeof o.name === 'string' ? o.name : 'Drawing',
        kind: 'drawings',
        start: 0,
        in: 0,
        out: null,
        parent: null,
        visible: true,
        locked: false,
        label: 0,
        blend: 'normal',
        transform: defaultTransformFile(w, h),
        exposures: (o.exposures as ExposureFile[]) ?? [],
      } satisfies LayerFile;
    }),
  };
  const out: Record<string, unknown> = { ...raw, schema: 2, main: 'c1', comps: { c1: comp }, folders: {} };
  delete out.layers;
  return out;
}

const INTERPS: Interp[] = ['linear', 'bezier', 'hold'];

function side(v: unknown, what: string): SideFile {
  if (!isObj(v)) throw new SchemaError(`${what} is not an object`);
  if (!INTERPS.includes(v.interp as Interp)) throw new SchemaError(`${what} has an unknown interpolation`);
  const out: SideFile = { interp: v.interp as Interp };
  if (v.interp === 'bezier') {
    out.slope = num(v.slope ?? 0, `${what} slope`, -1e3, 1e3);
    out.influence = num(v.influence ?? 1 / 3, `${what} influence`, 0.01, 1);
  }
  return out;
}

function val(v: unknown, what: string, dims: 1 | 2): Value {
  if (dims === 1) return num(v, what, -1e9, 1e9);
  if (!Array.isArray(v) || v.length !== 2) throw new SchemaError(`${what} must be [x, y]`);
  return [num(v[0], `${what} x`, -1e9, 1e9), num(v[1], `${what} y`, -1e9, 1e9)];
}

function prop<T extends Value>(v: unknown, what: string, dims: 1 | 2): PropFile<T> {
  if (!isObj(v)) throw new SchemaError(`${what} is not an object`);
  const out: PropFile<T> = { value: val(v.value, `${what} value`, dims) as T };
  if (v.keys !== undefined) {
    if (!Array.isArray(v.keys) || v.keys.length > MAX_KEYS) throw new SchemaError(`${what} has too many keys`);
    const keys = v.keys.map((k: unknown, i: number) => {
      if (!isObj(k)) throw new SchemaError(`${what} key ${i + 1} is not an object`);
      return { f: int(k.f, `${what} key frame`, -MAX_FRAMES, MAX_FRAMES), v: val(k.v, `${what} key value`, dims) as T, in: side(k.in, `${what} key in`), out: side(k.out, `${what} key out`) };
    });
    keys.sort((a: KeyFile<T>, b: KeyFile<T>) => a.f - b.f);
    for (let i = 1; i < keys.length; i++) if (keys[i]!.f === keys[i - 1]!.f) throw new SchemaError(`${what} has two keys on frame ${keys[i]!.f}`);
    if (keys.length) out.keys = keys;
  }
  return out;
}

function transform(v: unknown, what: string): TransformFile {
  if (!isObj(v)) throw new SchemaError(`${what} transform is missing`);
  return {
    anchor: prop<Vec2>(v.anchor, `${what} anchor`, 2),
    position: prop<Vec2>(v.position, `${what} position`, 2),
    scale: prop<Vec2>(v.scale, `${what} scale`, 2),
    rotation: prop<number>(v.rotation, `${what} rotation`, 1),
    opacity: prop<number>(v.opacity, `${what} opacity`, 1),
  };
}

function exposureList(v: unknown, what: string, drawings: Record<string, DrawingFile>): ExposureFile[] {
  if (!Array.isArray(v)) throw new SchemaError(`${what} has no exposures`);
  let frames = 0;
  return v.map((e: unknown) => {
    if (!isObj(e)) throw new SchemaError('an exposure is not an object');
    const drawing = str(e.drawing, 'exposure drawing', 64);
    if (!drawings[drawing]) throw new SchemaError(`a frame refers to a missing drawing "${drawing}"`);
    const length = int(e.length, 'exposure length', 1, MAX_FRAMES);
    frames += length;
    if (frames > MAX_FRAMES) throw new SchemaError('the timeline is too long');
    const out: ExposureFile = { drawing, length };
    for (const f of CAPTION_FIELDS) {
      const t = e[f.key];
      if (typeof t === 'string' && t.trim()) out[f.key] = t.trim().slice(0, f.max);
    }
    return out;
  });
}

const KINDS: LayerFile['kind'][] = ['drawings', 'comp', 'camera', 'null'];

/** Play mode, speed, held frame and time remap of a drawings or precomp layer (defaults left out). */
function timing(v: Record<string, unknown>, out: LayerFile, what: string): void {
  const play = PLAY_MODES.includes(v.play as PlayMode) ? (v.play as PlayMode) : v.loop === true ? 'loop' : 'once';
  if (play !== 'once') out.play = play;
  const speed = v.speed === undefined ? 1 : num(v.speed, `${what} speed`, 0.01, 100);
  if (speed !== 1) out.speed = speed;
  const single = v.single === undefined ? 0 : int(v.single, `${what} held frame`, 0, MAX_FRAMES);
  if (single) out.single = single;
  if (v.timeRemap !== undefined) {
    const r = prop<number>(v.timeRemap, `${what} time remap`, 1);
    if (r.keys?.length) out.timeRemap = r;
  }
}

function layer(v: unknown, what: string, drawings: Record<string, DrawingFile>, comps: Record<string, unknown>): LayerFile {
  if (!isObj(v)) throw new SchemaError(`${what} is not an object`);
  const kind = v.kind as LayerFile['kind'];
  if (!KINDS.includes(kind)) throw new SchemaError(`${what} has an unknown kind`);
  const id = str(v.id, `${what} id`, 64);
  if (!ID.test(id)) throw new SchemaError(`${what} id "${id}" is not allowed`);
  const out: LayerFile = {
    id,
    name: str(v.name ?? 'Layer', `${what} name`),
    kind,
    start: int(v.start ?? 0, `${what} start`, -MAX_FRAMES, MAX_FRAMES),
    in: int(v.in ?? 0, `${what} in`, -MAX_FRAMES, MAX_FRAMES),
    out: v.out === null || v.out === undefined ? null : int(v.out, `${what} out`, -MAX_FRAMES, MAX_FRAMES),
    parent: typeof v.parent === 'string' && ID.test(v.parent) ? v.parent : null,
    visible: v.visible !== false,
    locked: v.locked === true,
    label: typeof v.label === 'number' && Number.isInteger(v.label) && v.label >= 0 && v.label <= 16 ? v.label : 0,
    blend: BLEND_MODES.includes(v.blend as BlendMode) ? (v.blend as BlendMode) : 'normal',
    transform: transform(v.transform, what),
  };
  if (v.guide === true) out.guide = true;
  if (v.guideExport === true) out.guideExport = true;
  if (typeof v.cel === 'string' && ID.test(v.cel)) out.cel = v.cel;
  if (v.still === true) out.still = true;
  if (v.clip === true) out.clip = true;
  if (v.alphaLock === true) out.alphaLock = true;
  if (v.reference === true) out.reference = true;
  if (typeof v.mask === 'string' && Object.prototype.hasOwnProperty.call(drawings, v.mask)) out.mask = v.mask;
  const fx = readEffects(v.effects);
  if (fx) out.effects = fx;
  if (kind === 'drawings') {
    out.exposures = exposureList(v.exposures, what, drawings);
    if (!out.exposures.length) throw new SchemaError(`${what} has no frames`);
    timing(v, out, what);
    if (isObj(v.parts)) {
      const parts: Partial<Record<PartName, PartFile>> = {};
      for (const n of PART_NAMES) {
        const pv = v.parts[n];
        if (!isObj(pv)) continue;
        const pf: PartFile = {};
        if (pv.visible === false) pf.visible = false;
        if (pv.opacity !== undefined) pf.opacity = prop<number>(pv.opacity, `${what} ${n} opacity`, 1);
        if (typeof pv.tint === 'string' && /^#[0-9a-fA-F]{6}$/.test(pv.tint)) pf.tint = pv.tint;
        const gv = pv.grad;
        if (pf.tint && isObj(gv) && (gv.kind === 'linear' || gv.kind === 'radial') && typeof gv.color2 === 'string' && /^#[0-9a-fA-F]{6}$/.test(gv.color2)) {
          const ang = typeof gv.angle === 'number' && Number.isFinite(gv.angle) ? ((Math.round(gv.angle) % 360) + 360) % 360 : 0;
          pf.grad = { kind: gv.kind, color2: gv.color2, angle: ang };
        }
        if (pv.offset !== undefined) pf.offset = prop<Vec2>(pv.offset, `${what} ${n} offset`, 2);
        parts[n] = pf;
      }
      if (Object.keys(parts).length) out.parts = parts;
    }
  } else if (kind === 'comp') {
    const c = str(v.comp, `${what} comp`, 64);
    if (!isObj(comps[c])) throw new SchemaError(`${what} refers to a missing comp "${c}"`);
    out.comp = c;
    timing(v, out, what);
    if (isObj(v.overrides)) {
      const o: Record<string, PropFile> = {};
      for (const [k, p] of Object.entries(v.overrides)) {
        const m = /^([A-Za-z0-9_-]{1,64}):(position|scale|rotation|opacity|anchor|zoom)$/.exec(k);
        if (!m) continue;
        o[k] = prop(p, `${what} override ${k}`, m[2] === 'position' || m[2] === 'scale' || m[2] === 'anchor' ? 2 : 1);
      }
      if (Object.keys(o).length) out.overrides = o;
    }
  } else if (kind === 'camera') {
    out.zoom = v.zoom === undefined ? still(100) : prop<number>(v.zoom, `${what} zoom`, 1);
  }
  return out;
}

/** Upgrade older files to the current schema, step by step. Refuse newer ones. */
export function migrate(input: unknown): Record<string, unknown> {
  if (!isObj(input)) throw new SchemaError('this is not a 2Dope project');
  let raw: Record<string, unknown> = input;
  if (raw.format !== FORMAT) throw new SchemaError('this is not a 2Dope project (wrong format)');
  const schema = raw.schema;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) throw new SchemaError('the project has no valid schema version');
  if (schema > SCHEMA) throw new SchemaError(`this project was made by a newer version of 2Dope (file format ${schema}, this version reads up to ${SCHEMA}). Update 2Dope to open it.`);
  if (schema < 2) raw = from1to2(raw);
  if ((raw.schema as number) < 3) raw = { ...raw, schema: 3 };
  return raw;
}

/** Check a parsed project.json and return it typed. Throws SchemaError with a readable reason. */
export function validateProjectFile(rawIn: unknown): ProjectFile {
  const raw = migrate(rawIn);
  if (!isObj(raw.canvas)) throw new SchemaError('the project has no canvas size');
  const width = int(raw.canvas.width, 'canvas width', 1, MAX_DIM);
  const height = int(raw.canvas.height, 'canvas height', 1, MAX_DIM);
  if (!isObj(raw.drawings)) throw new SchemaError('the project has no drawings');
  const ids = Object.keys(raw.drawings);
  if (ids.length > MAX_DRAWINGS) throw new SchemaError('the project has too many drawings');

  const drawings: Record<string, DrawingFile> = {};
  const sounds: NonNullable<ProjectFile['sounds']> = {};
  if (raw.sounds !== undefined) {
    if (!isObj(raw.sounds) || Object.keys(raw.sounds).length > 64) throw new SchemaError('the project has too many audio assets');
    for (const [id, sound] of Object.entries(raw.sounds)) {
      if (!ID.test(id) || !isObj(sound) || typeof sound.path !== 'string' || !SOUND_PATH.test(sound.path)) throw new SchemaError('an audio asset has an invalid path or id');
      sounds[id] = { name: str(sound.name, 'audio name'), path: sound.path, duration: num(sound.duration, 'audio duration', 0.001, 120) };
    }
  }
  let vectorTotal = 0;
  for (const id of ids) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new SchemaError(`drawing id "${id}" is not allowed`);
    const d = (raw.drawings as Record<string, unknown>)[id];
    if (!isObj(d)) throw new SchemaError(`drawing ${id} is not an object`);
    const planes: Record<'line' | 'fill', string | null> = { line: null, fill: null };
    for (const k of ['line', 'fill'] as const) {
      const p = d[k] ?? null;
      if (p !== null && (typeof p !== 'string' || !ASSET_PATH.test(p))) throw new SchemaError(`drawing ${id} has a bad ${k} asset path`);
      planes[k] = p as string | null;
    }
    const vectors = Array.isArray(d.vectors) ? d.vectors : [];
    vectorTotal += vectors.length;
    if (vectorTotal > MAX_VECTORS) throw new SchemaError('the project has too many vector strokes');
    const role = d.role === 'key' || d.role === 'breakdown' || d.role === 'inbetween' ? d.role : null;
    drawings[id] = { num: int(d.num, `drawing ${id} number`, 1, 1e9), ...planes, vectors: vectors.map(stroke), ...(role ? { role } : {}) };
  }

  if (!isObj(raw.comps)) throw new SchemaError('the project has no comps');
  const compIds = Object.keys(raw.comps);
  if (compIds.length < 1 || compIds.length > MAX_COMPS) throw new SchemaError('the project has no comps, or too many');
  const folders: ProjectFile['folders'] = {};
  if (isObj(raw.folders)) {
    for (const [id, f] of Object.entries(raw.folders)) {
      if (!ID.test(id) || !isObj(f)) continue;
      folders[id] = { name: str(f.name ?? 'Folder', 'folder name'), parent: typeof f.parent === 'string' && f.parent !== id ? f.parent : null };
    }
    for (const f of Object.values(folders)) if (f.parent && !folders[f.parent]) f.parent = null;
  }
  let frames = 0;
  const comps: Record<string, CompFile> = {};
  for (const id of compIds) {
    if (!ID.test(id)) throw new SchemaError(`comp id "${id}" is not allowed`);
    const c = (raw.comps as Record<string, unknown>)[id];
    if (!isObj(c)) throw new SchemaError(`comp ${id} is not an object`);
    const cw = int(c.width, `comp ${id} width`, 1, MAX_DIM);
    const ch = int(c.height, `comp ${id} height`, 1, MAX_DIM);
    if (!Array.isArray(c.layers) || c.layers.length > MAX_LAYERS) throw new SchemaError(`comp ${id} has no layer list, or too many layers`);
    const layerIds = new Set<string>();
    const layers = c.layers.map((l: unknown, i: number) => {
      const ly = layer(l, `comp ${id} layer ${i + 1}`, drawings, raw.comps as Record<string, unknown>);
      if (layerIds.has(ly.id)) throw new SchemaError(`comp ${id} has two layers with id ${ly.id}`);
      layerIds.add(ly.id);
      if (ly.exposures) {
        for (const e of ly.exposures) frames += e.length;
        if (frames > MAX_FRAMES) throw new SchemaError('the timeline is too long');
      }
      return ly;
    });
    for (const ly of layers) if (ly.parent && (!layerIds.has(ly.parent) || ly.parent === ly.id)) ly.parent = null;
    const bg = c.background;
    comps[id] = {
      name: str(c.name ?? 'Comp', `comp ${id} name`),
      width: cw,
      height: ch,
      fps: int(c.fps, `comp ${id} fps`, 1, 120),
      duration: c.duration === null || c.duration === undefined ? null : int(c.duration, `comp ${id} duration`, 1, MAX_FRAMES),
      background: typeof bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : null,
      folder: typeof c.folder === 'string' && folders[c.folder] ? c.folder : null,
      layers,
    };
    if (c.audio !== undefined) {
      if (!Array.isArray(c.audio) || c.audio.length > 64) throw new SchemaError('too many audio clips');
      const clipIds = new Set<string>();
      comps[id]!.audio = c.audio.map((rawClip: unknown): SoundClip => {
        if (!isObj(rawClip) || typeof rawClip.id !== 'string' || !ID.test(rawClip.id) || clipIds.has(rawClip.id)) throw new SchemaError('invalid or duplicate audio clip id');
        clipIds.add(rawClip.id);
        const asset = typeof rawClip.asset === 'string' ? rawClip.asset : '';
        const sound = sounds[asset];
        if (!sound) throw new SchemaError('an audio clip references a missing asset');
        const trimIn = num(rawClip.trimIn, 'audio source in', 0, sound.duration);
        const trimOut = num(rawClip.trimOut, 'audio source out', 0.001, sound.duration + 0.0001);
        if (trimOut <= trimIn) throw new SchemaError('audio source out must follow source in');
        let link: SoundClip['link'] = null;
        if (rawClip.link !== null && rawClip.link !== undefined) {
          const a = rawClip.link;
          if (!isObj(a) || typeof a.layer !== 'string' || !ID.test(a.layer) || typeof a.drawing !== 'string' || !ID.test(a.drawing)) throw new SchemaError('invalid audio panel link');
          link = { layer: a.layer, drawing: a.drawing, occurrence: int(a.occurrence ?? 0, 'audio panel occurrence', 0, MAX_FRAMES), offset: int(a.offset, 'audio panel offset', -MAX_FRAMES, MAX_FRAMES) };
        }
        return { id: rawClip.id, asset, name: str(rawClip.name, 'clip name'), start: int(rawClip.start, 'audio start', 0, MAX_FRAMES), trimIn, trimOut, gain: num(rawClip.gain, 'audio volume', 0, 2), muted: rawClip.muted === true, link };
      });
    }
    if (Array.isArray(c.pins)) {
      const pins = c.pins
        .filter((p): p is { layer: string; prop: PinProp } => isObj(p) && typeof p.layer === 'string' && layerIds.has(p.layer) && PIN_PROPS.includes(p.prop as PinProp))
        .map((p) => ({ layer: p.layer, prop: p.prop }));
      if (pins.length) comps[id]!.pins = pins;
    }
  }
  const main = typeof raw.main === 'string' && comps[raw.main] ? raw.main : compIds[0]!;
  // a comp may not contain itself, directly or through other comps
  const model = compsFromFile({ comps } as ProjectFile);
  for (const c of model.values()) for (const l of c.layers) if (l.kind === 'comp' && wouldCycle(c.id, l.comp, model)) throw new SchemaError(`comp ${c.id} contains itself`);

  return {
    format: FORMAT,
    schema: raw.schema as number,
    savedBy: typeof raw.savedBy === 'string' ? raw.savedBy.slice(0, 80) : 'unknown',
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : 'Untitled',
    created: typeof raw.created === 'string' ? raw.created.slice(0, 40) : new Date(0).toISOString(),
    modified: typeof raw.modified === 'string' ? raw.modified.slice(0, 40) : new Date(0).toISOString(),
    canvas: { width, height },
    fps: comps[main]!.fps,
    main,
    comps,
    folders,
    drawings,
    ...(Object.keys(sounds).length ? { sounds } : {}),
  };
}

export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SchemaError('project.json is not valid JSON');
  }
  return validateProjectFile(raw);
}

/** Every asset path a project refers to. */
export function assetPaths(p: ProjectFile): Set<string> {
  const s = new Set<string>();
  for (const d of Object.values(p.drawings)) {
    if (d.line) s.add(d.line);
    if (d.fill) s.add(d.fill);
  }
  for (const sound of Object.values(p.sounds ?? {})) s.add(sound.path);
  return s;
}

/**
 * Serialize with a safety check (as the Craft apps do): the text must read back and validate
 * before anything is written, so a bug can never save a file we cannot open.
 */
export function stringifyProjectFile(p: ProjectFile): string {
  const text = JSON.stringify(p, null, 1);
  parseProjectFile(text);
  return text;
}

// ---------------------------------------------------------------------------------------------
// File <-> model

function sideOf(f: SideFile): Side {
  return { interp: f.interp, slope: f.slope ?? (f.interp === 'linear' ? 1 : 0), influence: f.influence ?? 1 / 3 };
}

function propOf<T extends Value>(f: PropFile<T>): Prop<T> {
  return { value: f.value, keys: (f.keys ?? []).map((k): Key<T> => ({ f: k.f, v: k.v, in: sideOf(k.in), out: sideOf(k.out) })) };
}

function sideFile(s: Side): SideFile {
  return s.interp === 'bezier' ? { interp: 'bezier', slope: s.slope, influence: s.influence } : { interp: s.interp };
}

export function propFile<T extends Value>(p: Prop<T>): PropFile<T> {
  const out: PropFile<T> = { value: p.value };
  if (p.keys.length) out.keys = p.keys.map((k) => ({ f: k.f, v: k.v, in: sideFile(k.in), out: sideFile(k.out) }));
  return out;
}

function transformOf(t: TransformFile): Transform {
  return { anchor: propOf(t.anchor), position: propOf(t.position), scale: propOf(t.scale), rotation: propOf(t.rotation), opacity: propOf(t.opacity) };
}

function transformFile(t: Transform): TransformFile {
  return { anchor: propFile(t.anchor), position: propFile(t.position), scale: propFile(t.scale), rotation: propFile(t.rotation), opacity: propFile(t.opacity) };
}

/** The comps of a (validated) file as model objects. */
export function compsFromFile(file: Pick<ProjectFile, 'comps'>): Map<string, Comp> {
  const out = new Map<string, Comp>();
  for (const [id, c] of Object.entries(file.comps)) {
    const layers: Layer[] = c.layers.map((l): Layer => {
      const base = {
        id: l.id,
        name: l.name,
        start: l.start,
        in: l.in,
        out: l.out,
        parent: l.parent,
        visible: l.visible,
        locked: l.locked,
        label: l.label,
        blend: l.blend,
        transform: transformOf(l.transform),
        ...(l.guide ? { guide: true } : {}),
        ...(l.guideExport ? { guideExport: true } : {}),
        ...(l.cel ? { cel: l.cel } : {}),
        ...(l.still ? { still: true } : {}),
        ...(l.clip ? { clip: true } : {}),
        ...(l.alphaLock ? { alphaLock: true } : {}),
        ...(l.reference ? { reference: true } : {}),
        ...(l.mask ? { mask: l.mask } : {}),
        ...(l.effects?.length ? { effects: structuredClone(l.effects) } : {}),
      };
      const timed = { play: l.play ?? (l.loop ? 'loop' : 'once'), speed: l.speed ?? 1, single: l.single ?? 0, timeRemap: l.timeRemap ? propOf(l.timeRemap) : null } as const;
      if (l.kind === 'drawings') {
        const layer: DrawingsLayer = { ...base, kind: 'drawings', exposures: (l.exposures ?? []).map((e) => ({ ...e })), ...timed };
        if (l.parts) {
          layer.parts = {};
          for (const n of PART_NAMES) {
            const f = l.parts[n];
            if (!f) continue;
            const d = defaultPart();
            layer.parts[n] = { visible: f.visible !== false, opacity: f.opacity ? propOf(f.opacity) : d.opacity, tint: f.tint ?? null, offset: f.offset ? propOf(f.offset) : d.offset };
            const g = f.grad;
            if (g && (g.kind === 'linear' || g.kind === 'radial') && typeof g.color2 === 'string' && /^#[0-9a-f]{6}$/i.test(g.color2)) {
              layer.parts[n]!.grad = { kind: g.kind, color2: g.color2, angle: Number.isFinite(g.angle) ? ((Math.round(g.angle) % 360) + 360) % 360 : 0 };
            }
          }
        }
        return layer;
      }
      if (l.kind === 'comp') return { ...base, kind: 'comp', comp: l.comp!, ...timed, overrides: Object.fromEntries(Object.entries(l.overrides ?? {}).map(([k, p]) => [k, propOf(p)])) };
      if (l.kind === 'camera') return { ...base, kind: 'camera', zoom: propOf(l.zoom ?? still(100)) };
      return { ...base, kind: 'null' };
    });
    out.set(id, {
      id,
      name: c.name,
      width: c.width,
      height: c.height,
      fps: c.fps,
      duration: c.duration,
      background: c.background,
      folder: c.folder,
      layers,
      pins: (c.pins ?? []).map((p) => ({ ...p })),
      ...(c.audio?.length ? { audio: structuredClone(c.audio) } : {}),
    });
  }
  return out;
}

/** A comp as written in files. */
export function compFile(c: Comp): CompFile {
  const out: CompFile = {
    name: c.name,
    width: c.width,
    height: c.height,
    fps: c.fps,
    duration: c.duration,
    background: c.background,
    folder: c.folder,
    layers: c.layers.map((l): LayerFile => {
      const base: LayerFile = {
        id: l.id,
        name: l.name,
        kind: l.kind,
        start: l.start,
        in: l.in,
        out: l.out,
        parent: l.parent,
        visible: l.visible,
        locked: l.locked,
        label: l.label,
        blend: l.blend,
        transform: transformFile(l.transform),
      };
      if (l.guide) base.guide = true;
      if (l.guideExport) base.guideExport = true;
      if (l.cel) base.cel = l.cel;
      if (l.still) base.still = true;
      if (l.clip) base.clip = true;
      if (l.alphaLock) base.alphaLock = true;
      if (l.reference) base.reference = true;
      if (l.mask) base.mask = l.mask;
      if (l.effects?.length) base.effects = readEffects(l.effects);
      const timed: Partial<LayerFile> = {};
      if (l.kind === 'drawings' || l.kind === 'comp') {
        if (l.play !== 'once') timed.play = l.play;
        if (l.speed !== 1) timed.speed = l.speed;
        if (l.single) timed.single = l.single;
        if (l.timeRemap?.keys.length) timed.timeRemap = propFile(l.timeRemap);
      }
      if (l.kind === 'drawings') {
        const out: LayerFile = { ...base, exposures: l.exposures.map((e) => ({ ...e })), ...timed };
        const parts: Partial<Record<PartName, PartFile>> = {};
        for (const n of PART_NAMES) {
          const pt = l.parts?.[n];
          if (!pt || isDefaultPart(pt)) continue;
          const f: PartFile = {};
          if (!pt.visible) f.visible = false;
          if (pt.opacity.keys.length || pt.opacity.value !== 100) f.opacity = propFile(pt.opacity);
          if (pt.tint) f.tint = pt.tint;
          if (pt.grad) f.grad = { ...pt.grad };
          if (pt.offset.keys.length || pt.offset.value[0] || pt.offset.value[1]) f.offset = propFile(pt.offset);
          parts[n] = f;
        }
        if (Object.keys(parts).length) out.parts = parts;
        return out;
      }
      if (l.kind === 'comp') {
        const o = Object.entries(l.overrides ?? {});
        return o.length ? { ...base, comp: l.comp, ...timed, overrides: Object.fromEntries(o.map(([k, p]) => [k, propFile(p)])) } : { ...base, comp: l.comp, ...timed };
      }
      if (l.kind === 'camera') return { ...base, zoom: propFile(l.zoom) };
      return base;
    }),
  };
  if (c.pins.length) out.pins = c.pins.map((p) => ({ ...p }));
  if (c.audio?.length) out.audio = structuredClone(c.audio);
  return out;
}

export function foldersOf(file: Pick<ProjectFile, 'folders'>): BinFolder[] {
  return Object.entries(file.folders ?? {}).map(([id, f]) => ({ id, name: f.name, parent: f.parent }));
}

/** The shot's length in frames. */
export function mainLength(file: ProjectFile): number {
  const comps = compsFromFile(file);
  const c = comps.get(file.main);
  return c ? compLength(c, comps) : 0;
}
