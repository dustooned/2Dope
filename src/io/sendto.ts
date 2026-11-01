/**
 * Send to project: copy a layer (with its linked art layers, every frame) or an asset into another
 * project in the library, without opening it. The copy lands at the start of that project's
 * animation, or in its asset library. The open project is not changed. When the two projects'
 * pages differ in size, the pixels are scaled to fit and centred, and vector lines, positions and
 * anchors follow the same scale and offset.
 */

import { artworkGraph, copyArtworkGraph, snapshotArtwork } from '../core/assetcopy';
import { compLayer, newComp, type Comp, type DrawingsLayer, type Layer } from '../core/comp';
import type { Prop, Vec2 } from '../core/anim';
import { planeCanvas, type Drawing, type Parked, type Project } from '../core/project';
import type { Residency } from '../core/residency';
import type { StrokeRecord } from '../core/stroke';
import { encodePng, isBlank } from './codec';
import { assetsOf, metaFromFile, type Store } from './persist';
import { captureProject, loadProjectFile } from './projectio';
import { MAX_COMPS, MAX_DRAWINGS, MAX_VECTORS, parseProjectFile, stringifyProjectFile } from './schema';

export type SendWhere = 'start' | 'library';
export type SendItem = { kind: 'layer'; layers: string[] } | { kind: 'asset'; comp: string };

/** How a page of `w`×`h` fits a page of `W`×`H`: scaled to fit, centred. */
export interface Fit { s: number; ox: number; oy: number }
export function fitPage(w: number, h: number, W: number, H: number): Fit {
  const s = Math.min(W / w, H / h);
  return { s, ox: (W - w * s) / 2, oy: (H - h * s) / 2 };
}
const same = (f: Fit) => f.s === 1 && f.ox === 0 && f.oy === 0;

/** A vector line moved onto the new page (points, editable anchors and handles, clip matrices, brush size). */
export function fitStroke(r: StrokeRecord, f: Fit): StrokeRecord {
  if (same(f)) return r;
  const c = structuredClone(r);
  for (const p of c.points) { p.x = p.x * f.s + f.ox; p.y = p.y * f.s + f.oy; }
  c.brush.size *= f.s;
  if (c.sym) { c.sym.cx = c.sym.cx * f.s + f.ox; c.sym.cy = c.sym.cy * f.s + f.oy; }
  if (c.controls) {
    for (let i = 0; i + 1 < c.controls.anchors.length; i += 2) {
      c.controls.anchors[i] = c.controls.anchors[i]! * f.s + f.ox;
      c.controls.anchors[i + 1] = c.controls.anchors[i + 1]! * f.s + f.oy;
    }
    for (const h of Object.values(c.controls.handles)) { h.inx *= f.s; h.iny *= f.s; h.outx *= f.s; h.outy *= f.s; }
  }
  // a clip's matrix maps into page space: the page transform goes in front of it
  for (const clip of c.clips ?? []) {
    const [a, b, cc, d, e, g] = clip.matrix;
    clip.matrix = [a * f.s, b * f.s, cc * f.s, d * f.s, e * f.s + f.ox, g * f.s + f.oy];
  }
  return c;
}

/** A point property (position, anchor) moved onto the new page. */
function fitPoint(p: Prop<Vec2>, f: Fit): Prop<Vec2> {
  const m = (v: Vec2): Vec2 => [v[0] * f.s + f.ox, v[1] * f.s + f.oy];
  return { value: m(p.value), keys: p.keys.map((k) => ({ ...k, v: m(k.v) })) };
}

/** A comp and its layers moved onto the new page (comp size, positions, anchors, part offsets). */
export function fitComp(c: Comp, f: Fit, W: number, H: number): void {
  c.width = W; c.height = H;
  if (same(f)) return;
  for (const l of c.layers) {
    l.transform.position = fitPoint(l.transform.position, f);
    l.transform.anchor = fitPoint(l.transform.anchor, f);
    if (l.kind === 'drawings') for (const part of Object.values(l.parts ?? {})) {
      if (!part?.offset) continue;
      const sc = (v: Vec2): Vec2 => [v[0] * f.s, v[1] * f.s];
      part.offset = { value: sc(part.offset.value), keys: part.offset.keys.map((k) => ({ ...k, v: sc(k.v) })) };
    }
  }
}

/** The pixels of a drawing on the new page (PNG bytes; the same bytes or stored keys when nothing moves). */
async function fitDrawing(d: Drawing, f: Fit, W: number, H: number, residency: Pick<Residency, 'pin' | 'unpin'>): Promise<Parked> {
  if (same(f)) return snapshotArtwork(d, residency);
  await residency.pin(d);
  try {
    const plane = async (src: HTMLCanvasElement | null) => {
      if (!src || isBlank(src)) return null;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, f.ox, f.oy, src.width * f.s, src.height * f.s);
      return { key: null, bytes: await encodePng(c) };
    };
    return { rev: 0, line: await plane(d.line), fill: await plane(d.fill ? planeCanvas(d, 'fill') : null) };
  } finally {
    residency.unpin(d);
  }
}

export interface SendResult { name: string; target: string; scaled: boolean }

