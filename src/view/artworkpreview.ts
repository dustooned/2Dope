import type { ArtworkPackage } from '../io/artwork';
import { loadProjectFile } from '../io/projectio';
import { encodePng } from '../io/codec';
import { frameContent } from '../core/comp';
import { Residency } from '../core/residency';
import { Project } from '../core/project';
import { domPlaneOps } from './planeops';
import { drawComp } from './composite';

/** One isolated saved source; seek requests coalesce and only one frame decodes at a time. */
export class ArtworkPreviewSession {
  private readonly project: Project;
  private readonly residency: Residency;
  private tail: Promise<void> = Promise.resolve();
  private serial = 0;
  private closed = false;
  private error: string | null = null;
  constructor(bundle: ArtworkPackage, private canvas: HTMLCanvasElement) {
    this.project = loadProjectFile(bundle.file).project;
    this.residency = new Residency(domPlaneOps, async key => bundle.assets.get(key) ?? null);
    this.residency.onWarning = message => { this.error = message; };
    this.residency.setProject(this.project);
  }
  render(frame: number): Promise<boolean> {
    const serial = ++this.serial;
    const job = async () => {
      if (this.closed || serial !== this.serial) return false;
      const p = this.project, r = this.residency;
      const drawings = [...frameContent(p.comps, p.main, frame).drawings].map(id => p.drawing(id)), pinned: typeof drawings = [];
      try {
        for (const d of drawings) { if (this.closed || serial !== this.serial) return false; pinned.push(d); await r.pin(d); }
        if (this.closed || serial !== this.serial) return false;
        if (this.error) throw new Error(this.error);
        const c = this.canvas, g = c.getContext('2d')!, comp = p.comp, scale = Math.min(c.width / comp.width, c.height / comp.height);
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.save();
        g.translate((c.width - comp.width * scale) / 2, (c.height - comp.height * scale) / 2); g.scale(scale, scale);
        try { drawComp(g, p, comp, frame, { export: true }); } finally { g.restore(); }
        return true;
      } finally { for (const d of pinned) r.unpin(d); }
    };
    const next = this.tail.then(job); this.tail = next.then(() => {}, () => {}); return next;
  }
  close(): void {
    this.closed = true; this.serial++;
    void this.tail.then(() => this.residency.setProject(new Project(1, 1, false)));
  }
}

export async function artworkPreview(bundle: ArtworkPackage): Promise<Uint8Array> {
  const c = document.createElement('canvas'); c.width = 256; c.height = 144;
  const session = new ArtworkPreviewSession(bundle, c);
  try { await session.render(0); return await encodePng(c); } finally { session.close(); }
}
