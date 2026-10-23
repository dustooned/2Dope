/** Device preferences only; these actions operate on the existing App/document. */
export const QUICK_MENU_KEY = '2dope.quickmenu';
export const QUICK_ACTIONS = [
  { id: 'none', label: 'Empty slot', icon: 'more' },
  { id: 'undo', label: 'Undo', icon: 'undo' },
  { id: 'redo', label: 'Redo', icon: 'redo' },
  { id: 'brush', label: 'Brush', icon: 'brush' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser' },
  { id: 'eyedropper', label: 'Eyedropper', icon: 'eyedrop' },
  { id: 'newFrame', label: 'New frame', icon: 'flipbook' },
  { id: 'flipView', label: 'Flip view', icon: 'fliph' },
  { id: 'fitView', label: 'Fit canvas', icon: 'fit' },
  { id: 'resetRotation', label: 'Reset rotation', icon: 'resetrotation' },
  { id: 'pen', label: 'Vector', icon: 'pen' },
  { id: 'smudge', label: 'Smudge', icon: 'smudge' },
  { id: 'fill', label: 'Bucket fill', icon: 'fill' },
  { id: 'plane', label: 'Line / Fill', icon: 'lineplane' },
  { id: 'inkPaint', label: 'Ink & Paint', icon: 'inkpaint' },
  { id: 'colour', label: 'Colour', icon: 'palette' },
  { id: 'brushes', label: 'Brushes', icon: 'brushes' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'assets', label: 'My Assets', icon: 'gallery' },
  { id: 'duplicate', label: 'Duplicate drawing', icon: 'copy' },
  { id: 'previous', label: 'Previous frame', icon: 'prev' },
  { id: 'next', label: 'Next frame', icon: 'next' },
  { id: 'play', label: 'Play / pause', icon: 'play' },
  { id: 'onion', label: 'Onion skin', icon: 'onion' },
] as const;
export type QuickAction = typeof QUICK_ACTIONS[number]['id'];
export interface QuickMenuPrefs { showButton: boolean; edge: 'left' | 'right'; actions: QuickAction[] }
export function defaultQuickMenu(): QuickMenuPrefs {
  return { showButton: true, edge: 'right', actions: ['undo', 'redo', 'eraser', 'eyedropper', 'newFrame', 'flipView'] };
}
export function readQuickMenu(value: unknown): QuickMenuPrefs {
  const out = defaultQuickMenu();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  if (typeof v.showButton === 'boolean') out.showButton = v.showButton;
  if (v.edge === 'left' || v.edge === 'right') out.edge = v.edge;
  if (Array.isArray(v.actions)) for (let i = 0; i < 6; i++) {
    const id = v.actions[i];
    if (QUICK_ACTIONS.some(a => a.id === id)) out.actions[i] = id as QuickAction;
  }
  return out;
}
