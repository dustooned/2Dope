import type { Comp, DrawingsLayer } from './comp';
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
export function syncExposures(srcBefore: Exposure[], srcAfter: Exposure[], member: Exposure[], blank: () => string): Exposure[] {
  const pair = new Map<string, string>();
  const n = Math.min(srcBefore.length, member.length);
  for (let i = 0; i < n; i++) if (!pair.has(srcBefore[i]!.drawing)) pair.set(srcBefore[i]!.drawing, member[i]!.drawing);
  return srcAfter.map((e) => {
    let d = pair.get(e.drawing);
    if (!d) {
      d = blank();
      pair.set(e.drawing, d);
    }
    return { drawing: d, length: e.length };
  });
}

/** True when two layers have the same cels (count and lengths). */
export function sameCels(a: Exposure[], b: Exposure[]): boolean {
  return a.length === b.length && a.every((e, i) => e.length === b[i]!.length);
}
