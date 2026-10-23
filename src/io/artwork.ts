import { artworkGraph } from '../core/assetcopy';
import { Project } from '../core/project';
import type { AssetSource } from '../core/residency';
import { assetsOf } from './persist';
import { captureProject } from './projectio';
import { parseProjectFile, stringifyProjectFile, validateProjectFile, type ProjectFile } from './schema';
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

/** Library labels also name new copies, opened projects and portable downloads. */
export async function libraryArtwork(entry: ArtworkEntry): Promise<ArtworkPackage> {
  const bundle = await readArtwork(entry.archive);
  bundle.file.name = entry.card.name;
  bundle.file.comps[bundle.file.main]!.name = entry.card.name;
  return bundle;
}
