import { frameContent, type Comp } from '../core/comp';
import type { Project, Drawing } from '../core/project';
import type { Residency } from '../core/residency';
import { drawComp } from './composite';

/** Source frame 1, independent of instance timing/transform. Includes nested settings and pixel revisions. */
export function assetPreviewKey(p: Project, id: string): string {
  const source = p.comps.get(id); if (!source?.asset) return '';
  const seen = new Set<string>(), comps: Comp[] = [];
  const visit = (c: Comp, depth: number) => {
    if (seen.has(c.id) || depth > 8) return;
    seen.add(c.id); comps.push(c);
    for (const l of c.layers) if (l.kind === 'comp') { const n=p.comps.get(l.comp);if(n)visit(n,depth+1); }
  };
  visit(source,0);
  const drawings = [...frameContent(p.comps,source,0).drawings].map(id => `${id}:${p.drawings.get(id)?.rev ?? '-'}`);
  return `${p.width}x${p.height}|${JSON.stringify(comps)}|${drawings.join(',')}`;
}

/** One small composite, with only this frame pinned; cancellation never leaves residency pins behind. */
export async function renderAssetPreview(p: Project, id: string, residency: Residency, current: () => boolean): Promise<string | null> {
  const c = p.comps.get(id); if (!c?.asset || !current()) return null;
  const pinned: Drawing[] = [];
  try {
    for (const id of frameContent(p.comps,c,0).drawings) {
      if (!current()) return null;
      const d=p.drawings.get(id); if (!d) continue;
      pinned.push(d); await residency.pin(d);
    }
    if (!current()) return null;
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=108;
    const g=canvas.getContext('2d')!,s=Math.min(canvas.width/c.width,canvas.height/c.height);
    g.translate((canvas.width-c.width*s)/2,(canvas.height-c.height*s)/2);g.scale(s,s);
    // Explicit planes suppress the optional export stamp in this UI-only preview.
    drawComp(g,p,c,0,{export:true,planes:'all'});
    return canvas.toDataURL('image/png');
  } finally { for (const d of pinned) residency.unpin(d); }
}
