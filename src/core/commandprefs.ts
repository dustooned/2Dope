/**
 * Which option-row commands this device hides. Device-local like the QuickMenu and student
 * preferences, never in the project file and never part of a student profile.
 */
export const COMMANDS_HIDDEN_KEY = '2dope.commands.hidden';
/** At most this many hidden ids are kept. */
export const HIDDEN_LIMIT = 200;

export interface CommandPrefs {
  hidden: string[];
  /**
   * The user's order of a row's commands, by context (missing = the built-in order). Commands
   * not listed keep their built-in place after the listed ones. Older builds ignore it.
   */
  order?: Record<string, string[]>;
}

/** A row or menu context name. */
const CONTEXT = /^[a-z][a-z0-9]{0,31}$/;
/** At most this many commands per row order, and this many rows. */
const ORDER_LIMIT = 60;
const ORDER_ROWS = 40;

/** A command id: `namespace.name`, lower case. */
const ID = /^[a-z][a-z0-9]*\.[a-z][a-z0-9-]*$/;

/** Saved preferences, sanitised: malformed ids dropped, duplicates removed, capped. */
export function readCommandPrefs(saved: unknown): CommandPrefs {
  const list = saved && typeof saved === 'object' && Array.isArray((saved as { hidden?: unknown }).hidden) ? (saved as { hidden: unknown[] }).hidden : [];
  const hidden: string[] = [];
  for (const id of list) {
    if (typeof id !== 'string' || id.length > 64 || !ID.test(id) || hidden.includes(id)) continue;
    hidden.push(id);
    if (hidden.length >= HIDDEN_LIMIT) break;
  }
  const rawOrder = saved && typeof saved === 'object' ? (saved as { order?: unknown }).order : undefined;
  const order: Record<string, string[]> = {};
  if (rawOrder && typeof rawOrder === 'object' && !Array.isArray(rawOrder)) {
    for (const [ctx, ids] of Object.entries(rawOrder as Record<string, unknown>).slice(0, ORDER_ROWS)) {
      if (!CONTEXT.test(ctx) || !Array.isArray(ids)) continue;
      const list = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length <= 64 && ID.test(x)))].slice(0, ORDER_LIMIT);
      if (list.length) order[ctx] = list;
    }
  }
  return Object.keys(order).length ? { hidden, order } : { hidden };
}

/** A row's commands in the user's order: listed ones first (as listed), the rest in their built-in order. */
export function orderCommands<T extends { id: string }>(prefs: CommandPrefs, context: string, commands: T[]): T[] {
  const want = prefs.order?.[context];
  if (!want?.length) return commands;
  const rank = new Map(want.map((id, i) => [id, i]));
  return commands
    .map((c, i) => ({ c, k: rank.has(c.id) ? rank.get(c.id)! : want.length + i }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.c);
}

/** A copy with this row's order set (an empty list puts the built-in order back). */
export function setCommandOrder(prefs: CommandPrefs, context: string, ids: string[]): CommandPrefs {
  const order = { ...(prefs.order ?? {}) };
  if (ids.length) order[context] = ids;
  else delete order[context];
  return readCommandPrefs({ ...prefs, order });
}

export function isCommandHidden(prefs: CommandPrefs, id: string): boolean {
  return prefs.hidden.includes(id);
}

/** A copy with this command hidden or shown. */
export function setCommandHidden(prefs: CommandPrefs, id: string, hidden: boolean): CommandPrefs {
  const rest = prefs.hidden.filter((x) => x !== id);
  return readCommandPrefs({ ...prefs, hidden: hidden ? [...rest, id] : rest });
}
