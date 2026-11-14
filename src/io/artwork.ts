import { artworkGraph } from '../core/assetcopy';
import { Project, planeCanvas } from '../core/project';
import { packPlacement } from './packimport';
import { transformVector } from '../core/vectorstyle';
import type { AssetSource } from '../core/residency';
import { assetsOf } from './persist';
import { captureProject } from './projectio';
import { minimumDrawingSchema, parseProjectFile, stringifyProjectFile, validateProjectFile, type ProjectFile } from './schema';
import { readZip, writeZip } from './zip';
import type { ArtworkEntry } from './artworkstore';

/** A portable source snapshot. It is a normal standalone .2dope project, rooted at the artwork. */
export interface ArtworkPackage { file: ProjectFile; assets: Map<string, Uint8Array> }

export function captureArtwork(project: Project, root: string, source: AssetSource): Promise<ArtworkPackage> {
  if (!project.comps.get(root)?.asset) throw new Error('Choose an artwork source to save.');
  const graph = artworkGraph(project, root, false);
  const snapshot = new Project(project.width, project.height, false);
  snapshot.main = snapshot.activeComp = root;
  snapshot.name = project.comps.get(root)!.name;
  snapshot.created = project.created;
  const drawings = new Set<string>();
  for (const c of graph) {
    const copy = structuredClone(c); copy.folder = null;
    snapshot.comps.set(c.id, copy);
    for (const l of c.layers) if (l.kind === 'drawings') {
      for (const e of l.exposures) drawings.add(e.drawing);
      if (l.mask) drawings.add(l.mask);
    }
    for (const clip of c.audio ?? []) {
      const sound = project.sounds.get(clip.asset);
      if (!sound) throw new Error('An artwork sound is missing.');
      snapshot.sounds.set(clip.asset, sound);
    }
  }
  for (const id of drawings) {
    const drawing = project.drawings.get(id);
    if (!drawing) throw new Error('An artwork drawing is missing.');
    for (const ref of [drawing.parked?.line, drawing.parked?.fill])
      if (ref && !ref.key && !ref.bytes) throw new Error('An artwork image is missing.');
    snapshot.drawings.set(id, drawing);
  }
  // Capture synchronously before the first await, just like project autosave.
  const pending = captureProject(snapshot, { mode: 'archive', source: async key => {
    const bytes = await source(key);
    if (!bytes) throw new Error('An artwork image or sound is missing. The asset was not saved.');
    return bytes;
  } });
  return pending.settle().then(({ file, assets }) => {
    const clean = validateProjectFile(file);
    clean.schema = file.schema; // validation normalizes; keep the capture's minimum reader version
    requireAssets(clean, assets);
    return { file: clean, assets };
  });
}

function requireAssets(file: ProjectFile, assets: Map<string, Uint8Array>): void {
  for (const path of assetsOf(file)) if (!assets.get(path)?.length)
    throw new Error('This artwork is missing an image or sound. Use a complete .2dope file.');
}

export function packArtwork(bundle: ArtworkPackage): Uint8Array {
  const file = validateProjectFile(bundle.file);
  file.schema = minimumDrawingSchema(file.drawings, file.comps);
  if (!file.comps[file.main]?.asset) throw new Error('This file does not contain a saved artwork source.');
  requireAssets(file, bundle.assets);
  return writeZip([{ name: 'project.json', data: new TextEncoder().encode(stringifyProjectFile(file)) },
    ...[...assetsOf(file)].map(name => ({ name, data: bundle.assets.get(name)! }))]);
}

export async function readArtwork(bytes: Uint8Array): Promise<ArtworkPackage> {
  const entries = await readZip(bytes), json = entries.get('project.json');
  if (!json) throw new Error('This file has no artwork project.');
  const file = parseProjectFile(new TextDecoder().decode(json));
  if (!file.comps[file.main]?.asset) throw new Error('Choose a .2dope artwork saved from My Assets.');
  requireAssets(file, entries);
  return { file, assets: new Map([...assetsOf(file)].map(path => [path, entries.get(path)!])) };
}

/** A decoded picture and its pixel size (an ImageBitmap's, or an <img>'s natural size). */
type Bitmap = { source: CanvasImageSource; width: number; height: number };

/**
 * One picture as a one-frame drawing source on a transparent canvas the size of the open project,
 * so My Assets can add it as a copy. The picture is centred at native pixels and only scaled down
 * to fit. It sits on the Colour plane, as + Media puts pictures.
 */
