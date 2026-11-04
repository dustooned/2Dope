import type { Workspace } from './workspace';

/** Device preferences only: these never describe artwork or enter document History. */
export const WORKSPACE_LAYOUT_KEY = '2dope.workspace.layouts';
export const WORKSPACE_NAMES: Record<Workspace, string> = { board: 'Story', draw: 'Draw', animate: 'Animate', time: 'Timing', motion: 'Motion' };
export const WORKSPACE_TOOLS = {
  // the animation actions (play, onion, step, new / duplicate / delete drawing, effects) can be pinned too
  draw: ['brush', 'smudge', 'eraser', 'eyedrop', 'select', 'transform', 'pen', 'fill', 'adjust', 'color', 'layers', 'reference', 'play', 'onion', 'prevdraw', 'nextdraw', 'insert', 'dup', 'del', 'fx', 'safeareas', 'centrecross', 'overscan'],
  animate: ['brush', 'smudge', 'eraser', 'eyedrop', 'select', 'transform', 'pen', 'fill', 'adjust', 'assets', 'color', 'layers', 'reference', 'play', 'onion', 'prevdraw', 'nextdraw', 'insert', 'dup', 'del', 'fx', 'safeareas', 'centrecross', 'overscan'],
  board: ['brush', 'eraser', 'color', 'panel', 'images', 'dup', 'del', 'play', 'export'],
  time: ['play', 'onion', 'insert', 'dup', 'del', 'layers'],
  motion: ['addlayer', 'camera', 'group', 'split', 'autokey', 'look', 'flipbook', 'fx', 'safeareas', 'centrecross', 'overscan'],
} as const;
export type WorkspaceTool = typeof WORKSPACE_TOOLS[Workspace][number];
export const WORKSPACE_TOOL_NAMES: Record<WorkspaceTool, string> = {
  brush: 'Brush', smudge: 'Smudge', eraser: 'Eraser', select: 'Select', transform: 'Transform',
  pen: 'Vector', fill: 'Bucket fill', adjust: 'Adjustments', color: 'Colour', layers: 'Layers',
  reference: 'Reference', assets: 'Move assets', panel: 'New panel', images: 'Import panels',
  dup: 'Duplicate', del: 'Delete', play: 'Play', export: 'Share storyboard / animatic', onion: 'Onion skin',
  insert: 'New drawing', addlayer: 'New layer', camera: 'Camera', group: 'Group', split: 'Split',
  autokey: 'Auto-key', look: 'Camera view', flipbook: 'Edit flipbook', fx: 'Effects',
  prevdraw: 'Previous drawing', nextdraw: 'Next drawing', eyedrop: 'Eyedropper',
  safeareas: 'Title safe', centrecross: 'Centre cross', overscan: 'Overscan',
};
export interface WorkspaceLayout {
  tools: WorkspaceTool[];
  toolDock: 'top' | 'left' | 'right';
  brushEdge: 'left' | 'right';
  labels: boolean;
  advancedTargets: boolean;
  /** Every tool this mode offered when the layout was saved: a default added later joins the bar once. */
  seen?: string[];
}

