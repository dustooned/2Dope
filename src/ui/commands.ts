import type { App } from '../app';
import { COMMANDS_HIDDEN_KEY, readCommandPrefs, setCommandHidden, type CommandPrefs } from '../core/commandprefs';

/**
 * One registry of option-row commands. Each has a permanent id, the rows (contexts) it shows in,
 * a sort key, and what it does. Rows ask `commandsFor` and drop the ones this device hides;
 * a command only calls App methods, never the DOM.
 */
export type CommandContext =
  | 'select' | 'fill' | 'transform' | 'smudge' | 'paint' | 'time' | 'points' | 'adjust'
  | 'layers' | 'assets' | 'board' | 'motion' | 'toolbar' | 'canvas' | 'frame';

export interface Command {
  /** Namespaced, permanent: renaming the label never changes this. */
  id: `${string}.${string}`;
  label: string;
  /** How Customize and App settings name it, when the chip's label is a symbol such as − or 2. */
  name?: string;
  title: string;
  icon?: string;
  contexts: readonly CommandContext[];
  /** Sort key inside a row; keep gaps of 10 so new commands can slot in. */
  order: number;
  run(app: App): void;
  isOn?(app: App): boolean;
  isEnabled?(app: App): boolean;
  /** Label, title or icon that follow app state; the fields above are the defaults. */
  face?(app: App): { label?: string; title?: string; icon?: string };
  /** Later slices: which parameter group this command shows in this context. */
  variant?(app: App): string;
}

