import { makeCanvas } from '../brush/raster';
import { compLength, frameContent } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { gifFrame, gifHeader } from './gif';

export function planGif(project: Pick<Project, 'comp' | 'comps' | 'main'>, lite: boolean) {
  const comp = project.comps.get(project.main) ?? project.comp;
  const frames = compLength(comp, project.comps), fps = comp.fps;
  if (!Number.isInteger(frames) || frames < 1 || !Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('Invalid shot timing.');
  const duration = frames / fps;
  if (duration > 15) throw new Error('GIF supports shots up to 15 seconds here. Use video or a PNG sequence for longer shots.');
  if (![comp.width, comp.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384)) throw new Error('Invalid shot dimensions.');
  const scale = Math.min(1, (lite ? 320 : 480) / Math.max(comp.width, comp.height));
  const width = Math.max(1, Math.round(comp.width * scale)), height = Math.max(1, Math.round(comp.height * scale));
  const samples = Math.ceil(duration * Math.min(fps, 12));
  const maxBytes = (lite ? 12 : 24) * 1024 * 1024;
  if (width * height * samples * 1.15 + samples * 32 + 800 > maxBytes) throw new Error('This GIF would exceed the device limit. Use video or a PNG sequence.');
  return { comp: comp.id, frames, fps, duration, width, height, samples, maxBytes };
}

/** Main shot and shared compositor; no editor clock changes, one pinned frame at a time. */
export async function exportGif(project: Project, lite: boolean, signal: AbortSignal,
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void }, progress: (done: number, total: number) => void, transparent = false): Promise<Blob> {
  const p = planGif(project, lite);
  const check = () => { if (signal.aborted) throw new DOMException('GIF export cancelled', 'AbortError'); };
  check();
  const canvas = makeCanvas(p.width, p.height), g = canvas.getContext('2d');
  const parts: BlobPart[] = [gifHeader(p.width, p.height) as BlobPart];
  let bytes = 800;
  try {
    if (!g) throw new Error('2D canvas unavailable.');
    const comp = project.comps.get(p.comp)!;
    for (let i = 0; i < p.samples; i++) {
      check();
      const frame = Math.min(p.frames - 1, Math.floor(i * p.frames / p.samples));
      const pinned: Drawing[] = [];
      try {
        const content = frameContent(project.comps, p.comp, frame);
        for (const id of content.drawings) {
          check();
          const d = project.drawings.get(id);
          if (!d) throw new Error(`Drawing ${id} is missing.`);
          pinned.push(d); await hold.pin(d);
        }
        check();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (transparent) g.clearRect(0, 0, p.width, p.height);
        else { g.fillStyle = '#ffffff'; g.fillRect(0, 0, p.width, p.height); }
        g.setTransform(p.width / comp.width, 0, 0, p.height / comp.height, 0, 0);
        drawComp(g, project, p.comp, frame, { backgrounds: true, export: true });
        const delay = Math.round((i + 1) * p.duration * 100 / p.samples) - Math.round(i * p.duration * 100 / p.samples);
        const data = gifFrame(g.getImageData(0, 0, p.width, p.height).data, p.width, p.height, delay, transparent);
        bytes += data.length;
        if (bytes > p.maxBytes) throw new Error('GIF exceeded the device limit. Use video instead.');
        parts.push(data as BlobPart);
      } finally { for (const d of pinned) hold.unpin(d); }
      progress(i + 1, p.samples);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    check(); parts.push(new Uint8Array([0x3b]));
    return new Blob(parts, { type: 'image/gif' });
  } finally { canvas.width = canvas.height = 0; releaseScratch(); }
}
