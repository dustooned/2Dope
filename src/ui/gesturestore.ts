import { GESTURES_KEY, isGestureEnabled, readGesturePrefs, setGestureEnabled, type GesturePrefs } from '../core/gestureprefs';

/** The gesture preferences on this device (not in the project file). Read once, then kept in step with other tabs. */
let cache: GesturePrefs | null = null;

export function gesturePrefs(): GesturePrefs {
  if (cache) return cache;
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(GESTURES_KEY) ?? 'null'); } catch { /* unreadable: nothing is off */ }
  cache = readGesturePrefs(saved);
  return cache;
}

function save(prefs: GesturePrefs): void {
  cache = prefs;
  try { localStorage.setItem(GESTURES_KEY, JSON.stringify(prefs)); } catch { /* kept for this session */ }
}

/** True unless the user turned this gesture off on this device. */
export function gestureOn(id: string): boolean {
  return isGestureEnabled(gesturePrefs(), id);
}

export function setGestureOn(id: string, on: boolean): void {
  save(setGestureEnabled(gesturePrefs(), id, on));
}

export function resetGestures(): void {
  save({ disabled: [] });
}

if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === GESTURES_KEY) cache = null; });
