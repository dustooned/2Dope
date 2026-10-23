import type { Comp, CompLayer } from './comp';
import type { Drawing, Parked, Project } from './project';
import type { Residency } from './residency';
import { encodePng, isBlank } from '../io/codec';
import { MAX_COMPS, MAX_DRAWINGS, MAX_VECTORS } from '../io/schema';

/** One source graph, including hidden frames and masks. Shared children remain shared inside the copy. */
export function artworkGraph(p: Project, root: string, copying = true): Comp[] {
  const found = new Map<string, Comp>(), visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('This artwork contains a circular source link.');
    if (found.has(id)) return;
    const c = p.comps.get(id);
    if (!c) throw new Error('An artwork source is missing.');
    visiting.add(id);
    for (const l of c.layers) if (l.kind === 'comp') visit(l.comp);
    visiting.delete(id); found.set(id, c);
  };
  visit(root);
  if (copying && p.comps.size + found.size > MAX_COMPS) throw new Error(`This copy would exceed the project limit of ${MAX_COMPS} comps.`);
  return [...found.values()];
}

export function artworkDrawings(p: Project, graph: Comp[]): Drawing[] {
  const ids = new Set<string>();
  for (const c of graph) for (const l of c.layers) if (l.kind === 'drawings') {
    for (const e of l.exposures) ids.add(e.drawing);
    if (l.mask) ids.add(l.mask);
  }
  const drawings = [...ids].map(id => {
    const d = p.drawings.get(id);
    if (!d) throw new Error('An artwork drawing is missing.');
    return d;
  });
  const used = [...p.usedDrawings()];
  if (used.length + drawings.length > MAX_DRAWINGS) throw new Error('This copy would exceed the project drawing limit.');
  const strokes = used.reduce((n, id) => n + (p.drawings.get(id)?.vectors.length ?? 0), 0);
  if (strokes + drawings.reduce((n, d) => n + d.vectors.length, 0) > MAX_VECTORS) throw new Error('This copy would exceed the project vector stroke limit.');
  return drawings;
}

/** Stored PNGs are immutable. Give the copy its own drawing/canvases on first use, without
 * decoding a whole flipbook. Unsaved resident planes are encoded one drawing at a time. */
export async function snapshotArtwork(d: Drawing, residency: Pick<Residency, 'pin'|'unpin'>): Promise<Parked> {
  if (d.parked) return { ...structuredClone(d.parked), rev: 0 };
  if (d.saved?.rev === d.rev) return {
    rev: 0, line: d.saved.line ? { key: d.saved.line, bytes: null } : null,
    fill: d.saved.fill ? { key: d.saved.fill, bytes: null } : null,
  };
  try {
    await residency.pin(d);
    return { rev: 0,
      line: isBlank(d.line) ? null : { key: null, bytes: await encodePng(d.line) },
      fill: !d.fill || isBlank(d.fill) ? null : { key: null, bytes: await encodePng(d.fill) },
    };
  } finally { residency.unpin(d); }
}

/** Allocate metadata only after snapshots and race checks have succeeded. */
export function copyArtworkGraph(p: Project, graph: Comp[], root: string, drawings: Map<string, string>, placement: CompLayer, preserveNames = false): { comps: Comp[]; root: string; overrides: CompLayer['overrides'] } {
  const used = new Set<string>([...p.comps.keys(), ...p.folders.map(f => f.id)]);
  for (const c of p.comps.values()) {
    for (const l of c.layers) { used.add(l.id); if (l.kind === 'drawings' && l.cel) used.add(l.cel); }
    for (const a of c.audio ?? []) used.add(a.id);
  }
  const fresh = (prefix: string) => { let i = 1; while (used.has(`${prefix}${i}`)) i++; const id = `${prefix}${i}`; used.add(id); return id; };
  const compIds = new Map(graph.map(c => [c.id, fresh('c')]));
  // Older comp copies may reuse layer ids; parents and pins are local to their comp.
  const layerIds = new Map(graph.map(c => [c.id, new Map(c.layers.map(l => [l.id, fresh('L')]))]));
  const cels = new Map<string, string>();
  const overrides = (o: CompLayer['overrides'], child: string) => Object.fromEntries(Object.entries(o).map(([key, value]) => {
    const colon = key.indexOf(':'), id = key.slice(0, colon);
    return [colon < 0 ? key : `${layerIds.get(child)?.get(id) ?? id}${key.slice(colon)}`, structuredClone(value)];
  }));
  const names = new Set([...p.comps.values()].map(c => c.name));
  const comps = graph.map(source => {
    const c = structuredClone(source), ids = layerIds.get(source.id)!;
    c.id = compIds.get(source.id)!;
    let suffix = preserveNames && !names.has(source.name) ? '' : ' copy', n = 2;
    while (names.has(`${source.name.slice(0, 80 - suffix.length)}${suffix}`)) suffix = ` copy ${n++}`;
    c.name = `${source.name.slice(0, 80 - suffix.length)}${suffix}`; names.add(c.name);
    c.pins.forEach(pin => { pin.layer = ids.get(pin.layer) ?? pin.layer; });
    for (const l of c.layers) {
      l.id = ids.get(l.id)!;
      if (l.parent) l.parent = ids.get(l.parent) ?? l.parent;
      if (l.kind === 'comp') { l.overrides = overrides(l.overrides, l.comp); l.comp = compIds.get(l.comp)!; }
      if (l.kind === 'drawings') {
        l.exposures.forEach(e => { e.drawing = drawings.get(e.drawing)!; });
        if (l.mask) l.mask = drawings.get(l.mask)!;
        if (l.cel) { if (!cels.has(l.cel)) cels.set(l.cel, fresh('cel')); l.cel = cels.get(l.cel)!; }
      }
    }
    for (const clip of c.audio ?? []) {
      clip.id = fresh('a');
      if (clip.link) { clip.link.layer = ids.get(clip.link.layer) ?? clip.link.layer; clip.link.drawing = drawings.get(clip.link.drawing) ?? clip.link.drawing; }
    }
    return c;
  });
  return { comps, root: compIds.get(root)!, overrides: overrides(placement.overrides, root) };
}
