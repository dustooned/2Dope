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
