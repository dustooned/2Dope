/**
 * Favourite and recently used effects for the Add effect list: small, device-only lists of effect
 * ids, read defensively (a stored list may be from an older version or damaged).
 */
export const FAVS_KEY = '2dope.effects.favs';
export const RECENT_KEY = '2dope.effects.recent';
export const MAX_FAVS = 12;
export const MAX_RECENT = 6;

/** Ids from stored JSON: strings that name a real effect, no repeats, at most `max`. */
export function readEffectIds(raw: unknown, valid: readonly string[], max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) if (typeof x === 'string' && valid.includes(x) && !out.includes(x)) { out.push(x); if (out.length >= max) break; }
  return out;
}

/** The favourites with `id` added at the end (if there is room) or taken out when it was already one. */
export function toggleFavourite(favs: readonly string[], id: string): string[] {
  if (favs.includes(id)) return favs.filter((x) => x !== id);
  return favs.length >= MAX_FAVS ? [...favs] : [...favs, id];
}

/** The recent list with `id` moved to the front (newest first), no repeats, cut to the limit. */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
}