/** What each mode offered before layouts remembered it (saves without `seen`). */
const SEEN_BEFORE: Record<Workspace, readonly string[]> = {
  draw: ['brush', 'smudge', 'eraser', 'select', 'transform', 'pen', 'fill', 'adjust', 'color', 'layers', 'reference', 'play', 'onion', 'prevdraw', 'nextdraw', 'insert', 'dup', 'del', 'fx'],
  animate: ['brush', 'smudge', 'eraser', 'select', 'transform', 'pen', 'fill', 'adjust', 'assets', 'color', 'layers', 'reference', 'play', 'onion', 'prevdraw', 'nextdraw', 'insert', 'dup', 'del', 'fx'],
  board: ['panel', 'images', 'dup', 'del', 'play', 'export'],
  time: ['play', 'onion', 'insert', 'dup', 'del', 'layers'],
  motion: ['addlayer', 'camera', 'group', 'split', 'autokey', 'look', 'flipbook', 'fx'],
};
export type WorkspaceLayouts = Record<Workspace, WorkspaceLayout>;
export function defaultWorkspaceLayout(ws: Workspace): WorkspaceLayout {
  return { tools: ws === 'draw' ? ['brush', 'eraser', 'color', 'select', 'transform', 'smudge', 'eyedrop', 'layers']
    : ws === 'animate' ? ['brush', 'eraser', 'color', 'select', 'assets', 'eyedrop', 'layers']
    // Timing: Play, onion and frame actions already have homes (transport, X-sheet); they can be pinned
    : ws === 'time' ? ['layers'] : ws === 'board' ? ['brush', 'eraser', 'color'] : ['look', 'safeareas', 'centrecross', 'overscan'],
  toolDock: 'top', brushEdge: 'left', labels: false, advancedTargets: false, seen: [...WORKSPACE_TOOLS[ws]] };
}
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function readWorkspaceLayouts(value: unknown): WorkspaceLayouts {
  const source = obj(value), out = {} as WorkspaceLayouts;
  for (const ws of Object.keys(WORKSPACE_NAMES) as Workspace[]) {
    const v = obj(source[ws]), d = defaultWorkspaceLayout(ws), allowed: readonly string[] = WORKSPACE_TOOLS[ws];
    let tools = Array.isArray(v.tools) ? [...new Set(v.tools.slice(0, 40).filter((x): x is WorkspaceTool => typeof x === 'string' && allowed.includes(x)))] : d.tools;
    // a default tool that is new since this layout was saved joins the end of the bar once (Edit tool bar can take it off again)
    const seen = Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === 'string') : SEEN_BEFORE[ws];
    // Only the untouched former Story default moves to the sketch bar. Custom bars keep their actions.
    const oldStory = SEEN_BEFORE.board;
    if (ws === 'board' && !seen.includes('brush') && v.labels !== true && !v.advancedTargets && (v.toolDock === undefined || v.toolDock === 'top') && tools.length === oldStory.length && tools.every((t, i) => t === oldStory[i])) tools = [...d.tools];
    const oldPaint = ws === 'draw' ? ['brush', 'smudge', 'eraser', 'eyedrop', 'select', 'transform', 'layers', 'color']
      : ws === 'animate' ? ['brush', 'eraser', 'eyedrop', 'select', 'assets', 'layers', 'color'] : [];
    if (oldPaint.length && v.labels !== true && !v.advancedTargets && (v.toolDock === undefined || v.toolDock === 'top') &&
      tools.length === oldPaint.length && tools.every((t, i) => t === oldPaint[i])) tools = [...d.tools];
    // Motion commands now live in its shared header; only an untouched old bar becomes view tools.
    if (ws === 'motion' && v.labels !== true && !v.advancedTargets && (v.toolDock === undefined || v.toolDock === 'top') &&
      [SEEN_BEFORE.motion, WORKSPACE_TOOLS.motion].some(old => tools.length === old.length && tools.every((t, i) => t === old[i]))) tools = [...d.tools];
    if (Array.isArray(v.tools)) for (const t of d.tools) if (!seen.includes(t) && !tools.includes(t)) tools.push(t);
    // A recoverable painting tool always remains, even with malformed/empty preferences.
    if ((ws === 'draw' || ws === 'animate' || ws === 'board') && !tools.includes('brush')) tools.unshift('brush');
    out[ws] = { tools, toolDock: v.toolDock === 'left' || v.toolDock === 'right' ? v.toolDock : 'top',
      brushEdge: v.brushEdge === 'right' ? 'right' : 'left', labels: v.labels === true, advancedTargets: v.advancedTargets === true, seen: [...allowed] };
  }
  return out;
}