/**
 * Copy `item` from the open project `src` into the stored project `targetId`, at `where`, and save
 * that project. `residency` reads the source pixels. Throws a plain-words error when the target
 * would go over a project limit or cannot be read.
 */
export async function sendToProject(src: Project, item: SendItem, store: Store, targetId: string, where: SendWhere,
  residency: Pick<Residency, 'pin' | 'unpin'>): Promise<SendResult> {
  // what goes: an asset's whole source graph, or the layer stack in a stand-in comp
  let graph: Comp[], root: string, name: string;
  if (item.kind === 'asset') {
    const c = src.comps.get(item.comp);
    if (!c?.asset) throw new Error('Choose an asset to send.');
    graph = artworkGraph(src, item.comp, false); root = item.comp; name = c.name;
  } else {
    const from = src.comp, ids = new Set(item.layers);
    const layers = from.layers.filter((l): l is DrawingsLayer => ids.has(l.id) && l.kind === 'drawings');
    if (!layers.length) throw new Error('Choose a drawing layer to send.');
    const stand = newComp('__send', layers[0]!.name, from.width, from.height, from.fps);
    stand.layers = layers.map((l) => ({ ...structuredClone(l), parent: null }) as Layer);
    graph = [stand]; root = stand.id; name = layers[0]!.name;
  }
  const drawingIds = new Set<string>();
  for (const c of graph) for (const l of c.layers) if (l.kind === 'drawings') {
    for (const e of l.exposures) drawingIds.add(e.drawing);
    if (l.mask) drawingIds.add(l.mask);
  }

  // the target, loaded from the library (not opened)
  const meta = await store.getProject(targetId), head = await store.getHead(targetId);
  if (!meta || !head) throw new Error('That project is not in the library any more.');
  const target = loadProjectFile(parseProjectFile(head.json)).project;
  const main = target.comps.get(target.main) ?? target.comp;
  const used = [...target.usedDrawings()];
  if (target.comps.size + graph.length > MAX_COMPS) throw new Error(`“${meta.name}” has too many comps to take this.`);
  if (used.length + drawingIds.size > MAX_DRAWINGS) throw new Error(`“${meta.name}” has too many drawings to take this.`);
  const vectors = used.reduce((n, id) => n + target.drawing(id).vectors.length, 0) + [...drawingIds].reduce((n, id) => n + src.drawing(id).vectors.length, 0);
  if (vectors > MAX_VECTORS) throw new Error(`“${meta.name}” has too many vector lines to take this.`);

  // drawings: same bytes (or stored keys) when the pages match, else scaled to fit and centred
  const f = fitPage(src.width, src.height, target.width, target.height);
  const drawings = new Map<string, string>();
  for (const id of drawingIds) {
    const d = src.drawing(id);
    const parked = await fitDrawing(d, f, target.width, target.height, residency);
    drawings.set(id, target.cloneStoredDrawing({ vectors: d.vectors.map((v) => fitStroke(v, f)), role: d.role }, parked).id);
  }
  const copy = copyArtworkGraph(target, graph, root, drawings, compLayer('send', '', graph.find((c) => c.id === root)!, main), true);
  for (const c of copy.comps) { c.folder = null; c.asset = false; fitComp(c, f, target.width, target.height); }
  // sounds of an asset come along (they live in this device's store under their own paths)
  const sounds = new Map<string, string>();
  let next = 1;
  for (const c of copy.comps) for (const clip of c.audio ?? []) {
    if (!sounds.has(clip.asset)) {
      let fresh: string; do { fresh = `sound${next++}`; } while (target.sounds.has(fresh));
      const sound = src.sounds.get(clip.asset);
      if (!sound) throw new Error('A sound in this asset is missing.');
      target.sounds.set(fresh, { ...sound }); sounds.set(clip.asset, fresh);
    }
    clip.asset = sounds.get(clip.asset)!;
  }
  const rootComp = copy.comps.find((c) => c.id === copy.root)!;
  if (item.kind === 'layer' && where === 'start') {
    // the layers themselves, on top, from frame 1 (no wrapper comp)
    const layers = rootComp.layers.map((l) => ({ ...l, start: 0, in: 0 }) as Layer);
    main.layers.unshift(...layers);
  } else {
    rootComp.asset = true;
    rootComp.name = name.slice(0, 80);
    for (const c of copy.comps) target.comps.set(c.id, c);
    if (where === 'start') {
      // placed at frame 1 the way Place does it: held or looping on the shot clock, locked
      const ids = new Set(main.layers.map((l) => l.id));
      let n = 1; while (ids.has(`L${n}`)) n++;
      const l = compLayer(`L${n}`, rootComp.name, rootComp, main);
      l.play = 'loop'; l.locked = true;
      main.layers.unshift(l);
    }
  }

  // save the target straight away (its existing pictures keep their stored keys)
  const settled = await captureProject(target).settle();
  const now = Date.now();
  await store.saveHead(metaFromFile(targetId, settled.file, { ...meta, modified: now }), { id: targetId, json: stringifyProjectFile(settled.file), savedAt: now }, settled.assets, [...assetsOf(settled.file)]);
  return { name, target: meta.name, scaled: !same(f) };
}
