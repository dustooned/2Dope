import { makeCanvas } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { paintDrawing, type Drawing, type Project } from '../core/project';
import { strokeLength } from '../core/stroke';
import { encodePng } from './codec';
import { buildManifest, entryPath, framesToExport, scaledSize, type ExportOptions, type Pass } from './exportplan';
import { APP_VERSION } from './projectio';
import { writeZip, type ZipFile } from './zip';

export interface ExportProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * Give the page a turn between images. A message-channel hop is not throttled in background tabs
 * (setTimeout is clamped to ~1 s there), so an export keeps its speed if you switch tabs.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

/** Draw one pass of a drawing onto a (cleared) context that already has the scale transform applied. */
function drawPass(g: CanvasRenderingContext2D, d: Drawing, pass: Pass, opts: ExportOptions, w: number, h: number): void {
  switch (pass) {
    case 'combined':
      if (opts.background === 'white') {
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        g.restore();
      }
      paintDrawing(g, d);
      break;
    case 'lines':
      g.drawImage(d.line, 0, 0);
      for (const v of d.vectors) drawVectorStroke(g, v, strokeLength(v.points));
      break;
    case 'fills':
      if (d.fill) g.drawImage(d.fill, 0, 0);
      break;
    case 'matte':
      paintDrawing(g, d);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.restore();
      break;
  }
}

/**
 * Render the shot as PNG sequences (one folder per pass) plus an export.json describing them, and
 * return the ZIP. Each distinct drawing is rendered once per pass; frames that hold a drawing
 * reuse the same bytes. The caller should not edit the project while this runs.
 */
export async function exportSequence(
  project: Project,
  opts: ExportOptions,
  selected: number[],
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<{ zip: Uint8Array; frames: number; images: number }> {
  const frames = framesToExport(project.exposures, opts.range, selected);
  if (!frames.length) throw new Error('There are no frames to export.');
  if (!opts.passes.length) throw new Error('Pick at least one pass to export.');
  const { w, h } = scaledSize(project.width, project.height, opts.scale);
  const unique = [...new Set(frames.map((f) => f.drawing))];
  const total = unique.length * opts.passes.length;

  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.imageSmoothingQuality = 'high';

  const bytes = new Map<string, Uint8Array>();
  let done = 0;
  // toBlob copies the pixels the moment it is called, so one scratch canvas can be re-rendered
  // right away while earlier images are still being encoded. A few encodes run at once, which
  // keeps the export fast even when the tab is in the background (the browser slows each encode there).
  const MAX_IN_FLIGHT = 6;
  const pending = new Set<Promise<void>>();
  let failure: unknown = null;
  const check = () => {
    if (failure) throw failure;
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  };
  for (const id of unique) {
    const d = project.drawing(id);
    for (const pass of opts.passes) {
      check();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(opts.scale, 0, 0, opts.scale, 0, 0);
      drawPass(g, d, pass, opts, w, h);
      const key = `${id}|${pass}`;
      const label = `Drawing ${d.num}, ${pass}`;
      const job: Promise<void> = encodePng(canvas).then(
        (b) => {
          bytes.set(key, b);
          done++;
          onProgress({ done, total, label });
        },
        (e) => {
          failure ??= e;
        },
      );
      const tracked = job.finally(() => pending.delete(tracked));
      pending.add(tracked);
      if (pending.size >= MAX_IN_FLIGHT) await Promise.race(pending);
      // let the browser paint the progress bar between renders
      await yieldToBrowser();
    }
  }
  await Promise.all(pending);
  check();
  onProgress({ done: total, total, label: 'Packing files' });

  let from = 0;
  const exposures = project.exposures.map((e) => {
    const d = project.drawing(e.drawing);
    const row = { drawing: d.num, fromFrame: from, length: e.length, ...(d.role ? { role: d.role } : {}) };
    from += e.length;
    return row;
  });
  const manifest = buildManifest({ opts, savedBy: APP_VERSION, fps: project.fps, width: project.width, height: project.height, frames, exposures });
  const files: ZipFile[] = [{ name: `${opts.name}/export.json`, data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) }];
  frames.forEach((f, i) => {
    for (const pass of opts.passes) files.push({ name: entryPath(opts.name, pass, opts.start + i), data: bytes.get(`${f.drawing}|${pass}`)! });
  });
  return { zip: writeZip(files), frames: frames.length, images: files.length - 1 };
}
