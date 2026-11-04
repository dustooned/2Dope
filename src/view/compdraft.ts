import { Project, type Drawing } from '../core/project';
import { frameContent, type Comp } from '../core/comp';
import { drawComp } from './composite';

/** Detached modal preview. Never give the borrowed drawings to Residency.setProject. */
export class CompDraftPreview {
  private serial = 0;
  private closed = false;
  private tail = Promise.resolve();
  constructor(private source: Project, private hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void }, private valid: () => boolean) {}
  close(): void { this.closed = true; this.serial++; }
  render(canvas: HTMLCanvasElement, comp: Comp, frame: number, camera = true): Promise<void> {
    const request = ++this.serial;
    const work = this.tail.then(async () => {
      if (this.closed || request !== this.serial || !this.valid()) return;
      const pinned: Drawing[] = [];
      try {
        const p = new Project(this.source.width, this.source.height, false); p.main = p.activeComp = comp.id;
        for (const [id, c] of this.source.comps) p.comps.set(id, id === comp.id ? comp : c);
        for (const [id, drawing] of this.source.drawings) p.drawings.set(id, drawing);
        for (const id of frameContent(p.comps, comp, frame).drawings) {
          if (this.closed || request !== this.serial || !this.valid()) return;
          const drawing = p.drawing(id); pinned.push(drawing); await this.hold.pin(drawing);
        }
        if (this.closed || request !== this.serial || !this.valid()) return;
        const g = canvas.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
        const s = Math.min(canvas.width / comp.width, canvas.height / comp.height); g.save();
        try { g.translate((canvas.width - s * comp.width) / 2, (canvas.height - s * comp.height) / 2); g.scale(s, s); drawComp(g, p, comp, frame, { export: true, camera }); } finally { g.restore(); }
      } finally { for (const d of pinned) this.hold.unpin(d); }
    });
    this.tail = work.catch(() => {}); return work;
  }
}
