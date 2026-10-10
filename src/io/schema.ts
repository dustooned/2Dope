import { PRESETS, type BrushSettings } from '../core/brush';
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
export const SCHEMA = 1;
export const FORMAT = '2dope';

export interface ExposureFile {
  drawing: string;
  length: number;
  /** Optional exposure-sheet note (added without a schema bump). */
  note?: string;
}

export interface LayerFile {
  id: string;
  type: 'drawing';
  name: string;
  /** Run-length exposures: show `drawing` for `length` frames. */
  exposures: ExposureFile[];
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
  format: typeof FORMAT;
  schema: number;
  /** The app version that wrote the file. */
  savedBy: string;
  name: string;
  created: string;
  modified: string;
  canvas: { width: number; height: number };
  fps: number;
  layers: LayerFile[];
  drawings: Record<string, DrawingFile>;
}

export class SchemaError extends Error {}

const MAX_DIM = 8192;
const MAX_DRAWINGS = 20_000;
const MAX_FRAMES = 1_000_000;
const MAX_VECTORS = 50_000;
const MAX_POINTS = 200_000;
export const ASSET_PATH = /^assets\/[A-Za-z0-9_.-]{1,120}\.png$/;
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
  return {
    x: num(v.x, 'point x', -1e6, 1e6),
    y: num(v.y, 'point y', -1e6, 1e6),
    pressure: num(v.pressure, 'point pressure', 0, 1),
    tiltX: num(v.tiltX ?? 0, 'point tiltX', -90, 90),
    tiltY: num(v.tiltY ?? 0, 'point tiltY', -90, 90),
    t: num(v.t ?? 0, 'point time', 0, 1e9),
  };
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

/** Upgrade older files to the current schema, step by step. Refuse newer ones. */
export function migrate(raw: unknown): Record<string, unknown> {
  if (!isObj(raw)) throw new SchemaError('this is not a 2Dope project');
  if (raw.format !== FORMAT) throw new SchemaError('this is not a 2Dope project (wrong format)');
  const schema = raw.schema;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) throw new SchemaError('the project has no valid schema version');
  if (schema > SCHEMA) throw new SchemaError(`this project was made by a newer version of 2Dope (file format ${schema}, this version reads up to ${SCHEMA}). Update 2Dope to open it.`);
  // Future: if (schema < 2) raw = from1to2(raw); ...
  return raw;
}

/** Check a parsed project.json and return it typed. Throws SchemaError with a readable reason. */
export function validateProjectFile(rawIn: unknown): ProjectFile {
  const raw = migrate(rawIn);
  if (!isObj(raw.canvas)) throw new SchemaError('the project has no canvas size');
  const width = int(raw.canvas.width, 'canvas width', 1, MAX_DIM);
  const height = int(raw.canvas.height, 'canvas height', 1, MAX_DIM);
  if (!Array.isArray(raw.layers) || raw.layers.length < 1) throw new SchemaError('the project has no layers');
  if (!isObj(raw.drawings)) throw new SchemaError('the project has no drawings');
  const ids = Object.keys(raw.drawings);
  if (ids.length > MAX_DRAWINGS) throw new SchemaError('the project has too many drawings');

  const drawings: Record<string, DrawingFile> = {};
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

  const layers: LayerFile[] = raw.layers.map((l: unknown, i: number) => {
    if (!isObj(l)) throw new SchemaError(`layer ${i + 1} is not an object`);
    if (l.type !== 'drawing') throw new SchemaError(`layer ${i + 1} has an unknown type`);
    if (!Array.isArray(l.exposures) || l.exposures.length < 1) throw new SchemaError(`layer ${i + 1} has no frames`);
    let frames = 0;
    const exposures = l.exposures.map((e: unknown) => {
      if (!isObj(e)) throw new SchemaError('an exposure is not an object');
      const drawing = str(e.drawing, 'exposure drawing', 64);
      if (!drawings[drawing]) throw new SchemaError(`a frame refers to a missing drawing "${drawing}"`);
      const length = int(e.length, 'exposure length', 1, MAX_FRAMES);
      frames += length;
      if (frames > MAX_FRAMES) throw new SchemaError('the timeline is too long');
      const note = typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 200) : undefined;
      return note ? { drawing, length, note } : { drawing, length };
    });
    return { id: str(l.id, 'layer id', 64), type: 'drawing' as const, name: str(l.name ?? 'Drawing', 'layer name'), exposures };
  });

  return {
    format: FORMAT,
    schema: raw.schema as number,
    savedBy: typeof raw.savedBy === 'string' ? raw.savedBy.slice(0, 80) : 'unknown',
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : 'Untitled',
    created: typeof raw.created === 'string' ? raw.created.slice(0, 40) : new Date(0).toISOString(),
    modified: typeof raw.modified === 'string' ? raw.modified.slice(0, 40) : new Date(0).toISOString(),
    canvas: { width, height },
    fps: int(raw.fps, 'fps', 1, 120),
    layers,
    drawings,
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
