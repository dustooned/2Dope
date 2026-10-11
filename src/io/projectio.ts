import { Project, type Drawing, type PlaneRef } from '../core/project';
import { recordSaved, type AssetSource } from '../core/residency';
import { encodePng, isBlank } from './codec';
import { hashBytes } from './hash';
import { FORMAT, SCHEMA, type DrawingFile, type ProjectFile } from './schema';

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
  value: string | null | Promise<Uint8Array | null>;
}

export interface CaptureOptions {
  /**
   * `library`: reuse assets already stored on this device (autosave, versions).
   * `archive`: every asset's bytes are included (a .2dope file that stands on its own).
   */
  mode: 'library' | 'archive';
  /** Reads stored assets (archive mode needs the bytes of parked drawings). */
  source?: AssetSource;
}

/**
 * Capture the project NOW (synchronously) and finish encoding later. Everything that must match
 * this exact moment is read or snapshotted before returning: exposures, vectors, fps, and each
 * changed plane's pixels (via toBlob). So callers can safely let the user keep editing while the
 * encode completes. Parked drawings are not decoded: their stored keys or bytes are used as is.
 */
export function captureProject(project: Project, opt: CaptureOptions = { mode: 'library' }): Capture {
  const exposures = project.exposures.map((e) => ({ ...e }));
  const used = [...new Set(exposures.map((e) => e.drawing))];
  const base = {
    name: project.name,
    created: project.created,
    fps: project.fps,
    width: project.width,
    height: project.height,
  };

  const fromRef = (ref: PlaneRef | null): PlaneJob => {
    if (!ref) return { value: null };
    if (ref.bytes) return { value: Promise.resolve(ref.bytes) };
    if (opt.mode === 'library') return { value: ref.key };
    const src = opt.source;
    return { value: ref.key && src ? src(ref.key) : Promise.resolve(null) };
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
      const assets = new Map<string, Uint8Array>();
      const keyOf = async (job: PlaneJob): Promise<string | null> => {
        const v = job.value;
        if (v === null || typeof v === 'string') return v;
        const bytes = await v;
        if (!bytes) return null;
        const key = `assets/${hashBytes(bytes)}.png`;
        assets.set(key, bytes);
        return key;
      };
      const drawings: Record<string, DrawingFile> = {};
      const keys: { d: Drawing; rev: number; line: string | null; fill: string | null }[] = [];
      for (const p of planes) {
        const line = await keyOf(p.line);
        const fill = await keyOf(p.fill);
        drawings[p.id] = { num: p.num, line, fill, vectors: p.vectors, ...(p.role ? { role: p.role } : {}) };
        keys.push({ d: p.drawing, rev: p.rev, line, fill });
      }
      const file: ProjectFile = {
        format: FORMAT,
        schema: SCHEMA,
        savedBy: APP_VERSION,
        name: base.name,
        created: base.created,
        modified: new Date().toISOString(),
        canvas: { width: base.width, height: base.height },
        fps: base.fps,
        layers: [{ id: 'layer1', type: 'drawing', name: 'Drawing', exposures }],
        drawings,
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
  project.fps = file.fps;
  if (file.layers.length > 1) warnings.push(`This project has ${file.layers.length} layers; this version of 2Dope only opens the first.`);
  const layer = file.layers[0]!;
  const used = [...new Set(layer.exposures.map((e) => e.drawing))];
  for (const id of used) {
    const f = file.drawings[id]!;
    const ref = (key: string | null): PlaneRef | null => (key ? { key, bytes: null } : null);
    const d = project.adopt(id, f.num, f.vectors, f.role ?? null, { rev: 0, line: ref(f.line), fill: ref(f.fill) });
    d.saved = { rev: 0, line: f.line, fill: f.fill };
  }
  project.exposures = layer.exposures.map((e) => ({ ...e }));
  return { project, warnings };
}
