import type { App } from '../app';
import { COMMANDS_HIDDEN_KEY, readCommandPrefs, setCommandHidden, type CommandPrefs } from '../core/commandprefs';

/**
 * One registry of option-row commands. Each has a permanent id, the rows (contexts) it shows in,
 * a sort key, and what it does. Rows ask `commandsFor` and drop the ones this device hides;
 * a command only calls App methods, never the DOM.
 */
export type CommandContext =
  | 'select' | 'fill' | 'transform' | 'smudge' | 'paint' | 'time' | 'points' | 'adjust'
  | 'layers' | 'assets' | 'board' | 'motion' | 'toolbar';

export interface Command {
  /** Namespaced, permanent: renaming the label never changes this. */
  id: `${string}.${string}`;
  label: string;
  title: string;
  icon?: string;
  contexts: readonly CommandContext[];
  /** Sort key inside a row; keep gaps of 10 so new commands can slot in. */
  order: number;
  run(app: App): void;
  isOn?(app: App): boolean;
  isEnabled?(app: App): boolean;
  /** Later slices: which parameter group this command shows in this context. */
  variant?(app: App): string;
}

const selected = (a: App) => !!a.spatialSelection;
const unselected = (a: App) => !a.spatialSelection;

export const COMMANDS: readonly Command[] = [
  // with something selected
  { id: 'select.transform', label: 'Transform', title: 'Move, size, rotate or flip what is selected (drag the canvas to move)', icon: 'motion', contexts: ['select'], order: 10, run: (a) => a.beginTransform(), isEnabled: selected },
  { id: 'select.fill', label: 'Fill', title: 'Colour everything inside the selection', icon: 'fill', contexts: ['select'], order: 20, run: (a) => a.fillSelectedArea(), isEnabled: selected },
  { id: 'select.copy', label: 'Copy', title: 'Copy what is selected (paste on any drawing)', icon: 'copy', contexts: ['select'], order: 30, run: (a) => a.copyArt(), isEnabled: selected },
  { id: 'select.cut', label: 'Cut', title: 'Copy what is selected and remove it', icon: 'scissors', contexts: ['select'], order: 40, run: (a) => a.cutArt(), isEnabled: selected },
  { id: 'select.duplicate', label: 'Duplicate', title: 'A second copy in place, ready to move', icon: 'layers', contexts: ['select'], order: 50, run: (a) => a.duplicateArt(), isEnabled: selected },
  { id: 'select.copytolayer', label: 'Copy to layer', title: 'Copy what is selected onto a new layer above, on the same frames', icon: 'copylayer', contexts: ['select'], order: 60, run: (a) => a.selectionToNewLayer(false), isEnabled: selected },
  { id: 'select.cuttolayer', label: 'Cut to layer', title: 'Move what is selected onto a new layer above, on the same frames', icon: 'cutlayer', contexts: ['select'], order: 70, run: (a) => a.selectionToNewLayer(true), isEnabled: selected },
  { id: 'select.delete', label: 'Delete', title: 'Remove what is selected', icon: 'trash', contexts: ['select'], order: 80, run: (a) => a.deleteSelectedArt(), isEnabled: selected },
  { id: 'select.invert', label: 'Invert', title: 'Select everything else', icon: 'invert', contexts: ['select'], order: 90, run: (a) => a.invertSelection(), isEnabled: selected },
  { id: 'select.deselect', label: 'Deselect', title: 'Drop the selection', icon: 'deselect', contexts: ['select'], order: 100, run: (a) => a.clearSpatialSelection(), isEnabled: selected },
  // with nothing selected
  { id: 'select.reselect', label: 'Reselect', title: 'Bring back the selection you dropped', icon: 'recent', contexts: ['select'], order: 110, run: (a) => a.reselect(), isEnabled: (a) => a.canReselect },
  { id: 'select.moveall', label: 'Move all', title: 'Move, size or rotate the whole drawing', icon: 'motion', contexts: ['select'], order: 120, run: (a) => a.moveAll(), isEnabled: unselected },
  { id: 'select.selectall', label: 'Select all', title: 'Select everything on this drawing', icon: 'selnew', contexts: ['select'], order: 130, run: (a) => a.invertSelection(), isEnabled: unselected },
  // either way
  { id: 'select.paste', label: 'Paste', title: 'Paste what you copied, ready to move', icon: 'paste', contexts: ['select'], order: 140, run: (a) => a.pasteArt(), isEnabled: (a) => a.hasArtClip },
];

/** Every command registered for a row, enabled or not, in order (for a Customize list). */
export function commandsIn(context: CommandContext): Command[] {
  return COMMANDS.filter((c) => c.contexts.includes(context)).sort((x, y) => x.order - y.order);
}

/** The commands a row shows now, in order: hidden ones are left in, the renderer drops them. */
export function commandsFor(context: CommandContext, app: App): Command[] {
  return commandsIn(context).filter((c) => c.isEnabled?.(app) ?? true);
}

/** The command with this id, if it is registered. */
export function commandById(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------------------------
// This device's hidden set

let prefs: CommandPrefs | null = null;
const listeners = new Set<() => void>();

/** The hidden set, read from this browser once and then kept. */
export function commandPrefs(): CommandPrefs {
  if (!prefs) {
    let saved: unknown = null;
    try { saved = JSON.parse(localStorage.getItem(COMMANDS_HIDDEN_KEY) ?? 'null'); } catch { /* unreadable: nothing hidden */ }
    prefs = readCommandPrefs(saved);
  }
  return prefs;
}

/** Hide or show a command on this device; rows listening redraw. */
export function setHidden(id: string, hidden: boolean): void {
  prefs = setCommandHidden(commandPrefs(), id, hidden);
  try { localStorage.setItem(COMMANDS_HIDDEN_KEY, JSON.stringify(prefs)); } catch { /* kept for this session */ }
  for (const f of listeners) f();
}

/** Called after the hidden set changes. Returns a function that stops listening. */
export function onCommandPrefsChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Forget the cached set so the next read comes from storage (a page that rebuilds the app). */
export function reloadCommandPrefs(): void {
  prefs = null;
}
