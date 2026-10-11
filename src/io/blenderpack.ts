import { makeCanvas } from '../brush/raster';
import { frameContent } from '../core/comp';
import { paintDrawing, type Drawing, type Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { planBlender } from './blender';
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
`;

/**
 * Build the Blender package: scene.json, one PNG per drawing (fill, line and vectors together),
 * the frames of precomps that Blender cannot instance, the add-on and a short README.
 */
export async function exportBlender(
  project: Project,
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void },
  onProgress: (p: PackProgress) => void = () => {},
): Promise<{ zip: Uint8Array; notes: string[]; images: number }> {
  const plan = planBlender(project, APP_VERSION);
  const files: ZipFile[] = [];
  const total = plan.drawings.size + plan.renders.length;
  let done = 0;
  const tick = (label: string) => onProgress({ done: ++done, total, label });

  // drawings, each once
  const page = makeCanvas(project.width, project.height);
  const g = page.getContext('2d')!;
  for (const id of plan.drawings) {
    const d = project.drawings.get(id);
    if (!d) continue;
    await hold.pin(d);
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, page.width, page.height);
      paintDrawing(g, d);
      files.push({ name: plan.scene.images[`d:${id}`]!, data: await encodePng(page) });
    } finally {
      hold.unpin(d);
    }
    tick(`Drawing ${d.num}`);
  }

  // precomp frames 2Dope renders itself
  try {
    for (const job of plan.renders) {
      const c = makeCanvas(job.comp.width, job.comp.height);
      const cg = c.getContext('2d')!;
      const need = [...frameContent(project.comps, job.comp, job.frame).drawings].map((id) => project.drawings.get(id)).filter((d): d is Drawing => !!d);
      for (const d of need) await hold.pin(d);
      try {
        drawComp(cg, project, job.comp, job.frame, { backgrounds: true });
        files.push({ name: plan.scene.images[job.image]!, data: await encodePng(c) });
      } finally {
        for (const d of need) hold.unpin(d);
      }
      tick(`Precomp frame ${job.frame + 1}`);
    }
  } finally {
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
