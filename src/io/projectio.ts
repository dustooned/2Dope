import { Project, type Drawing, type PlaneRef } from '../core/project';
import { recordSaved, type AssetSource } from '../core/residency';
import { encodePng, isBlank } from './codec';
import { hashBytes } from './hash';
import { compFile, compsFromFile, foldersOf, FORMAT, minimumDrawingSchema, type CompFile, type DrawingFile, type ProjectFile } from './schema';

export const APP_VERSION = '2Dope 0.0.2';

export interface Settled {
  file: ProjectFile;
  /** Newly encoded assets (path -> PNG bytes). Unchanged drawings reuse their stored assets. */
  assets: Map<string, Uint8Array>;
  /** Call after the assets were stored, so later saves can skip these drawings. */
  commit(): void;
}

export interface Capture {
  settle(): Promise<Settled>;
}

interface PlaneJob {
  /** null = blank plane, string = already stored, promise = bytes to store. */
  value: string | null | Promise<Uint8Array | null> | (() => Promise<Uint8Array | null>);
}

export interface CaptureOptions {
  /**
   * `library`: reuse assets already stored on this device (autosave, versions).
   * `archive`: every asset's bytes are included (a .2dope file that stands on its own).
   */
  mode: 'library' | 'archive';
  /** Reads stored assets (archive mode needs the bytes of parked drawings). */
  source?: AssetSource;
  /** Optional bound for a coordinating export; stop before retaining further archive assets. */
  maxAssetBytes?: number;
}

/**
 * Capture the project NOW (synchronously) and finish encoding later. Everything that must match
 * this exact moment is read or snapshotted before returning: exposures, vectors, fps, and each
 * changed plane's pixels (via toBlob). So callers can safely let the user keep editing while the
 * encode completes. Parked drawings are not decoded: their stored keys or bytes are used as is.
 */
