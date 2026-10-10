import { planeCanvas, Project, type Drawing } from '../core/project';
import { decodePngInto, encodePng, isBlank } from './codec';
import { hashBytes } from './hash';
import { FORMAT, SCHEMA, type DrawingFile, type ProjectFile } from './schema';

export const APP_VERSION = '2Dope 0.0.1';

/** What we already stored for a drawing, valid while its `rev` is unchanged. */
export interface PlaneKeys {
  rev: number;
  line: string | null;
  fill: string | null;
}
export type PlaneCache = WeakMap<Drawing, PlaneKeys>;

export interface Settled {
  file: ProjectFile;
  /** Newly encoded assets (path -> PNG bytes). Unchanged drawings reuse their cached assets. */
  assets: Map<string, Uint8Array>;
  /** Call after the assets were stored, so later saves can skip these drawings. */
  commit(): void;
}

export interface Capture {
  settle(): Promise<Settled>;
}

interface PlaneJob {
  /** null = blank plane, string = already stored, promise = encoding now. */
  value: string | null | Promise<Uint8Array | null>;
}

/**
 * Capture the project NOW (synchronously) and finish encoding later. Everything that must match
 * this exact moment is read or snapshotted before returning: exposures, vectors, fps, and each
 * changed plane's pixels (via toBlob). So callers can safely let the user keep editing while the
 * encode completes. With a `cache`, drawings whose `rev` did not change are not re-encoded.
 */
export function captureProject(project: Project, cache: PlaneCache | null): Capture {
  const exposures = project.exposures.map((e) => ({ ...e }));
  const used = [...new Set(exposures.map((e) => e.drawing))];
  const base = {
    name: project.name,
    created: project.created,
    fps: project.fps,
    width: project.width,
    height: project.height,
  };

  const planes = used.map((id) => {
    const d = project.drawing(id);
    const hit = cache?.get(d);
    const reuse = hit && hit.rev === d.rev;
    const job = (plane: 'line' | 'fill'): PlaneJob => {
      if (reuse) return { value: hit[plane] };
      const canvas = plane === 'line' ? d.line : d.fill;
      if (!canvas || isBlank(canvas)) return { value: null };
      return { value: encodePng(canvas) };
    };
    return {
      id,
      num: d.num,
      rev: d.rev,
      vectors: [...d.vectors],
      role: d.role,
      line: job('line'),
      fill: job('fill'),
      drawing: d,
    };
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
          if (!cache) return;
          for (const k of keys) cache.set(k.d, { rev: k.rev, line: k.line, fill: k.fill });
        },
      };
    },
  };
}

export interface Loaded {
  project: Project;
  warnings: string[];
}

/** Build a Project from a validated file. Missing or broken assets become blank planes with a warning. */
export async function loadProjectFile(file: ProjectFile, getAsset: (path: string) => Promise<Uint8Array | null>): Promise<Loaded> {
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
    const d = project.adopt(id, f.num, f.vectors, f.role ?? null);
    for (const plane of ['line', 'fill'] as const) {
      const path = f[plane];
      if (!path) continue;
      try {
        const bytes = await getAsset(path);
        if (!bytes) {
          warnings.push(`Drawing ${f.num}: the ${plane} image is missing, so it was left blank.`);
          continue;
        }
        await decodePngInto(planeCanvas(d, plane), bytes);
      } catch {
        warnings.push(`Drawing ${f.num}: the ${plane} image could not be read, so it was left blank.`);
      }
    }
  }
  project.exposures = layer.exposures.map((e) => ({ ...e }));
  return { project, warnings };
}