const selected = (a: App) => !!a.spatialSelection;
const unselected = (a: App) => !a.spatialSelection;
const transforming = (a: App) => !!a.transformParams;
const xp = (a: App) => a.transformParams!;
const ROLE_TITLES = { key: 'A key drawing: the main poses of the move', breakdown: 'A breakdown: the drawing that shapes the move between two keys', inbetween: 'An in-between: fills the gaps so the move is smooth' } as const;

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

  // Transform: while something is being moved, sized or rotated
  { id: 'transform.apply', label: 'Apply', title: 'Keep it (Enter)', icon: 'check', contexts: ['transform'], order: 10, run: (a) => a.applyTransform(), isEnabled: transforming },
  { id: 'transform.cancel', label: 'Cancel', title: 'Put it back (Esc)', icon: 'close', contexts: ['transform'], order: 20, run: (a) => a.cancelTransform(), isEnabled: transforming },
  { id: 'transform.freeform', label: 'Freeform', title: 'Uniform: corners keep proportions. Tap for freeform', icon: 'freeform', contexts: ['transform'], order: 30, run: (a) => { a.transformFreeform = !a.transformFreeform; }, isOn: (a) => a.transformFreeform, isEnabled: transforming, face: (a) => (a.transformFreeform ? { title: 'Freeform: corners stretch freely. Tap for uniform' } : {}) },
  { id: 'transform.smaller', label: '−', name: 'Smaller', title: 'Smaller', contexts: ['transform'], order: 40, run: (a) => a.setTransform({ scale: xp(a).scale / 1.1 }), isEnabled: transforming },
  { id: 'transform.bigger', label: '+', name: 'Bigger', title: 'Bigger', contexts: ['transform'], order: 50, run: (a) => a.setTransform({ scale: xp(a).scale * 1.1 }), isEnabled: transforming },
  { id: 'transform.rotateleft', label: '⟲45', name: 'Rotate left 45°', title: 'Rotate left 45°', contexts: ['transform'], order: 60, run: (a) => a.setTransform({ rotate: xp(a).rotate - 45 }), isEnabled: transforming },
  { id: 'transform.rotateright', label: '⟳45', name: 'Rotate right 45°', title: 'Rotate right 45°', contexts: ['transform'], order: 70, run: (a) => a.setTransform({ rotate: xp(a).rotate + 45 }), isEnabled: transforming },
  { id: 'transform.fliph', label: 'Flip ↔', title: 'Mirror left to right', icon: 'fliph', contexts: ['transform'], order: 80, run: (a) => a.flipTransform('h'), isOn: (a) => !!a.transformParams?.flipH, isEnabled: transforming },
  { id: 'transform.flipv', label: 'Flip ↕', title: 'Mirror top to bottom', icon: 'flipv', contexts: ['transform'], order: 90, run: (a) => a.flipTransform('v'), isOn: (a) => !!a.transformParams?.flipV, isEnabled: transforming },
  { id: 'transform.fit', label: 'Fit', title: 'Fit to the page', icon: 'fit', contexts: ['transform'], order: 100, run: (a) => a.fitTransform(), isEnabled: transforming },
  { id: 'transform.reset', label: 'Reset', title: 'Back to where it started', icon: 'undo', contexts: ['transform'], order: 110, run: (a) => a.resetTransform(), isEnabled: transforming },

  // Timing: how long the drawing stays, and what kind of drawing it is
  ...([1, 2, 3, 4] as const).map((n): Command => ({ id: `time.hold${n}`, label: `${n}`, name: `Hold for ${n}`, title: `Show this drawing for ${n} frame${n > 1 ? 's' : ''} (animators call it “on ${['ones', 'twos', 'threes', 'fours'][n - 1]}”)`, contexts: ['time'], order: n * 10, run: (a) => a.setExposure(n), isOn: (a) => a.currentHold === n })),
  { id: 'time.shorter', label: '−', name: 'One frame shorter', title: 'One frame shorter', contexts: ['time'], order: 50, run: (a) => a.changeHold(-1) },
  { id: 'time.longer', label: '+', name: 'One frame longer', title: 'One frame longer', contexts: ['time'], order: 60, run: (a) => a.changeHold(1) },
  ...([['key', 'Key', 70], ['breakdown', 'Breakdown', 80], ['inbetween', 'In-between', 90]] as const).map(([r, label, order]): Command => ({ id: `time.${r}`, label, title: ROLE_TITLES[r], contexts: ['time'], order, run: (a) => a.setRole(r), isOn: (a) => a.currentRole === r })),

  // Fill
  { id: 'fill.swap', label: 'Swap', title: 'Swap the two colours', contexts: ['fill'], order: 10, run: (a) => a.swapColors(), isEnabled: (a) => a.fillStyle !== 'solid' },
  { id: 'fill.selection', label: 'Fill selection', title: 'Colour everything inside the selection', contexts: ['fill'], order: 20, run: (a) => a.fillSelectedArea(), isEnabled: selected },

  // Smudge
  { id: 'smudge.softer', label: 'Softer', title: 'Carry less paint', icon: 'thinner', contexts: ['smudge'], order: 10, run: (a) => { a.smudgeStrength = Math.max(0.1, a.smudgeStrength - 0.1); } },
  { id: 'smudge.stronger', label: 'Stronger', title: 'Carry more paint', icon: 'thicker', contexts: ['smudge'], order: 20, run: (a) => { a.smudgeStrength = Math.min(1, a.smudgeStrength + 0.1); } },

  // Brush and Vector
  { id: 'paint.inkpaint', label: 'Ink & Paint', title: 'Ink & Paint: fill newly closed areas after inking. Existing paint stays.', icon: 'inkpaint', contexts: ['paint'], order: 10, run: (a) => a.setInkPaint(!a.inkPaint.enabled), isOn: (a) => a.inkPaint.enabled, isEnabled: (a) => a.studentUI.controls.inkPaint, face: (a) => (a.autoPaintSupported ? {} : { title: 'Ink & Paint: this page exceeds the automatic paint limit for this device.' }) },
  { id: 'paint.editpoints', label: 'Edit points', title: 'Drag the corners and bends of a vector line; set its thickness', contexts: ['paint'], order: 20, run: (a) => { a.enterPointEdit(); }, isEnabled: (a) => a.tool === 'pen' && a.drawing.vectors.some((v) => v.tool === 'pen') },

  // Editing a vector line's points
  { id: 'points.toggle', label: 'Curved point', name: 'Straight / curved point', title: 'Tap a point first; hold a point to switch it', icon: 'curvept', contexts: ['points'], order: 10, run: (a) => a.togglePoint(), isOn: (a) => a.pointSelMode === 'straight',
    face: (a) => ({ ...(a.pointSelMode === 'straight' ? { label: 'Straight point', icon: 'straightpt' } : {}), ...(a.pointSelMode ? { title: 'Switch this point between straight and curved (or hold the point)' } : {}) }) },
  { id: 'points.allstraight', label: 'All straight', title: 'Make every point straight: clean lines between the corners', icon: 'allstraight', contexts: ['points'], order: 20, run: (a) => a.straightenAllPoints() },
  { id: 'points.widthscope', label: 'Width: whole line', name: 'Width: whole line, point or sections', title: 'Width for the whole line. Tap to switch: whole line, point, sections', icon: 'wline', contexts: ['points'], order: 30, run: (a) => a.setPointWidthScope(a.pointWidthScope === 'all' ? 'point' : a.pointWidthScope === 'point' ? 'section' : 'all'), isOn: (a) => a.pointWidthScope !== 'all',
    face: (a) => a.pointWidthScope === 'point' ? { label: 'Width: this point', title: 'Width for the chosen point. Tap to switch: whole line, point, sections', icon: 'wpoint' }
      : a.pointWidthScope === 'section' ? { label: 'Width: sections', title: 'Width for the sections you tap. Tap to switch: whole line, point, sections', icon: 'wsection' } : {} },
  { id: 'points.done', label: 'Done', title: 'Finish editing points (Enter, or tap empty canvas)', icon: 'check', contexts: ['points'], order: 40, run: (a) => a.exitPointEdit() },
];