export async function artworkFromImage(name: string, bitmap: Bitmap, canvasW: number, canvasH: number): Promise<ArtworkPackage> {
  const p = new Project(canvasW, canvasH), comp = p.comp, layer = comp.layers[0]!;
  comp.asset = true; comp.name = name; layer.name = name; p.name = name; p.main = p.activeComp = comp.id;
  if (layer.kind !== 'drawings') throw new Error('A new artwork has no drawing layer.');
  const d = p.drawing(layer.exposures[0]!.drawing), fill = planeCanvas(d, 'fill');
  const at = packPlacement(bitmap.width, bitmap.height, canvasW, canvasH);
  const g = fill.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(bitmap.source, at.x, at.y, at.w, at.h);
  d.rev++;
  try { return await captureArtwork(p, comp.id, async () => null); }
  finally { d.line.width = d.line.height = 0; fill.width = fill.height = 0; }
}

/** A PNG preview of the picture itself, longest side at most 320 px. */
export async function imageThumb(bitmap: Bitmap): Promise<Uint8Array> {
  const k = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bitmap.width * k)); c.height = Math.max(1, Math.round(bitmap.height * k));
  c.getContext('2d')!.drawImage(bitmap.source, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png')); c.width = c.height = 0;
  if (!blob) throw new Error('Could not make a preview.');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Why this artwork cannot be centred on another canvas size, or null when it can. Only drawing and
 * nested-artwork layers that sit directly in comps of the artwork's own size are moved; captions,
 * titles, movies, cameras, nulls and parenting keep their own coordinates, so those stay refused.
 */
export function resizeBlocked(file: ProjectFile): string | null {
  const { width, height } = file.canvas;
  for (const c of Object.values(file.comps)) {
    if (c.width !== width || c.height !== height) return 'it holds a composition of another size';
    for (const l of c.layers) {
      if (l.kind !== 'drawings' && l.kind !== 'comp') return `it has a ${l.kind} layer`;
      if (l.parent) return 'it has parented layers';
      if (l.kind === 'drawings' && (l.caption || l.title || l.video)) return 'it has a caption, title or movie layer';
    }
  }
  return null;
}

/**
 * The same artwork on a canvas of another size: every drawing is moved so the art keeps its pixel
 * size and sits centred, and every layer's anchor and position (keys too) move with it, so it
 * looks the same, centred. Throws when `resizeBlocked` says it cannot.
 */
export async function resizeArtwork(bundle: ArtworkPackage, width: number, height: number): Promise<ArtworkPackage> {
  const file = structuredClone(bundle.file), from = file.canvas;
  if (from.width === width && from.height === height) return bundle;
  const blocked = resizeBlocked(file);
  if (blocked) throw new Error(`This artwork uses a ${from.width}×${from.height} canvas and ${blocked}. Open it as a project to keep its original size.`);
  const dx = Math.round((width - from.width) / 2), dy = Math.round((height - from.height) / 2);
  const shift = (prop: { value: unknown; keys?: { v: unknown }[] } | undefined) => {
    if (!prop) return;
    const move = (v: unknown) => Array.isArray(v) && v.length === 2 ? [Number(v[0]) + dx, Number(v[1]) + dy] : v;
    prop.value = move(prop.value); for (const k of prop.keys ?? []) k.v = move(k.v);
  };
  for (const c of Object.values(file.comps)) {
    c.width = width; c.height = height;
    for (const l of c.layers) {
      shift(l.transform.anchor); shift(l.transform.position);
      if (l.kind === 'comp') for (const [key, prop] of Object.entries(l.overrides ?? {})) if (/:(position|anchor)$/.test(key)) shift(prop);
    }
  }
  const assets = new Map(bundle.assets), moved = new Map<string, string>();
  const canvas = document.createElement('canvas');
  try {
    for (const d of Object.values(file.drawings)) {
      for (const plane of ['line', 'fill'] as const) {
        const path = d[plane];
        if (!path) continue;
        if (!moved.has(path)) {
          const bytes = bundle.assets.get(path);
          if (!bytes?.length) throw new Error('An artwork image is missing.');
          const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
          canvas.width = width; canvas.height = height;
          const g = canvas.getContext('2d')!; g.clearRect(0, 0, width, height); g.drawImage(bitmap, dx, dy); bitmap.close();
          const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
          if (!blob) throw new Error('Could not resize the artwork.');
          const next = `${path.replace(/\.png$/i, '')}-${width}x${height}.png`;
          assets.set(next, new Uint8Array(await blob.arrayBuffer())); moved.set(path, next);
        }
        d[plane] = moved.get(path)!;
      }
      d.vectors = d.vectors.map(v => transformVector(v, [1, 0, 0, 1, dx, dy]));
    }
  } finally { canvas.width = canvas.height = 0; }
  file.canvas = { width, height };
  return { file, assets };
}

/** Library labels also name new copies, opened projects and portable downloads. */
export async function libraryArtwork(entry: ArtworkEntry): Promise<ArtworkPackage> {
  const bundle = await readArtwork(entry.archive);
  bundle.file.name = entry.card.name;
  bundle.file.comps[bundle.file.main]!.name = entry.card.name;
  return bundle;
}
