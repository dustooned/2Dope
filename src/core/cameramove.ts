import { easingSides, valueAt, type Easing, type Prop, type Value, type Vec2 } from './anim';
import { cameraLayer, compLength, layerEnd, type CameraLayer, type Comp } from './comp';

export interface CameraMove {
  kind: 'push' | 'pull' | 'pan'; start: number; end: number; strength: number;
  direction: 'left' | 'right' | 'up' | 'down'; ease: Exclude<Easing, 'hold'>; replace: boolean;
}
/** Ordinary concrete camera keys. The caller commits creation and keys in one command. */
export function cameraMove(comp: Comp, comps: ReadonlyMap<string, Comp>, target: CameraLayer | null, options: CameraMove, id: string): CameraLayer {
  const { start, end, strength } = options;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end >= compLength(comp, comps)) throw new Error('Choose two different frames inside the shot.');
  if (!Number.isFinite(strength) || strength < 0 || strength > 30) throw new Error('Strength must be 0–30%.');
  if (!['push', 'pull', 'pan'].includes(options.kind) || !['left', 'right', 'up', 'down'].includes(options.direction) || !['linear', 'easeIn', 'easeOut', 'easeInOut'].includes(options.ease)) throw new Error('Unsupported camera move.');
  const camera = target ? structuredClone(target) : cameraLayer(id, comp);
  if (camera.locked) throw new Error('Unlock this camera before applying a move.');
  if (!camera.visible || start < camera.in || end >= layerEnd(camera, comps, comp.fps) || start < camera.start) throw new Error('Keep the move inside a visible camera layer.');
  const first = start - camera.start, last = end - camera.start, prop = options.kind === 'pan' ? camera.transform.position : camera.zoom;
  if (!options.replace && prop.keys.some(k => k.f >= first && k.f <= last)) throw new Error('This range has keys. Enable Replace keys in this range to continue.');
  const value = valueAt(prop as Prop, first);
  let to: Value;
  if (options.kind === 'pan') {
    const p = value as Vec2, d = options.direction;
    to = [p[0] + (d === 'left' ? -1 : d === 'right' ? 1 : 0) * comp.width * strength / 100, p[1] + (d === 'up' ? -1 : d === 'down' ? 1 : 0) * comp.height * strength / 100];
  } else {
    const zoom = Number(value); if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Camera zoom must be above zero.');
    to = options.kind === 'push' ? zoom * (1 + strength / 100) : zoom / (1 + strength / 100);
  }
  for (const n of Array.isArray(to) ? to : [to]) if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new Error('This move exceeds the supported camera range.');
  const sides = easingSides(options.ease), key = (f: number, v: Value) => ({ f, v, in: sides.in, out: sides.out });
  const next = { value: prop.value, keys: [...prop.keys.filter(k => k.f < first || k.f > last), key(first, value), key(last, to)].sort((a, b) => a.f - b.f) };
  if (options.kind === 'pan') camera.transform.position = next as Prop<Vec2>; else camera.zoom = next as Prop<number>;
  return camera;
}