export function captureProject(project: Project, opt: CaptureOptions = { mode: 'library' }): Capture {
  if (opt.maxAssetBytes !== undefined && (!Number.isFinite(opt.maxAssetBytes) || opt.maxAssetBytes < 1)) throw new Error('Invalid snapshot asset budget.');
  // comps are plain data: serialising them now snapshots this exact moment
  const comps: Record<string, CompFile> = {};
  for (const c of project.comps.values()) comps[c.id] = compFile(c);
  const folders: ProjectFile['folders'] = {};
  for (const f of project.folders) folders[f.id] = { name: f.name, parent: f.parent };
  const used = [...project.usedDrawings()];
  const usedSounds = new Set([...project.comps.values()].flatMap(c => (c.audio ?? []).map(clip => clip.asset)));
  const soundJobs = [...usedSounds].map(id => {
    const sound = project.sounds.get(id);
    if (!sound) throw new Error(`Audio asset ${id} is missing.`);
    return { id, ...sound };
  });
  // fonts the captions use (only those travel with the project)
  const usedFonts = new Set([...project.comps.values()].flatMap(c => c.layers.flatMap(l => (l.kind === 'drawings' && l.caption?.font.startsWith('custom:') ? [l.caption.font.slice(7)] : []))));
  const fontJobs = [...usedFonts].flatMap(id => { const font = project.fonts.get(id); return font ? [{ id, ...font }] : []; });
  // movies the shot's movie layers play (only those travel with the project)
  const usedVideos = new Set([...project.comps.values()].flatMap(c => c.layers.flatMap(l => (l.kind === 'drawings' && l.video ? [l.video.asset] : []))));
  const videoJobs = [...usedVideos].flatMap(id => { const video = project.videos.get(id); return video ? [{ id, ...video }] : []; });
  // a movie's sound is a sound asset too (kept even when no sound clip uses it)
  for (const c of project.comps.values()) for (const l of c.layers) if (l.kind === 'drawings' && l.video?.sound && !usedSounds.has(l.video.sound) && project.sounds.has(l.video.sound)) { usedSounds.add(l.video.sound); soundJobs.push({ id: l.video.sound, ...project.sounds.get(l.video.sound)! }); }
  const main = project.comps.has(project.main) ? project.main : [...project.comps.keys()][0]!;
  const base = {
    name: project.name,
    created: project.created,
    fps: project.comps.get(main)?.fps ?? 12,
    width: project.width,
    height: project.height,
  };

  const fromRef = (ref: PlaneRef | null): PlaneJob => {
    if (!ref) return { value: null };
    if (ref.bytes) return { value: Promise.resolve(ref.bytes) };
    if (opt.mode === 'library') return { value: ref.key };
    const src = opt.source, key = ref.key;
    return { value: async () => { const bytes = key && src ? await src(key) : null; if (!bytes) throw new Error('A drawing image asset is missing. The project was not exported.'); return bytes; } };
  };

  const planes = used.map((id) => {
    const d = project.drawing(id);
    const rev = d.rev;
    const parked = d.parked;
    const saved = opt.mode === 'library' && d.saved && d.saved.rev === rev ? d.saved : null;
    const job = (plane: 'line' | 'fill'): PlaneJob => {
      if (parked) return fromRef(parked[plane]);
      if (saved) return { value: saved[plane] };
      const canvas = plane === 'line' ? d.line : d.fill;
      if (!canvas || isBlank(canvas)) return { value: null };
      return { value: encodePng(canvas) };
    };
    return { id, num: d.num, rev, vectors: [...d.vectors], role: d.role, line: job('line'), fill: job('fill'), drawing: d };
  });

  return {
    async settle(): Promise<Settled> {
      const assets = new Map<string, Uint8Array>(); let assetBytes = 0;
      const putAsset = (key: string, bytes: Uint8Array) => {
        const total = assetBytes - (assets.get(key)?.byteLength ?? 0) + bytes.byteLength;
        if (opt.maxAssetBytes !== undefined && total > opt.maxAssetBytes) throw new Error('The project snapshot exceeds this device’s bundle memory limit. Use separate Share exports.');
        assetBytes = total; assets.set(key, bytes);
      };
      const keyOf = async (job: PlaneJob): Promise<string | null> => {
        const v = job.value;
        if (v === null || typeof v === 'string') return v;
        const bytes = await (typeof v === 'function' ? v() : v);
        if (!bytes) return null;
        const key = `assets/${hashBytes(bytes)}.png`;
        putAsset(key, bytes);
        return key;
      };
      const drawings: Record<string, DrawingFile> = {};
      const sounds: NonNullable<ProjectFile['sounds']> = {};
      for (const sound of soundJobs) {
        sounds[sound.id] = { name: sound.name, path: sound.path, duration: sound.duration };
        if (sound.bytes) putAsset(sound.path, sound.bytes);
        else if (opt.mode === 'archive') {
          const bytes = await opt.source?.(sound.path);
          if (!bytes) throw new Error(`Audio asset ${sound.name} is missing. The project was not exported.`);
          putAsset(sound.path, bytes);
        }
      }
      const fonts: NonNullable<ProjectFile['fonts']> = {};
      for (const font of fontJobs) {
        fonts[font.id] = { name: font.name, path: font.path };
        if (font.bytes) putAsset(font.path, font.bytes);
        else if (opt.mode === 'archive') {
          const bytes = await opt.source?.(font.path);
          if (!bytes) throw new Error(`Font ${font.name} is missing. The project was not exported.`);
          putAsset(font.path, bytes);
        }
      }
      const videos: NonNullable<ProjectFile['videos']> = {};
      for (const video of videoJobs) {
        videos[video.id] = { name: video.name, path: video.path, duration: video.duration, width: video.width, height: video.height, fps: video.fps };
        if (video.bytes) putAsset(video.path, video.bytes);
        else if (opt.mode === 'archive') {
          const bytes = await opt.source?.(video.path);
          if (!bytes) throw new Error(`Movie ${video.name} is missing. The project was not exported.`);
          putAsset(video.path, bytes);
        }
      }
      const keys: { d: Drawing; rev: number; line: string | null; fill: string | null }[] = [];
      for (const p of planes) {
        const line = await keyOf(p.line);
        const fill = await keyOf(p.fill);
        drawings[p.id] = { num: p.num, line, fill, vectors: p.vectors, ...(p.role ? { role: p.role } : {}) };
        keys.push({ d: p.drawing, rev: p.rev, line, fill });
      }
      const file: ProjectFile = {
        format: FORMAT,
        schema: minimumDrawingSchema(drawings, comps),
        savedBy: APP_VERSION,
        name: base.name,
        created: base.created,
        modified: new Date().toISOString(),
        canvas: { width: base.width, height: base.height },
        fps: base.fps,
        main,
        comps,
        folders,
        drawings,
        ...(soundJobs.length ? { sounds } : {}),
        ...(fontJobs.length ? { fonts } : {}),
        ...(videoJobs.length ? { videos } : {}),
      };
      return {
        file,
        assets,
        commit() {
          // Only library saves put the assets where later saves (and parking) can find them.
          if (opt.mode !== 'library') return;
          for (const k of keys) recordSaved(k.d, k.rev, k.line, k.fill);
        },
      };
    },
  };
}

export interface Loaded {
  project: Project;
  warnings: string[];
}

/**
 * Build a Project from a validated file. Nothing is decoded here: every drawing starts parked,
 * pointing at its stored assets, and comes back when it is first shown. The assets must be
 * readable through the residency manager's source (put a file's assets in the store first).
 */
export function loadProjectFile(file: ProjectFile): Loaded {
  const warnings: string[] = [];
  const project = new Project(file.canvas.width, file.canvas.height, false);
  project.name = file.name;
  project.created = file.created;
  for (const [id, c] of compsFromFile(file)) project.comps.set(id, c);
  project.folders = foldersOf(file);
  project.main = file.main;
  project.activeComp = file.main;
  for (const [id, sound] of Object.entries(file.sounds ?? {})) project.sounds.set(id, { ...sound, bytes: null });
  for (const [id, font] of Object.entries(file.fonts ?? {})) project.fonts.set(id, { ...font, bytes: null });
  for (const [id, video] of Object.entries(file.videos ?? {})) project.videos.set(id, { ...video, bytes: null });
  const ref = (key: string | null): PlaneRef | null => (key ? { key, bytes: null } : null);
  for (const [id, f] of Object.entries(file.drawings)) {
    const d = project.adopt(id, f.num, f.vectors, f.role ?? null, { rev: 0, line: ref(f.line), fill: ref(f.fill) });
    d.saved = { rev: 0, line: f.line, fill: f.fill };
  }
  // edit the first drawings layer of the shot
  const first = project.comp.layers.find((l) => l.kind === 'drawings');
  if (first) project.activeLayer = first.id;
  return { project, warnings };
}
