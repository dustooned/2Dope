import { blenderHandles, staticProp, type Prop, type Value, type Vec2 } from '../core/anim';
import { activeEffects } from '../core/effects';
import { compLength, exportComp, layerEnd, drawingOf, frameContent, instanceComp, nestedFrame, type Comp, type CompLayer, type DrawingsLayer, type Layer, partsActive, skippedInExport } from '../core/comp';

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
  /** The layer's page size in pixels (drawings, instance, baked), or 0×0; a trimmed drawings layer: its images' size. */
  size: [number, number];
  /** drawings: where its images start on the page (the art's top-left when trimmed); absent = [0, 0]. */
  offset?: [number, number];
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
  /**
   * The storyboard, for 3D: one marker per panel at its first frame (frames from 0), with its shot,
   * camera and captions and the panel's picture. Optional (older packages have none).
   */
  board?: BoardMarker[];
}

export interface BoardMarker {
  /** Panel number, from 1. */
  n: number;
  frame: number;
  length: number;
  shot?: string;
  camera?: string;
  dialogue?: string;
  action?: string;
  slug?: string;
  note?: string;
  /** The panel's picture (an image id). */
  image?: string;
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

/** A clipping mask with a layer to clip to? (As the compositor: drawings only, never a guide.) */
const clips = (l: Layer): boolean => l.kind === 'drawings' && l.clip === true && !l.guide;

/**
 * A comp that draws only `l`, as it looks in the comp, on the comp's page: the layer it clips to
 * stays in at opacity 0 (its paint is the clip), parents stay for the transforms, everything
 * else is hidden; no camera (Blender has its own).
 */
export function clipComp(c: Comp, l: Layer): Comp {
  const at = c.layers.indexOf(l);
  let base = at + 1;
  while (base < c.layers.length && clips(c.layers[base]!)) base++;
  const layers = c.layers.filter((x) => x.kind !== 'camera').map((x): Layer => {
    if (x === l) return { ...x, blend: 'normal', transform: { ...x.transform, opacity: staticProp(100) } } as Layer;
    if (x === c.layers[base]) return { ...x, transform: { ...x.transform, opacity: staticProp(0) } } as Layer;
    return { ...x, visible: false } as Layer;
  });
  return { ...c, id: `${c.id}~${l.id}`, background: null, layers };
}

/**
 * A page-sized comp that draws only `l` with no transform (position on its anchor, no scale or
 * turn, full opacity, normal blend): its pictures with mask, effects and part settings, in the
 * layer's own pixels.
 */
export function soloComp(c: Comp, l: DrawingsLayer, anchor: Vec2, width: number, height: number): Comp {
  const layer: DrawingsLayer = { ...l, parent: null, blend: 'normal', transform: { anchor: staticProp<Vec2>([anchor[0], anchor[1]]), position: staticProp<Vec2>([anchor[0], anchor[1]]), scale: staticProp<Vec2>([100, 100]), rotation: staticProp(0), opacity: staticProp(100) } };
  return { ...c, id: `${c.id}~${l.id}`, width, height, background: null, layers: [layer] };
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
 * which images are needed, and which precomp frames 2Dope has to render. The scene is the
 * timeline every export renders (`exportComp`): the shot, or an asset opened on its own.
 */
export function planBlender(project: { name: string; main: string; activeComp?: string; width: number; height: number; comps: ReadonlyMap<string, Comp> }, savedBy: string): BlenderPlan {
  const comps = project.comps;
  const main = exportComp(project);
  if (!main) throw new Error('the project has no main comp');
  const scene: BlenderScene = { format: BLENDER_FORMAT, version: BLENDER_VERSION, savedBy, name: project.name, main: main.id, pixelsPerUnit: 100, comps: {}, images: {} };
  const drawings = new Set<string>();
  /** Drawings saved as images (a layer or a storyboard marker shows them); the rest only feed rendered frames. */
  const pictured = new Set<string>();
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
      const ch = {
        ...channels(t.position, ['position.x', 'position.y'], l.start),
        ...channels(t.scale, ['scale.x', 'scale.y'], l.start),
        ...channels(t.rotation, ['rotation'], l.start),
        ...channels(t.opacity, ['opacity'], l.start),
      };
      const end = layerEnd(l, comps, c.fps);
      const base: BlenderLayer = {
        id: l.id,
        name: l.name,
        kind: 'null',
        parent: l.parent,
        visible: l.visible,
        in: l.in,
        // where it really stops in 2Dope (a "once" layer ends with its content)
        out: Number.isFinite(end) ? end : null,
        blend: l.blend,
        anchor: [anchorValue[0], anchorValue[1]],
        size: [0, 0],
        channels: ch,
      };
      if (l.kind === 'null') bc.layers.push(base);
      else if (l.kind === 'camera') {
        if (id === main.id) bc.layers.push({ ...base, kind: 'camera', channels: { ...ch, ...channels(l.zoom, ['zoom'], l.start) } });
        // cameras inside precomps only matter in 2Dope (the shot's camera frames Blender's render)
      } else if (l.kind === 'drawings' && l.adjust) {
        notes.add(`“${l.name}” is an adjustment layer: its effects change everything below it, so it stays in 2Dope (Blender gets the layers without them).`);
      } else if (l.kind === 'drawings' && (clips(l) || l.mask || activeEffects(l).length > 0 || partsActive(l))) {
        // what Blender cannot do with an image plane: 2Dope renders the layer as it draws it.
        // Clipped: in the comp's space (it depends on the layer below); otherwise on its own page
        // with no transform, so the plane keeps the layer's moves
        const clipped = clips(l);
        const solo = clipped ? clipComp(c, l) : soloComp(c, l, anchorValue, project.width, project.height);
        const keys = new Map<string, string>();
        const per: (string | null)[] = [];
        for (let f = 0; f < length; f++) {
          const fc = frameContent(comps, solo, f);
          if (!fc.drawings.size) {
            per.push(null);
            continue;
          }
          let image = keys.get(fc.key);
          if (!image) {
            image = `r:${id}:${l.id}:${keys.size + 1}`;
            keys.set(fc.key, image);
            renders.push({ image, comp: solo, frame: f });
            for (const d of fc.drawings) drawings.add(d);
          }
          per.push(image);
        }
        if (clipped) {
          const centre = staticProp<Vec2>([c.width / 2, c.height / 2]);
          bc.layers.push({ ...base, kind: 'drawings', parent: null, anchor: [c.width / 2, c.height / 2], size: [c.width, c.height], channels: { ...channels(centre, ['position.x', 'position.y'], 0), ...channels(t.opacity, ['opacity'], l.start) }, frames: runs(per) });
          notes.add(`“${l.name}” is clipped to the layer below, so Blender gets it as rendered frames with its moves in them.`);
        } else {
          bc.layers.push({ ...base, kind: 'drawings', size: [project.width, project.height], frames: runs(per) });
          const what = [l.mask ? 'mask' : '', activeEffects(l).length ? 'effects' : '', partsActive(l) ? 'Ink / Colour settings' : ''].filter(Boolean);
          notes.add(`“${l.name}”: its ${what.join(' and ')} ${what.length === 1 && l.mask ? 'is' : 'are'} rendered into its pictures (still moving as a plane in Blender).`);
        }
      } else if (l.kind === 'drawings') {
        const per: (string | null)[] = [];
        for (let f = 0; f < length; f++) {
          const d = drawingOf(l, f);
          per.push(d ? `d:${d}` : null);
          if (d) {
            drawings.add(d);
            pictured.add(d);
          }
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
  // the storyboard goes along as markers (the board layer itself stays in 2Dope)
  const board = main.layers.find((l): l is Extract<typeof l, { kind: 'drawings' }> => l.kind === 'drawings' && !!l.guide);
  if (board?.exposures.length) {
    let at = board.start;
    scene.board = board.exposures.map((e, i) => {
      const m: BoardMarker = { n: i + 1, frame: at, length: e.length, image: `d:${e.drawing}` };
      for (const k of ['shot', 'camera', 'dialogue', 'action', 'slug', 'note'] as const) if (e[k]) m[k] = e[k];
      drawings.add(e.drawing);
      pictured.add(e.drawing);
      at += e.length;
      return m;
    });
    notes.add('The storyboard comes along as timeline markers (one per panel, named with its shot and camera) and a \u201c2Dope storyboard\u201d text with every caption.');
  }
  for (const d of pictured) scene.images[`d:${d}`] = `drawings/${d}.png`;
  for (const r of renders) {
    const [, comp, layer, n] = r.image.split(':');
    scene.images[r.image] = `renders/${comp}_${layer}/${String(n).padStart(4, '0')}.png`;
  }
  return { scene, drawings, renders, notes: [...notes] };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One plane PNG to write: `rect` of the source image (`d:` a drawing, `r:` a rendered frame), saved as `scene.images[key]`. */
export interface PlaneImage {
  key: string;
  source: string;
  rect: Rect;
}

/**
 * Size each drawings layer's plane to its art: the union of the painted bounds of every image the
 * layer shows (drawings, or its rendered frames), plus `pad` pixels so edges filter cleanly,
 * instead of its whole page (`size`). The plane keeps its place through `offset`; anchors are
 * untouched (children are placed from them). With `trim` off every image is the whole page. An
 * image two layers cut differently (or a storyboard marker, always the whole page) gets one file
 * per cut. Rewrites those layers' and markers' images and returns what to write. `bounds`: an
 * image's painted rect by key, null when empty or missing.
 */
export function trimScene(scene: BlenderScene, bounds: ReadonlyMap<string, Rect | null>, page: [number, number], trim: boolean, pad = 2): PlaneImage[] {
  // the files these images had: each cut is written under the same name, or name_2, name_3...
  const paths = new Map<string, string>();
  const take = (k: string) => {
    if (!paths.has(k)) paths.set(k, scene.images[k] ?? `drawings/${k.slice(2)}.png`);
    delete scene.images[k];
  };
  for (const comp of Object.values(scene.comps)) for (const l of comp.layers) if (l.kind === 'drawings') for (const r of l.frames ?? []) if (r.image) take(r.image);
  for (const m of scene.board ?? []) if (m.image) take(m.image);
  const out: PlaneImage[] = [];
  const byCut = new Map<string, string>();
  const cuts = new Map<string, number>();
  const use = (source: string, rect: Rect): string => {
    const cut = `${source}|${rect.x},${rect.y},${rect.w},${rect.h}`;
    let key = byCut.get(cut);
    if (key) return key;
    const n = cuts.get(source) ?? 0;
    cuts.set(source, n + 1);
    key = n ? `${source}~${n + 1}` : source;
    const path = paths.get(source)!;
    scene.images[key] = n ? path.replace(/\.png$/, `_${n + 1}.png`) : path;
    byCut.set(cut, key);
    out.push({ key, source, rect });
    return key;
  };
  for (const comp of Object.values(scene.comps)) {
    for (const l of comp.layers) {
      if (l.kind !== 'drawings' || !l.frames) continue;
      const [pw, ph] = l.size;
      let rect: Rect = { x: 0, y: 0, w: pw, h: ph };
      if (trim) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const r of l.frames) {
          const b = r.image ? bounds.get(r.image) : null;
          if (!b) continue;
          x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
          x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
        }
        if (x1 <= x0 || y1 <= y0) rect = { x: 0, y: 0, w: 1, h: 1 };
        else {
          const x = Math.max(0, Math.floor(x0) - pad), y = Math.max(0, Math.floor(y0) - pad);
          rect = { x, y, w: Math.min(pw, Math.ceil(x1) + pad) - x, h: Math.min(ph, Math.ceil(y1) + pad) - y };
        }
      }
      l.size = [rect.w, rect.h];
      if (rect.x || rect.y) l.offset = [rect.x, rect.y];
      else delete l.offset;
      for (const r of l.frames) if (r.image) r.image = use(r.image, rect);
    }
  }
  const full: Rect = { x: 0, y: 0, w: page[0], h: page[1] };
  for (const m of scene.board ?? []) if (m.image) m.image = use(m.image, full);
  return out;
}

/** Shorthand used by tests: the layers of a planned comp by id. */
export function plannedLayers(plan: BlenderPlan, comp: string): Record<string, BlenderLayer> {
  return Object.fromEntries((plan.scene.comps[comp]?.layers ?? []).map((l) => [l.id, l]));
}
