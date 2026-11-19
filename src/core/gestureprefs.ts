import { DISABLEABLE_GESTURES } from './gestures';

/**
 * Which gestures this device has turned off. Device-local like the command and QuickMenu
 * preferences: never in the project file and never part of a student profile.
 */
export const GESTURES_KEY = '2dope.gestures.v1';
/** At most this many ids are kept. */
export const GESTURE_PREFS_LIMIT = 16;

export interface GesturePrefs {
  /** Ids of gestures turned off. Only gestures the user may disable are accepted. */
  disabled: string[];
}

/** Saved preferences, sanitised: unknown ids dropped, duplicates removed, capped. */
export function readGesturePrefs(saved: unknown): GesturePrefs {
  const list = saved && typeof saved === 'object' && Array.isArray((saved as { disabled?: unknown }).disabled) ? (saved as { disabled: unknown[] }).disabled : [];
  const disabled: string[] = [];
  for (const id of list.slice(0, 200)) {
    if (typeof id !== 'string' || id.length > 40 || !DISABLEABLE_GESTURES.includes(id) || disabled.includes(id)) continue;
    disabled.push(id);
    if (disabled.length >= GESTURE_PREFS_LIMIT) break;
  }
  return { disabled };
}

export function isGestureEnabled(prefs: GesturePrefs, id: string): boolean {
  return !prefs.disabled.includes(id);
}

/** A copy with this gesture turned on or off. */
export function setGestureEnabled(prefs: GesturePrefs, id: string, enabled: boolean): GesturePrefs {
  const rest = prefs.disabled.filter((x) => x !== id);
  return readGesturePrefs({ disabled: enabled ? rest : [...rest, id] });
}
