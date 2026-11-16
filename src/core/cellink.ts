import type { Comp, DrawingsLayer, Layer } from './comp';
import type { Exposure } from './timeline';

/**
 * Linked art layers ("cel layers"): drawings layers that share one `cel` group always have the
 * same cels with the same timing, each layer with its own drawings. Add, delete, move or retime a
 * cel on any of them and the others follow, so a character can have ink, colour and extra art on
 * separate layers without anyone having to keep their timing in step by hand.
 */

/** The other layers in `layerId`'s cel group (same comp, same group, drawings only). */
export function celMembers(comp: Comp, layerId: string): DrawingsLayer[] {
  const me = comp.layers.find((l) => l.id === layerId);
  if (!me || me.kind !== 'drawings' || !me.cel) return [];
  return comp.layers.filter((l): l is DrawingsLayer => l.kind === 'drawings' && l.id !== layerId && l.cel === me.cel);
}

/**
 * A member's exposures after the edited layer went from `srcBefore` to `srcAfter`. Cels are paired
 * by position before the edit, so each of the edited layer's drawings maps to the member's drawing
 * in the same cel; reusing a drawing reuses its partner, and a new drawing gets a new blank one.
 * Only the timing and drawings follow; the member keeps its own art.
 */
export function syncExposures(srcBefore: Exposure[], srcAfter: Exposure[], member: Exposure[], blank: (srcDrawing: string, partnerOf: (id: string) => string | undefined) => string): Exposure[] {
  const pair = new Map<string, string>();
  const n = Math.min(srcBefore.length, member.length);
  for (let i = 0; i < n; i++) if (!pair.has(srcBefore[i]!.drawing)) pair.set(srcBefore[i]!.drawing, member[i]!.drawing);
  return srcAfter.map((e) => {
    let d = pair.get(e.drawing);
    if (!d) {
      d = blank(e.drawing, (id) => pair.get(id));
      pair.set(e.drawing, d);
    }
    return { drawing: d, length: e.length };
  });
}

/** True when two layers have the same cels (count and lengths). */
export function sameCels(a: Exposure[], b: Exposure[]): boolean {
  return a.length === b.length && a.every((e, i) => e.length === b[i]!.length);
}

const timingOf = (l: DrawingsLayer) => JSON.stringify([l.start, l.in, l.out, l.exposures.map((e) => [e.drawing, e.length])]);
const cellsOf = (l: DrawingsLayer) => JSON.stringify([l.start, l.in, l.out, l.exposures.map((e) => e.length)]);

/**
 * After any layer edit (Motion trims and moves, ripples, duplicates): put every cel group back in
 * step. The member whose timing changed leads; the others take its start, in, out and cels, each
 * keeping its own drawings. Returns the fixed layers, or null when nothing needed fixing.
 */