/**
 * Context-menu entries this device can hide. The menus still build their own items (with these ids);
 * the registry only names them, so Customize and App settings can list them.
 */
export interface MenuEntry { id: `${string}.${string}`; name: string; contexts: readonly CommandContext[]; order: number }

export const MENU_ENTRIES: readonly MenuEntry[] = [
  ...([
    ['pickcolour', 'Pick this colour'], ['undo', 'Undo'], ['redo', 'Redo'], ['showlines', 'Show lines'], ['showfills', 'Show colour (fills)'],
    ['onion', 'Onion skin'], ['newpage', 'New page after the last drawing'], ['scrublock', 'Scrub lock here'], ['fit', 'Fit view'], ['flipview', 'Flip view'],
  ] as const).map(([k, name], i): MenuEntry => ({ id: `canvas.${k}`, name, contexts: ['canvas'], order: (i + 1) * 10 })),
  ...([
    ['duplicate', 'Duplicate'], ['insertafter', 'Insert frame after'], ['insertbefore', 'Insert frame before'], ['split', 'Split here'], ['filltoend', 'Fill to the end'],
    ['copy', 'Copy'], ['cut', 'Cut'], ['paste', 'Paste (same drawings)'], ['pastenew', 'Paste as new drawings'], ['earlier', 'Move earlier'], ['later', 'Move later'],
    ['clear', 'Clear frame'], ['delete', 'Delete'],
  ] as const).map(([k, name], i): MenuEntry => ({ id: `frame.${k}`, name, contexts: ['frame'], order: (i + 1) * 10 })),
];

/** Where a hidden control lives, for App settings. */
export const CONTEXT_NAMES: Partial<Record<CommandContext, string>> = { select: 'Select row', transform: 'Transform row', time: 'Timing row', fill: 'Fill row', smudge: 'Smudge row', paint: 'Brush row', points: 'Edit points row', canvas: 'canvas menu', frame: 'frame menu' };

/** What a menu or list calls the command. */
export function commandName(c: Command): string {
  return c.name ?? c.label;
}

/** Everything a Customize list offers for one row or menu: id and name, in order. */
export function customizable(context: CommandContext): { id: string; name: string }[] {
  return [...commandsIn(context).map((c) => ({ id: c.id, name: commandName(c), order: c.order })), ...MENU_ENTRIES.filter((m) => m.contexts.includes(context))]
    .sort((x, y) => x.order - y.order).map(({ id, name }) => ({ id, name }));
}

/** A hidden control's name and where it lives (App settings), or null when the id is unknown. */
export function controlInfo(id: string): { name: string; where: string } | null {
  const c = commandById(id), m = c ? null : MENU_ENTRIES.find((x) => x.id === id);
  const ctx = c?.contexts[0] ?? m?.contexts[0];
  if (!ctx) return null;
  return { name: c ? commandName(c) : m!.name, where: CONTEXT_NAMES[ctx] ?? ctx };
}

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
