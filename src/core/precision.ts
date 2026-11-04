import { type Key, type Prop, type Side, type Vec2 } from './anim';
export function timingHandles(out: Side, inn: Side): [Vec2, Vec2] {
  let x = out.interp === 'bezier' ? out.influence : 1 / 3, incoming = inn.interp === 'bezier' ? inn.influence : 1 / 3;
  if (x + incoming > 1) { const sum = x + incoming; x /= sum; incoming /= sum; }
  return [[x, (out.interp === 'bezier' ? out.slope : out.interp === 'hold' ? 0 : 1) * x], [1 - incoming, 1 - (inn.interp === 'bezier' ? inn.slope : 1) * incoming]];
}
/** Store the visible timing handles, with monotonic time and bounded normalized speed. */
export function editTiming(p: Prop, frame: number, side: 'out' | 'in', point: Vec2): Prop {
  const i = p.keys.findIndex(k => k.f === frame), a = p.keys[i], b = p.keys[i + 1]; if (!a || !b) throw new Error('Choose an adjacent keyframe segment.');
  const [out, inn] = timingHandles(a.out, b.in), keys = structuredClone(p.keys), clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  out[0] = clamp(out[0], .01, .99); inn[0] = clamp(inn[0], out[0], .99);
  if (side === 'out') { out[0] = clamp(point[0], .01, inn[0]); out[1] = point[1]; } else { inn[0] = clamp(point[0], out[0], .99); inn[1] = point[1]; }
  const make = (x: number, y: number): Side => ({ interp: 'bezier', influence: x, slope: clamp(y / x, -100, 100) });
  keys[i]!.out = make(out[0], out[1]); keys[i + 1]!.in = make(1 - inn[0], 1 - inn[1]); return { ...p, keys };
}
export function spatialHandle(p: Prop<Vec2>, index: number, side: 'in' | 'out'): Vec2 {
  const k = p.keys[index]!; if (k.spatial) return [...k.spatial[side]];
  const other = p.keys[index + (side === 'out' ? 1 : -1)]; return other ? [(other.v[0] - k.v[0]) / 3, (other.v[1] - k.v[1]) / 3] : [0, 0];
}
export function smoothPath(p: Prop<Vec2>): Prop<Vec2> {
  return { ...p, keys: p.keys.map((k, i, keys) => {
    const a = keys[i - 1] ?? k, b = keys[i + 1] ?? k, divisor = i === 0 || i === keys.length - 1 ? 3 : 6, tangent: Vec2 = [(b.v[0] - a.v[0]) / divisor, (b.v[1] - a.v[1]) / divisor];
    return { ...k, spatial: { in: [-tangent[0], -tangent[1]], out: tangent } };
  }) };
}
export function validateProperty(p: Prop): void {
  const vector = Array.isArray(p.value), value = (v: unknown) => vector ? Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9) : typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e9;
  const side = (s: Side) => ['linear', 'bezier', 'hold'].includes(s.interp) && Number.isFinite(s.slope) && Math.abs(s.slope) <= 1000 && Number.isFinite(s.influence) && s.influence >= .01 && s.influence <= 1;
  let previous = -Infinity;
  if (!value(p.value) || p.keys.length > 100000) throw new Error('Unsupported property values or key count.');
  for (const k of p.keys) {
    if (!Number.isInteger(k.f) || Math.abs(k.f) > 1e6 || k.f <= previous || !value(k.v) || !side(k.in) || !side(k.out) || k.spatial && (!vector || !value(k.spatial.in) || !value(k.spatial.out))) throw new Error('Use finite values and unique, ordered keyframes.'); previous = k.f;
  }
}
export function straightPath(p: Prop<Vec2>): Prop<Vec2> { return { ...p, keys: p.keys.map(k => { const out: Key<Vec2> = { ...k }; delete out.spatial; return out; }) }; }
