import { blenderHandles, type Prop, type Value } from '../core/anim';
import { compLength, layerEnd, drawingOf, frameContent, instanceComp, nestedFrame, type Comp, type CompLayer, type Layer, partsActive, skippedInExport } from '../core/comp';

/**
 * The Blender handoff (spec principle 4). 2Dope writes a package: `scene.json` (this file's
 * types) plus PNGs; the add-on in `blender/2dope_import.py` builds the scene from it.
 *
 * Everything here is in 2Dope units (pixels, y down, degrees, percent, frames from 0) and comp
 * time; the add-on converts to Blender (metres, z up, radians, frames from `frameStart`). Keys
 * carry their Bezier handles already, so Blender reproduces the exact easing.
 *
 * Layers become: drawings → an image plane with an image sequence; null → an empty; camera →
 * an orthographic camera; a precomp shown "as is" (same speed, starting with the shot, no
 * per-instance overrides) → a collection instance of its comp, so every instance shares one
 * collection; any other precomp (offset in time, looping, retimed, overridden) → a plane with
 * its frames rendered by 2Dope, because Blender collection instances cannot run on their own clock.
 */

export const BLENDER_FORMAT = '2dope-blender';
export const BLENDER_VERSION = 1;

export type Interp = 'CONSTANT' | 'LINEAR' | 'BEZIER';

export interface ChannelKey {
  /** Comp frame (0-based). */
  frame: number;
  value: number;
  interp: Interp;
  /** Bezier handles as [frame, value]; null at the ends (the add-on flattens them). */
  left: [number, number] | null;
  right: [number, number] | null;
}

export interface Channel {
  value: number;
  keys?: ChannelKey[];
}

export type ChannelName = 'position.x' | 'position.y' | 'scale.x' | 'scale.y' | 'rotation' | 'opacity' | 'zoom';

/** A run of comp frames showing one image (`image: null` = nothing). */
export interface FrameRun {
  from: number;
  to: number;
  image: string | null;
}

export interface BlenderLayer {
  id: string;
  name: string;
  kind: 'drawings' | 'null' | 'camera' | 'instance' | 'baked';
  parent: string | null;
  visible: boolean;
  /** Comp frames the layer is on screen: [in, out); out null = to the end. */
  in: number;
  out: number | null;
  blend: string;
  /** Anchor point in the layer's own pixels (its value at the layer's first frame). */
  anchor: [number, number];
  /** The layer's page size in pixels (drawings, instance, baked), or 0×0. */
  size: [number, number];
  channels: Partial<Record<ChannelName, Channel>>;
  /** drawings / baked: which image shows on each comp frame. */
  frames?: FrameRun[];
  /** instance: the comp it shows. */
  comp?: string;
}

export interface BlenderComp {
  name: string;
  width: number;
  height: number;
  fps: number;
  length: number;
  background: string | null;
  /** Top of the stack first. */
  layers: BlenderLayer[];
}

export interface BlenderScene {
  format: typeof BLENDER_FORMAT;
  version: typeof BLENDER_VERSION;
  savedBy: string;
  name: string;
  main: string;
  /** Suggested pixels per Blender unit (the add-on lets you change it). */
  pixelsPerUnit: number;
  comps: Record<string, BlenderComp>;
  /** Image id → path inside the package. */
  images: Record<string, string>;
}

/** What the exporter must render: a frame of a (precomp instance) comp, saved as an image. */
export interface RenderJob {
  image: string;
  comp: Comp;
  frame: number;
}

export interface BlenderPlan {
  scene: BlenderScene;
  /** Drawing ids whose composite PNG goes to drawings/<id>.png. */
  drawings: Set<string>;
  renders: RenderJob[];
  /** Plain-words notes for the user (things Blender gets in a simplified form). */
  notes: string[];
}

/** Can this precomp layer be a Blender collection instance (it runs on the shot's own clock)? */
export function instanceable(l: CompLayer, parent: Comp, comps: ReadonlyMap<string, Comp>): boolean {
  const n = comps.get(l.comp);
  if (!n) return false;
  return l.start === 0 && l.speed === 1 && l.play === 'once' && !(l.timeRemap?.keys.length ?? 0) && n.fps === parent.fps && !Object.keys(l.overrides ?? {}).length;
}

/** Turn a property into channels in comp time, with Blender Bezier handles per segment. */
export function channels(p: Prop<Value>, names: [ChannelName] | [ChannelName, ChannelName], start: number): Partial<Record<ChannelName, Channel>> {
  const out: Partial<Record<ChannelName, Channel>> = {};
  names.forEach((name, dim) => {
    const pick = (v: Value) => (Array.isArray(v) ? v[dim]! : (v as number));
    const ch: Channel = { value: pick(p.value) };
    if (p.keys.length) {
      ch.keys = p.keys.map((k, i) => {
        const next = p.keys[i + 1];
        const prev = p.keys[i - 1];
        const interp: Interp = k.out.interp === 'hold' ? 'CONSTANT' : k.out.interp === 'bezier' || (next && next.in.interp === 'bezier') ? 'BEZIER' : 'LINEAR';
        let right: [number, number] | null = null;
        let left: [number, number] | null = null;
        if (next) {
          const [r] = blenderHandles({ f: k.f, v: pick(k.v), out: k.out }, { f: next.f, v: pick(next.v), in: next.in });
          right = [r[0] + start, r[1]];
        }
        if (prev) {
          const [, l] = blenderHandles({ f: prev.f, v: pick(prev.v), out: prev.out }, { f: k.f, v: pick(k.v), in: k.in });
          left = [l[0] + start, l[1]];
        }
        return { frame: k.f + start, value: pick(k.v), interp, left, right };
      });
    }
    out[name] = ch;
  });
  return out;
}

