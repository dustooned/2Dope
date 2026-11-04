import { effectAt, EFFECT_TYPES, MAX_LAYER_EFFECTS, newEffect, readEffects, type LayerEffect } from './effects';
import { EASED, valueAt, type Key, type Prop, type Side, type Value, type Vec2 } from './anim';
import type { Comp, Layer } from './comp';
import { DITHER_METHODS, PALETTES } from './dither';

export const PRESET_FORMAT = '2dope-preset', PRESET_VERSION = 1, MAX_PRESET_BYTES = 1024 * 1024;
export type MotionProperty = 'position' | 'scale' | 'rotation' | 'opacity' | 'zoom';
export type Preset = { format: typeof PRESET_FORMAT; version: 1; id: string; name: string } &
  ({ kind: 'effects'; effects: LayerEffect[] } | { kind: 'motion'; fps: number; duration: number; camera: boolean; props: Partial<Record<MotionProperty, Prop>> });
const properties: MotionProperty[] = ['position', 'scale', 'rotation', 'opacity', 'zoom'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (message: string): never => { throw new Error(`Preset: ${message}`); };
function number(v: unknown, lo: number, hi: number): number { return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fail('a value is outside its supported range.'); }
function fields(v: Record<string, unknown>, names: string[]): void { if (Object.keys(v).some(k => !names.includes(k))) fail('unsupported fields; use a compatible preset file.'); }
export function presetName(v: unknown): string { return typeof v === 'string' && v.trim() && v.trim().length <= 40 ? v.trim() : fail('use a name of 1–40 characters.'); }
function side(v: unknown): Side {
  if (!object(v) || !['linear', 'bezier', 'hold'].includes(String(v.interp))) return fail('invalid easing.');
  fields(v, ['interp', 'slope', 'influence']); return { interp: v.interp as Side['interp'], slope: number(v.slope, -100, 100), influence: number(v.influence, .01, 1) };
}
function effect(v: unknown): LayerEffect {
  if (!object(v)) return fail('invalid effect.');
  fields(v, ['id', 'type', 'on', 'target', 'amount', 'size', 'hold', 'seed', 'style', 'palette', 'method', 'gray', 'params']);
  const d = EFFECT_TYPES.find(d => d.id === v.type); if (!d) return fail('unknown effect type.');
  if (typeof v.id !== 'string' || !v.id || v.id.length > 40 || typeof v.on !== 'boolean' || !['line', 'fill', 'layer'].includes(String(v.target))) fail('invalid effect identity or target.');
  number(v.amount, ...d.amountRange); number(v.size, ...d.sizeRange);
  if (!Number.isInteger(v.hold) || !Number.isInteger(v.seed)) fail('invalid effect pattern.');
  number(v.hold, 1, 8); number(v.seed, 0, 4294967295);
  if (v.style !== undefined && (d.id !== 'texture' || !['paper', 'hatch', 'dots', 'weave'].includes(String(v.style)))) fail('invalid texture style.');
  if (v.palette !== undefined && (d.id !== 'dither' || !PALETTES.some(p => p.id === v.palette))) fail('unknown palette.');
  if (v.method !== undefined && (d.id !== 'dither' || !DITHER_METHODS.some(m => m.id === v.method))) fail('unknown dither method.');
  if (v.gray !== undefined && (d.id !== 'dither' || typeof v.gray !== 'boolean')) fail('invalid dither setting.');
  if (v.params !== undefined) {
    if (!object(v.params)) return fail('invalid effect settings.');
    for (const [key, value] of Object.entries(v.params)) {
      const setting = d.extras?.find(p => p.key === key); if (!setting) return fail('unknown effect setting.');
      if (setting.kind === 'range') number(value, setting.min, setting.max);
      else if (setting.kind === 'choice' && !setting.options.some(o => o.id === value) || setting.kind === 'toggle' && typeof value !== 'boolean' || setting.kind === 'color' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) fail('invalid effect setting.');
    }
  }
  return readEffects([v])![0]!;
}
/** Strict whole-record validation; nothing unknown is silently dropped or clamped. */
export function readPreset(v: unknown): Preset {
  if (!object(v) || v.format !== PRESET_FORMAT || v.version !== 1) return fail('unsupported file or version.');
  if (JSON.stringify(v).length > MAX_PRESET_BYTES) fail('file is too large.');
  if (typeof v.id !== 'string' || !/^[\w-]{1,64}$/.test(v.id)) fail('invalid id.');
  const base = { format: PRESET_FORMAT as typeof PRESET_FORMAT, version: 1 as const, id: v.id as string, name: presetName(v.name) };
  if (v.kind === 'effects') {
    fields(v, ['format', 'version', 'id', 'name', 'kind', 'effects']);
    if (!Array.isArray(v.effects) || !v.effects.length || v.effects.length > MAX_LAYER_EFFECTS) return fail('choose 1–16 effects.');
    return { ...base, kind: 'effects', effects: v.effects.map(effect) };
  }
  if (v.kind !== 'motion' || !object(v.props) || typeof v.camera !== 'boolean') return fail('invalid motion data.');
  fields(v, ['format', 'version', 'id', 'name', 'kind', 'fps', 'duration', 'camera', 'props']);
  const fps = number(v.fps, 1, 120), duration = number(v.duration, 1, 36000);
  if (!Number.isInteger(duration)) fail('invalid duration.');
  fields(v.props, properties); const props: Partial<Record<MotionProperty, Prop>> = {}; let count = 0;
  for (const [name, raw] of Object.entries(v.props)) {
    if (!object(raw) || !Array.isArray(raw.keys) || !raw.keys.length) return fail('motion has no keys.');
    fields(raw, ['value', 'keys']);
    const n = name as MotionProperty, vector = n === 'position' || n === 'scale';
    if (n === 'zoom' && !v.camera || n === 'opacity' && v.camera || n === 'scale' && v.camera) fail('incompatible camera properties.');
    const value = (x: unknown): Value => vector ? Array.isArray(x) && x.length === 2 ? [number(x[0], -1e5, 1e5), number(x[1], -1e5, 1e5)] : fail('invalid point.') : number(x, n === 'opacity' ? 0 : -1e5, n === 'opacity' ? 100 : 1e5);
    let previous = -1;
    const keys = raw.keys.map((k): Key => {
      if (!object(k)) return fail('invalid key.'); fields(k, ['f', 'v', 'in', 'out']);
      const f = number(k.f, 0, duration); if (!Number.isInteger(f) || f <= previous) return fail('keys must be sorted at unique frames.'); previous = f;
      if (++count > 5000) fail('too many keys.'); return { f, v: value(k.v), in: side(k.in), out: side(k.out) };
    });
    props[n] = { value: value(raw.value), keys };
  }
  if (!Object.keys(props).length) fail('motion has no properties.');
  return { ...base, kind: 'motion', fps, duration, camera: v.camera, props };
}
const base = (id: string, name: string) => ({ format: PRESET_FORMAT as typeof PRESET_FORMAT, version: 1 as const, id, name: presetName(name) });
export function captureEffects(layer: Layer, frame: number, id: string, name: string): Preset {
  const effects = (layer.effects ?? []).map(e => { const out = structuredClone(effectAt(e, frame)); delete out.keys; return out; });
  return readPreset({ ...base(id, name), kind: 'effects', effects });
}
export function captureMotion(layer: Layer, comp: Comp, id: string, name: string): Preset {
  const rows = properties.filter(n => layer.kind !== 'camera' || n !== 'scale' && n !== 'opacity').flatMap(n => { const prop = n === 'zoom' ? layer.kind === 'camera' ? layer.zoom : null : layer.transform[n]; return prop?.keys.length ? [{ n, prop }] : []; });
  const frames = rows.flatMap(r => r.prop.keys.map(k => k.f)), start = Math.min(...frames), end = Math.max(...frames);
  if (!frames.length || end <= start) return fail('animate at least two different frames first.');
  const props: Partial<Record<MotionProperty, Prop>> = {};
  for (const { n, prop } of rows) {
    const origin = valueAt(prop as Prop, start);
    const relative = (v: Value): Value => n === 'position' ? [((v as Vec2)[0] - (origin as Vec2)[0]) / comp.width, ((v as Vec2)[1] - (origin as Vec2)[1]) / comp.height]
      : n === 'scale' ? [(v as Vec2)[0] - (origin as Vec2)[0], (v as Vec2)[1] - (origin as Vec2)[1]] : n === 'opacity' ? v : (v as number) - (origin as number);
    props[n] = { value: relative(origin), keys: prop.keys.map(k => ({ ...structuredClone(k), f: k.f - start, v: relative(k.v) })) };
  }
  return readPreset({ ...base(id, name), kind: 'motion', camera: layer.kind === 'camera', fps: comp.fps, duration: end - start, props });
}
export interface PresetOptions { frame: number; duration: number; append: boolean }
/** Builds a detached candidate. Applying is the caller's one History command. */
export function presetLayer(preset: Preset, target: Layer, comp: Comp, options: PresetOptions, id: () => string): Layer {
  const p = readPreset(preset), out = structuredClone(target);
  if (target.locked) return fail('unlock the selected layer first.');
  if (p.kind === 'effects') {
    if (target.kind !== 'drawings' && target.kind !== 'comp') return fail('select artwork, a group or an adjustment layer.');
    if (target.kind === 'drawings' && target.title && p.effects.some(e => e.target === 'line')) return fail('titles use Colour pixels; choose Colour or Whole layer effects.');
    const effects = p.effects.map(e => ({ ...structuredClone(e), id: id(), ...((target.kind === 'comp' || target.adjust) ? { target: 'layer' as const } : {}) }));
    if (options.append && (target.effects?.length ?? 0) + effects.length > MAX_LAYER_EFFECTS) return fail('appending would exceed 16 effects.');
    out.effects = options.append ? [...(out.effects ?? []), ...effects] : effects;
    out.styleOrigin = { v: 1, name: p.name, effects: structuredClone(out.effects) }; return out;
  }
  if (p.camera !== (target.kind === 'camera')) return fail(p.camera ? 'select a camera layer for this move.' : 'select an artwork, group or anchor layer.');
  const start = options.frame - target.start, duration = number(options.duration, 1, 36000);
  if (!Number.isInteger(duration)) return fail('duration must be a whole number of frames.');
  if (!Number.isInteger(start) || start < 0 || start + duration > 1e6) return fail('move the playhead onto this layer.');
  for (const [name, source] of Object.entries(p.props)) {
    const n = name as MotionProperty, existing = n === 'zoom' && out.kind === 'camera' ? out.zoom : out.transform[n as Exclude<MotionProperty, 'zoom'>];
    const current = valueAt(existing as Prop, start);
    const offset = (v: Value): Value => n === 'position' ? [(current as Vec2)[0] + (v as Vec2)[0] * comp.width, (current as Vec2)[1] + (v as Vec2)[1] * comp.height]
      : n === 'scale' ? [(current as Vec2)[0] + (v as Vec2)[0], (current as Vec2)[1] + (v as Vec2)[1]] : n === 'opacity' ? v : (current as number) + (v as number);
    const keys = source.keys.map(k => ({ ...structuredClone(k), f: start + Math.round(k.f * duration / p.duration), v: offset(k.v) }));
    for (const key of keys) for (const v of Array.isArray(key.v) ? key.v : [key.v]) number(v, -1e9, 1e9);
    if (new Set(keys.map(k => k.f)).size !== keys.length) return fail('use a longer duration to keep every key at a unique frame.');
    if (n === 'zoom' && keys.some(k => Number(k.v) <= 0)) return fail('camera zoom must stay above zero.');
    const prop = { value: existing.value, keys: [...existing.keys.filter(k => k.f < start || k.f > start + duration), ...keys].sort((a, b) => a.f - b.f) };
    if (n === 'zoom' && out.kind === 'camera') out.zoom = prop as Prop<number>;
    else (out.transform as unknown as Record<string, Prop>)[n] = prop;
  }
  return out;
}
const motion = (id: string, name: string, n: MotionProperty, values: Value[], camera = false): Preset => ({ ...base(id, name), kind: 'motion', camera, fps: 24, duration: 24,
  props: { [n]: { value: values[0]!, keys: values.map((v, i) => ({ f: Math.round(i * 24 / (values.length - 1)), v, in: EASED, out: EASED })) } } });
export const BUILTIN_PRESETS: Preset[] = [
  motion('fade-in', 'Fade in', 'opacity', [0, 100]), motion('fade-out', 'Fade out', 'opacity', [100, 0]),
  motion('slide-in', 'Slide in', 'position', [[-.15, 0], [0, 0]]), motion('pop', 'Pop', 'scale', [[-20, -20], [8, 8], [0, 0]]),
  motion('camera-push', 'Camera push', 'zoom', [0, 15], true), motion('camera-pan', 'Camera pan', 'position', [[0, 0], [.08, 0]], true),
  { ...base('sticker-shadow', 'Sticker shadow'), kind: 'effects', effects: [newEffect('shadow', 'shadow', 1)] },
  { ...base('soft-glow', 'Soft glow'), kind: 'effects', effects: [newEffect('glow', 'glow', 1)] },
];
