import { videoFramesReady } from '../view/videoframes';
import { makeCanvas } from '../brush/raster';
import { compLength, frameContent, exportComp } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { gifFrame, gifHeader } from './gif';
import { ColourSample, GIF_DEFAULTS, mapToPalette, medianCut, usesFixedPalette, type GifOptions } from './gifpalette';

export function planGif(project: Pick<Project, 'comp' | 'comps' | 'main'> & { activeComp?: string }, lite: boolean, range?: { start: number; end: number }) {
  const comp = exportComp(project) ?? project.comp;
  const length = compLength(comp, project.comps), start = range?.start ?? 0, end = range?.end ?? length, frames = end - start, fps = comp.fps;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > length) throw new Error('Invalid GIF excerpt range.');
  if (!Number.isInteger(frames) || frames < 1 || !Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('Invalid shot timing.');
  const duration = frames / fps;
  if (duration > 15) throw new Error('GIF supports shots up to 15 seconds here. Use video or a PNG sequence for longer shots.');
  if (![comp.width, comp.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384)) throw new Error('Invalid shot dimensions.');
  const scale = Math.min(1, (lite ? 320 : 480) / Math.max(comp.width, comp.height));
  const width = Math.max(1, Math.round(comp.width * scale)), height = Math.max(1, Math.round(comp.height * scale));
  const samples = Math.ceil(duration * Math.min(fps, 12));
  const maxBytes = (lite ? 12 : 24) * 1024 * 1024;
  if (width * height * samples * 1.15 + samples * 32 + 800 > maxBytes) throw new Error('This GIF would exceed the device limit. Use video or a PNG sequence.');
  return { comp: comp.id, start, frames, fps, duration, width, height, samples, maxBytes };
}

/** Main shot and shared compositor; no editor clock changes, one pinned frame at a time. */
export async function exportGif(project: Project, lite: boolean, signal: AbortSignal,
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void }, progress: (done: number, total: number) => void, transparent = false,
  options: GifOptions = GIF_DEFAULTS, range?: { start: number; end: number }): Promise<Blob> {
  const p = planGif(project, lite, range);
  const check = () => { if (signal.aborted) throw new DOMException('GIF export cancelled', 'AbortError'); };
  check();
  const canvas = makeCanvas(p.width, p.height), g = canvas.getContext('2d');
  let bytes = 800;
  try {
    if (!g) throw new Error('2D canvas unavailable.');
    const comp = project.comps.get(p.comp)!;
    /** Pixels of picture `i` (its drawings pinned only while it is drawn). */
    const render = async (i: number): Promise<Uint8ClampedArray> => {
      const frame = p.start + Math.min(p.frames - 1, Math.floor(i * p.frames / p.samples));
      const pinned: Drawing[] = [];
      try {
        const content = frameContent(project.comps, p.comp, frame);
        for (const id of content.drawings) {
          check();
          const d = project.drawings.get(id);
          if (!d) throw new Error(`Drawing ${id} is missing.`);
          pinned.push(d); await hold.pin(d);
        }
        await videoFramesReady(project, content.videos);
        check();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (transparent) g.clearRect(0, 0, p.width, p.height);
        else { g.fillStyle = '#ffffff'; g.fillRect(0, 0, p.width, p.height); }
        g.setTransform(p.width / comp.width, 0, 0, p.height / comp.height, 0, 0);
        // pixel art: the shot is scaled down to GIF size with nearest pixels, not smoothed
        g.imageSmoothingEnabled = !options.pixelArt;
        drawComp(g, project, p.comp, frame, { backgrounds: true, export: true });
        return g.getImageData(0, 0, p.width, p.height).data;
      } finally { for (const d of pinned) hold.unpin(d); }
    };
    // a chosen palette: from the first picture, or (better colours) from every picture in a first pass
    let palette: [number, number, number][] | undefined;
    if (!usesFixedPalette(options)) {
      const sample = new ColourSample(), step = Math.max(1, Math.floor((p.width * p.height) / 20000));
      const passes = options.better ? p.samples : 1;
      for (let i = 0; i < passes; i++) { check(); sample.add(await render(i), step); if (options.better) progress(i + 1, 2 * p.samples); }
      palette = medianCut(sample.px, Math.max(2, Math.min(256, options.colors) - (transparent ? 1 : 0)));
    }
    const clear = palette && transparent ? palette.length : undefined;
    const parts: BlobPart[] = [gifHeader(p.width, p.height, palette, options.loop) as BlobPart];
    for (let i = 0; i < p.samples; i++) {
      check();
      const px = await render(i);
      const delay = Math.round((i + 1) * p.duration * 100 / p.samples) - Math.round(i * p.duration * 100 / p.samples);
      const data = palette
        ? gifFrame(px, p.width, p.height, delay, transparent, mapToPalette(px, p.width, p.height, palette, options, clear), clear)
        : gifFrame(px, p.width, p.height, delay, transparent);
      bytes += data.length;
      if (bytes > p.maxBytes) throw new Error('GIF exceeded the device limit. Use video instead.');
      parts.push(data as BlobPart);
      progress(options.better ? p.samples + i + 1 : i + 1, options.better ? 2 * p.samples : p.samples);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    check(); parts.push(new Uint8Array([0x3b]));
    return new Blob(parts, { type: 'image/gif' });
  } finally { canvas.width = canvas.height = 0; releaseScratch(); }
}