/** Collapse a per-frame list into runs. */
export function runs(perFrame: (string | null)[]): FrameRun[] {
  const out: FrameRun[] = [];
  perFrame.forEach((image, f) => {
    const last = out[out.length - 1];
    if (last && last.image === image && last.to === f - 1) last.to = f;
    else out.push({ from: f, to: f, image });
  });
  return out;
}

/**
 * Describe the project for Blender without drawing anything: which comps become collections,
 * which images are needed, and which precomp frames 2Dope has to render.
 */
export function planBlender(project: { name: string; main: string; width: number; height: number; comps: ReadonlyMap<string, Comp> }, savedBy: string): BlenderPlan {
  const comps = project.comps;
  const main = comps.get(project.main);
  if (!main) throw new Error('the project has no main comp');
  const scene: BlenderScene = { format: BLENDER_FORMAT, version: BLENDER_VERSION, savedBy, name: project.name, main: main.id, pixelsPerUnit: 100, comps: {}, images: {} };
  const drawings = new Set<string>();
  const renders: RenderJob[] = [];
  const notes = new Set<string>();
  const todo = [main.id];
  const done = new Set<string>();

  while (todo.length) {
    const id = todo.shift()!;
    if (done.has(id)) continue;
    done.add(id);
    const c = comps.get(id);
    if (!c) continue;
    const length = compLength(c, comps);
    const bc: BlenderComp = { name: c.name, width: c.width, height: c.height, fps: c.fps, length, background: c.background, layers: [] };
    for (const l of c.layers) {
      if (skippedInExport(l)) continue; // the storyboard / guides stay in 2Dope
      const t = l.transform;
      const anchorValue = t.anchor.keys.length ? t.anchor.keys[0]!.v : t.anchor.value;
      if (t.anchor.keys.length > 1) notes.add(`“${l.name}”: an animated anchor point is exported as its first value.`);
      if (l.blend !== 'normal') notes.add(`“${l.name}”: the ${l.blend} blend mode is exported as normal.`);
      if (l.kind === 'drawings' && partsActive(l)) notes.add(`“${l.name}”: Line / Fill part settings (hide, fade, recolour, offset) are not in Blender yet; it gets the drawings as drawn.`);
      const ch = {
        ...channels(t.position, ['position.x', 'position.y'], l.start),
        ...channels(t.scale, ['scale.x', 'scale.y'], l.start),
        ...channels(t.rotation, ['rotation'], l.start),
        ...channels(t.opacity, ['opacity'], l.start),
      };
      const base: BlenderLayer = {
        id: l.id,
        name: l.name,
        kind: 'null',
        parent: l.parent,
        visible: l.visible,
        in: l.in,
        // where it really stops in 2Dope (a "once" layer ends with its content)
        out: Number.isFinite(layerEnd(l, comps, c.fps)) ? layerEnd(l, comps, c.fps) : null,
        blend: l.blend,
        anchor: [anchorValue[0], anchorValue[1]],
        size: [0, 0],
        channels: ch,
      };
      if (l.kind === 'null') bc.layers.push(base);
      else if (l.kind === 'camera') {
        if (id === main.id) bc.layers.push({ ...base, kind: 'camera', channels: { ...ch, ...channels(l.zoom, ['zoom'], l.start) } });
        // cameras inside precomps only matter in 2Dope (the shot's camera frames Blender's render)
      } else if (l.kind === 'drawings') {
        const per: (string | null)[] = [];
        for (let f = 0; f < length; f++) {
          const d = drawingOf(l, f);
          per.push(d ? `d:${d}` : null);
          if (d) drawings.add(d);
        }
        bc.layers.push({ ...base, kind: 'drawings', size: [project.width, project.height], frames: runs(per) });
      } else {
        const n = comps.get(l.comp);
        if (!n) continue;
        if (instanceable(l, c, comps)) {
          bc.layers.push({ ...base, kind: 'instance', size: [n.width, n.height], comp: n.id });
          todo.push(n.id);
        } else {
          // render this instance's frames in 2Dope; identical frames share one image
          const shown = instanceComp(n, l);
          const keys = new Map<string, string>();
          const per: (string | null)[] = [];
          for (let f = 0; f < length; f++) {
            const nf = nestedFrame(l, f, c.fps, n, comps);
            if (nf === null) {
              per.push(null);
              continue;
            }
            const fc = frameContent(comps, shown, nf);
            let image = keys.get(fc.key);
            if (!image) {
              image = `r:${id}:${l.id}:${keys.size + 1}`;
              keys.set(fc.key, image);
              renders.push({ image, comp: shown, frame: nf });
              for (const d of fc.drawings) drawings.add(d);
            }
            per.push(image);
          }
          bc.layers.push({ ...base, kind: 'baked', size: [n.width, n.height], frames: runs(per) });
          notes.add(`“${l.name}” is offset, retimed, looping or customised, so Blender gets it as rendered frames (a collection instance cannot run on its own clock).`);
        }
      }
    }
    scene.comps[id] = bc;
  }
  for (const d of drawings) scene.images[`d:${d}`] = `drawings/${d}.png`;
  for (const r of renders) {
    const [, comp, layer, n] = r.image.split(':');
    scene.images[r.image] = `renders/${comp}_${layer}/${String(n).padStart(4, '0')}.png`;
  }
  return { scene, drawings, renders, notes: [...notes] };
}

/** Shorthand used by tests: the layers of a planned comp by id. */
export function plannedLayers(plan: BlenderPlan, comp: string): Record<string, BlenderLayer> {
  return Object.fromEntries((plan.scene.comps[comp]?.layers ?? []).map((l) => [l.id, l]));
}

export type { Layer };
