/**
 * Which option-row commands this device hides. Device-local like the QuickMenu and student
 * preferences, never in the project file and never part of a student profile.
 */
export const COMMANDS_HIDDEN_KEY = '2dope.commands.hidden';
/** At most this many hidden ids are kept. */
export const HIDDEN_LIMIT = 200;

export interface CommandPrefs {
  hidden: string[];
}

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
  return { hidden };
}

export function isCommandHidden(prefs: CommandPrefs, id: string): boolean {
  return prefs.hidden.includes(id);
}

/** A copy with this command hidden or shown. */
export function setCommandHidden(prefs: CommandPrefs, id: string, hidden: boolean): CommandPrefs {
  const rest = prefs.hidden.filter((x) => x !== id);
  return readCommandPrefs({ hidden: hidden ? [...rest, id] : rest });
}