export function syncCelGroups(before: Layer[], after: Layer[], blank: (srcDrawing: string, partnerOf: (id: string) => string | undefined) => string): Layer[] | null {
  const was = new Map(before.map((l) => [l.id, l]));
  const groups = new Map<string, DrawingsLayer[]>();
  for (const l of after) if (l.kind === 'drawings' && l.cel) groups.set(l.cel, [...(groups.get(l.cel) ?? []), l]);
  let out: Layer[] | null = null;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const lead = members.find((m) => {
      const b = was.get(m.id);
      return !b || b.kind !== 'drawings' || timingOf(b) !== timingOf(m);
    });
    if (!lead) continue;
    const leadBefore = was.get(lead.id);
    for (const m of members) {
      if (m === lead || cellsOf(m) === cellsOf(lead)) continue;
      const mBefore = was.get(m.id);
      const base = leadBefore && leadBefore.kind === 'drawings' ? leadBefore.exposures : lead.exposures;
      const own = mBefore && mBefore.kind === 'drawings' ? mBefore.exposures : m.exposures;
      const fixed: DrawingsLayer = { ...m, start: lead.start, in: lead.in, out: lead.out, exposures: syncExposures(base, lead.exposures, own, blank) };
      out ??= [...after];
      out[out.indexOf(m)] = fixed;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Painted tracks: a cel group whose members are the paint layers of every frame. The rail shows
// the group as one track (its lead); Draw's Layers panel lists the members (one frame's layers).

/** Layers a painted frame may hold (Lite keeps memory low). */
export const PAINTED_MAX = { lite: 3, full: 8 } as const;

export function isPainted(l: Layer | undefined | null): boolean {
  return !!l && l.kind === 'drawings' && !!l.painted && !!l.cel;
}

/** Every member of `layerId`'s cel group, itself included, in stack order (front first). */
export function groupOf(layers: Layer[], layerId: string): DrawingsLayer[] {
  const me = layers.find((l) => l.id === layerId);
  if (!me || me.kind !== 'drawings') return [];
  if (!me.cel) return [me];
  return layers.filter((l): l is DrawingsLayer => l.kind === 'drawings' && l.cel === me.cel);
}

/** The member that stands for a painted track: the one whose id is the group id, else the bottom one. */
export function paintedLead(layers: Layer[], layer: DrawingsLayer): DrawingsLayer {
  if (!isPainted(layer)) return layer;
  const g = groupOf(layers, layer.id).filter((m) => m.painted);
  return g.find((m) => m.id === layer.cel) ?? g[g.length - 1] ?? layer;
}

/** Rail tracks: a painted track's other members fold into its lead. */
export function railTracks(layers: Layer[], tracks: DrawingsLayer[]): DrawingsLayer[] {
  return tracks.filter((l) => !isPainted(l) || paintedLead(layers, l) === l);
}

/**
 * The drawings of a painted frame, bottom first (the order to composite them): the cel of `layer`
 * at exposure index `i` on every visible member. A plain layer gives just its own drawing.
 */
export function stackAt(layers: Layer[], layer: DrawingsLayer, i: number, visibleOnly = true): string[] {
  const own = layer.exposures[i]?.drawing;
  if (!isPainted(layer)) return own ? [own] : [];
  const out: string[] = [];
  for (const m of groupOf(layers, layer.id)) {
    if (!m.painted || (visibleOnly && !m.visible)) continue;
    const d = m.exposures[i]?.drawing;
    if (d) out.push(d);
  }
  return out.reverse();
}

/**
 * Make a layer's track painted (or plain again): the layer joins/starts its cel group and every
 * member takes the flag. Returns the new layers, or null when nothing changes.
 */
export function setPainted(layers: Layer[], layerId: string, on: boolean): Layer[] | null {
  const me = layers.find((l) => l.id === layerId);
  if (!me || me.kind !== 'drawings' || me.guide || me.adjust || me.title || me.caption || me.video) return null;
  const group = me.cel ?? me.id;
  let changed = false;
  const out = layers.map((l) => {
    if (l.kind !== 'drawings' || (l.id !== layerId && (!me.cel || l.cel !== me.cel))) return l;
    if (!!l.painted === on && l.cel === group) return l;
    changed = true;
    const x: DrawingsLayer = { ...l, cel: group };
    if (on) x.painted = true; else delete x.painted;
    return x;
  });
  return changed ? out : null;
}

/**
 * Move a whole group by `steps` rail tracks (up negative), keeping its members together in their
 * order. `tracks` are the rail's tracks (leads), front first. Returns the new layers or null.
 */
export function moveGroup(layers: Layer[], tracks: DrawingsLayer[], leadId: string, steps: number): Layer[] | null {
  const i = tracks.findIndex((t) => t.id === leadId);
  const j = Math.max(0, Math.min(tracks.length - 1, i + steps));
  if (i < 0 || i === j) return null;
  const members = groupOf(layers, leadId);
  const ids = new Set(members.map((m) => m.id));
  const rest = layers.filter((l) => !ids.has(l.id));
  const target = tracks[j]!;
  const paintedTarget = !!target.painted && !!target.cel;
  const targetGroup = new Set(groupOf(layers, target.id).filter((m) => paintedTarget || m.id === target.id).map((m) => m.id));
  const first = rest.findIndex((l) => targetGroup.has(l.id));
  if (first < 0) return null;
  let last = first;
  rest.forEach((l, k) => { if (targetGroup.has(l.id)) last = k; });
  const at = steps < 0 ? first : last + 1;
  return [...rest.slice(0, at), ...members, ...rest.slice(at)];
}
