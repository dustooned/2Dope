import { makeCanvas } from '../brush/raster';
import { frameContent } from '../core/comp';
import { paintDrawing, type Drawing, type Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { planBlender, trimScene, type Rect } from './blender';
import { encodePng } from './codec';
import { APP_VERSION } from './projectio';
import { writeZip, type ZipFile } from './zip';
import addon from '../../blender/2dope_import.py?raw';

export interface PackProgress {
  done: number;
  total: number;
  label: string;
}

const README = `2Dope scene for Blender
=======================

1. In Blender (4.2 or newer): Edit > Preferences > Add-ons > the (v) menu > Install from Disk...
   and pick 2dope_import.py (in this folder). Tick it to enable it. Once is enough.
2. File > Import > 2Dope scene, and pick this .zip (or scene.json after unzipping).

What you get: every drawing layer as an image plane facing the camera (front view, XZ plane),
with its timing (holds, loops, swaps) as an image sequence; nulls as empties; the 2Dope camera
as an orthographic camera; precomps as collection instances; all keyframes as F-curves with
the same easing. 100 pixels = 1 metre (change it in the import options).
Each drawing layer's plane is the size of its art (with a 2 pixel margin), not the whole page,
so its PNGs are small; the plane sits exactly where the art is in 2Dope.
`;

/** The painted area of a canvas (any alpha), or null when it is empty. */
function paintedRect(g: CanvasRenderingContext2D, w: number, h: number): Rect | null {
  const a = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (!a[row + x * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface BlenderOptions {
  /** Size each layer's plane and images to its art (default) instead of the whole page. */
  trim: boolean;
}

/**
 * Build the Blender package: scene.json, PNGs of the drawings (fill, line and vectors together),
 * cut to each layer's art unless `trim` is off, the frames of precomps that Blender cannot
 * instance, the add-on and a short README.
 */
export async function exportBlender(
  project: Project,
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void },
  onProgress: (p: PackProgress) => void = () => {},
  signal?: AbortSignal,
  options: BlenderOptions = { trim: true },
): Promise<{ zip: Uint8Array; notes: string[]; images: number }> {
  const plan = planBlender(project, APP_VERSION);
  const files: ZipFile[] = [];
  const jobs = new Map(plan.renders.map((j) => [j.image, j]));
  // the images drawings layers show: drawings, or the frames 2Dope renders for a layer with a
  // mask, effects or clipping (each cut to the layer's art); a precomp's frames stay whole
  const shown = new Set<string>();
  for (const c of Object.values(plan.scene.comps)) for (const l of c.layers) for (const r of l.frames ?? []) if (l.kind === 'drawings' && r.image) shown.add(r.image);
  for (const m of plan.scene.board ?? []) if (m.image) shown.add(m.image);
  const whole = plan.renders.filter((j) => !shown.has(j.image));
  let done = 0, total = (options.trim ? shown.size : 0) + shown.size + whole.length;
  const tick = (label: string) => onProgress({ done: ++done, total, label });
  const pages = new Map<string, CanvasRenderingContext2D>();
  const pageOf = (w: number, h: number) => {
    let g = pages.get(`${w}x${h}`);
    if (!g) pages.set(`${w}x${h}`, (g = makeCanvas(w, h).getContext('2d', { willReadFrequently: options.trim })!));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    return g;
  };
  /** Draw an image's full page (a drawing, or a frame 2Dope renders), then hand it on; false when there is nothing to draw. */
  const draw = async (key: string, then: (g: CanvasRenderingContext2D, label: string) => Promise<void> | void): Promise<boolean> => {
    signal?.throwIfAborted();
    const job = jobs.get(key);
    const ids = job ? [...frameContent(project.comps, job.comp, job.frame).drawings] : [key.slice(2)];
    const need = ids.map((id) => project.drawings.get(id)).filter((d): d is Drawing => !!d);
    if (!job && !need.length) return false;
    for (const d of need) await hold.pin(d);
    try {
      if (job) {
        const g = pageOf(job.comp.width, job.comp.height);
        drawComp(g, project, job.comp, job.frame, { backgrounds: true, export: true });
        await then(g, `Frame ${job.frame + 1}`);
      } else {
        const g = pageOf(project.width, project.height);
        paintDrawing(g, need[0]!);
        await then(g, `Drawing ${need[0]!.num}`);
      }
      return true;
    } finally {
      for (const d of need) hold.unpin(d);
    }
  };

  try {
    // where each image has paint, so a layer's plane can be cut to its art
    const bounds = new Map<string, Rect | null>();
    if (options.trim) for (const key of shown) await draw(key, (g, label) => { bounds.set(key, paintedRect(g, g.canvas.width, g.canvas.height)); tick(`Measuring: ${label}`); });
    const images = trimScene(plan.scene, bounds, [project.width, project.height], options.trim);
    total += images.length - shown.size;

    // each image once, cut from its page
    for (const im of images) {
      const written = await draw(im.source, async (g, label) => {
        const { x, y, w, h } = im.rect;
        let out = g.canvas;
        if (x || y || w !== out.width || h !== out.height) {
          out = makeCanvas(w, h);
          out.getContext('2d')!.drawImage(g.canvas, -x, -y);
        }
        files.push({ name: plan.scene.images[im.key]!, data: await encodePng(out) });
        tick(label);
      });
      // a drawing missing from the pool: the add-on shows a blank frame for an image with no file
      if (!written) delete plan.scene.images[im.key];
    }

    // precomp frames 2Dope renders itself, whole
    for (const job of whole) {
      await draw(job.image, async (g, label) => {
        files.push({ name: plan.scene.images[job.image]!, data: await encodePng(g.canvas) });
        tick(`Precomp: ${label}`);
      });
    }
  } finally {
    for (const g of pages.values()) g.canvas.width = g.canvas.height = 0;
    releaseScratch();
  }

  const enc = new TextEncoder();
  files.unshift(
    { name: 'scene.json', data: enc.encode(JSON.stringify(plan.scene, null, 1)) },
    { name: '2dope_import.py', data: enc.encode(addon) },
    { name: 'README.txt', data: enc.encode(README + (plan.notes.length ? `\nNotes for this scene:\n- ${plan.notes.join('\n- ')}\n` : '')) },
  );
  return { zip: writeZip(files), notes: plan.notes, images: files.length - 3 };
}
