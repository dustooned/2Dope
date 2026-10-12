import { makeCanvas } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { paintDrawing, type Drawing, type Project } from '../core/project';
import { strokeLength } from '../core/stroke';
import { encodePng } from './codec';
import { buildManifest, entryPath, framesToExport, scaledSize, type ExportOptions, type Pass, type PlannedFrame } from './exportplan';
import { compLength, frameContent, isPlainFlipbook } from '../core/comp';
import { drawComp, releaseScratch } from '../view/composite';
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

/** One distinct image to render (per pass); frames that look the same share one. */
interface Unit {
  key: string;
  label: string;
  drawings: Drawing[];
  draw(g: CanvasRenderingContext2D, pass: Pass): void;
}

/**
 * Render the shot as PNG sequences (one folder per pass) plus an export.json describing them, and
 * return the ZIP. A plain flipbook renders each distinct drawing once per pass; a shot with
 * layers, motion or a camera renders the whole comp per frame, and frames that come out the same
 * (a hold with nothing moving) still share one image. The caller should not edit the project
 * while this runs.
 */
export async function exportSequence(
  project: Project,
  opts: ExportOptions,
  selected: number[],
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
  /** Keep a drawing's pixels live while it renders (parked drawings come back first). */
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void } = { pin: async () => {}, unpin: () => {} },
): Promise<{ zip: Uint8Array; frames: number; images: number }> {
  if (!opts.passes.length) throw new Error('Pick at least one pass to export.');
  // always the shot, even while a precomp is open for editing
  const comp = project.comps.get(project.main) ?? project.comp;
  const composite = !isPlainFlipbook(comp);
  const only = comp.layers[0];
  const flipbook = !composite && only && only.kind === 'drawings' ? only.exposures : project.exposures;
  // "selected drawings" refers to the strip's layer; it only applies when that is the shot's layer
  const pickSel = project.activeComp === comp.id ? selected : [];
  const pageW = composite ? comp.width : project.width;
  const pageH = composite ? comp.height : project.height;
  const { w, h } = scaledSize(pageW, pageH, opts.scale);

  // frame -> unit key, and the units in first-seen order
  const frameKeys: string[] = [];
  const units = new Map<string, Unit>();
  let planned: PlannedFrame[];
  if (!composite) {
    planned = framesToExport(flipbook, opts.range, pickSel);
    for (const f of planned) {
      frameKeys.push(f.drawing);
      if (!units.has(f.drawing)) {
        const d = project.drawing(f.drawing);
        units.set(f.drawing, { key: f.drawing, label: `Drawing ${d.num}`, drawings: [d], draw: (g, pass) => drawPass(g, d, pass, opts, w, h) });
      }
    }
  } else {
    // the whole comp, frame by frame ("selected" still picks the frames of the selected drawings)
    const length = compLength(comp, project.comps);
    const pick = opts.range === 'selected' && pickSel.length ? new Set(framesToExport(project.exposures, 'selected', pickSel).map((f) => f.frame + project.layer.start)) : null;
    planned = [];
    for (let frame = 0; frame < length; frame++) {
      if (pick && !pick.has(frame)) continue;
      planned.push({ frame, exposure: -1, drawing: '' });
      const fc = frameContent(project.comps, comp.id, frame);
      frameKeys.push(fc.key);
      if (!units.has(fc.key)) {
        const drawings = [...fc.drawings].map((id) => project.drawings.get(id)).filter((d): d is Drawing => !!d);
        units.set(fc.key, { key: fc.key, label: `Frame ${frame + 1}`, drawings, draw: (g, pass) => drawCompPass(g, project, comp.id, frame, pass, opts, w, h) });
      }
    }
  }
  if (!planned.length) throw new Error('There are no frames to export.');
  const total = units.size * opts.passes.length;

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
  try {
    for (const unit of units.values()) {
      check();
      for (const d of unit.drawings) await hold.pin(d);
      try {
        for (const pass of opts.passes) {
          check();
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.clearRect(0, 0, w, h);
          g.setTransform(opts.scale, 0, 0, opts.scale, 0, 0);
          unit.draw(g, pass);
          const key = `${unit.key}|${pass}`;
          const label = `${unit.label}, ${pass}`;
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
      } finally {
        for (const d of unit.drawings) hold.unpin(d);
      }
    }
    await Promise.all(pending);
  } finally {
    if (composite) releaseScratch();
  }
  check();
  onProgress({ done: total, total, label: 'Packing files' });

  let from = 0;
  const exposures = flipbook.map((e) => {
    const d = project.drawing(e.drawing);
    const row = { drawing: d.num, fromFrame: from, length: e.length, ...(d.role ? { role: d.role } : {}) };
    from += e.length;
    return row;
  });
  const manifest = buildManifest({ opts, savedBy: APP_VERSION, fps: comp.fps, width: pageW, height: pageH, frames: planned, exposures });
  const files: ZipFile[] = [{ name: `${opts.name}/export.json`, data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) }];
  frameKeys.forEach((k, i) => {
    for (const pass of opts.passes) files.push({ name: entryPath(opts.name, pass, opts.start + i), data: bytes.get(`${k}|${pass}`)! });
  });
  return { zip: writeZip(files), frames: planned.length, images: files.length - 1 };
}

/** One pass of a whole comp frame. */
function drawCompPass(g: CanvasRenderingContext2D, project: Project, compId: string, frame: number, pass: Pass, opts: ExportOptions, w: number, h: number): void {
  if (pass === 'combined' && opts.background === 'white') {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  const planes = pass === 'lines' ? 'line' : pass === 'fills' ? 'fill' : 'all';
  drawComp(g, project, compId, frame, { planes, backgrounds: pass === 'combined', export: true });
  if (pass === 'matte') {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.restore();
  }
}
