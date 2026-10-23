import type { ArtworkPackage } from '../io/artwork';
import { loadProjectFile } from '../io/projectio';
import { encodePng } from '../io/codec';
import { frameContent } from '../core/comp';
import { Residency } from '../core/residency';
import { Project } from '../core/project';
import { domPlaneOps } from './planeops';
import { drawComp } from './composite';

/** Preview the exact stored snapshot, decoding just its first frame and releasing it afterwards. */
export async function artworkPreview(bundle: ArtworkPackage): Promise<Uint8Array> {
  const p = loadProjectFile(bundle.file).project;
  const r = new Residency(domPlaneOps, async key => bundle.assets.get(key) ?? null);
  r.setProject(p);
  const pinned = [...frameContent(p.comps, p.main, 0).drawings].map(id => p.drawing(id));
  try {
    for (const d of pinned) await r.pin(d);
    const c = document.createElement('canvas'); c.width = 256; c.height = 144;
    const g = c.getContext('2d')!, comp = p.comp, s = Math.min(c.width / comp.width, c.height / comp.height);
    g.translate((c.width - comp.width * s) / 2, (c.height - comp.height * s) / 2); g.scale(s, s);
    drawComp(g, p, comp, 0, { export: true }); return await encodePng(c);
  } finally { for (const d of pinned) r.unpin(d); r.setProject(new Project(1, 1, false)); }
}
