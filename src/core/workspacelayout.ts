import type { Workspace } from './workspace';

/** Device preferences only: these never describe artwork or enter document History. */
export const WORKSPACE_LAYOUT_KEY = '2dope.workspace.layouts';
export const WORKSPACE_NAMES: Record<Workspace, string> = { board: 'Story', draw: 'Draw', animate: 'Animate', time: 'Timing', motion: 'Motion' };
export const WORKSPACE_TOOLS = {
  draw: ['brush', 'smudge', 'eraser', 'select', 'transform', 'pen', 'fill', 'adjust', 'color', 'layers', 'reference'],
  animate: ['brush', 'smudge', 'eraser', 'select', 'transform', 'pen', 'fill', 'adjust', 'assets', 'color', 'layers', 'reference'],
  board: ['panel', 'images', 'dup', 'del', 'play', 'export'],
  time: ['play', 'onion', 'insert', 'dup', 'del', 'layers'],
  motion: ['addlayer', 'camera', 'group', 'split', 'autokey', 'look', 'flipbook', 'fx'],
} as const;
export type WorkspaceTool = typeof WORKSPACE_TOOLS[Workspace][number];
export const WORKSPACE_TOOL_NAMES: Record<WorkspaceTool, string> = {
  brush: 'Brush', smudge: 'Smudge', eraser: 'Eraser', select: 'Select', transform: 'Transform',
  pen: 'Vector', fill: 'Bucket fill', adjust: 'Adjustments', color: 'Colour', layers: 'Layers',
  reference: 'Reference', assets: 'Move assets', panel: 'New panel', images: 'Import panels',
  dup: 'Duplicate', del: 'Delete', play: 'Play', export: 'Export storyboard / animatic', onion: 'Onion skin',
  insert: 'New drawing', addlayer: 'New layer', camera: 'Camera', group: 'Group', split: 'Split',
  autokey: 'Auto-key', look: 'Camera view', flipbook: 'Edit flipbook', fx: 'Effects',
};
export interface WorkspaceLayout {
  tools: WorkspaceTool[];
  toolDock: 'top' | 'left' | 'right';
  brushEdge: 'left' | 'right';
  labels: boolean;
  advancedTargets: boolean;
}
export type WorkspaceLayouts = Record<Workspace, WorkspaceLayout>;
export function defaultWorkspaceLayout(ws: Workspace): WorkspaceLayout {
  return { tools: ws === 'draw' ? ['brush', 'smudge', 'eraser', 'select', 'transform', 'layers', 'color']
    : ws === 'animate' ? ['brush', 'eraser', 'select', 'assets', 'layers', 'color'] : [...WORKSPACE_TOOLS[ws]],
  toolDock: 'top', brushEdge: 'left', labels: false, advancedTargets: false };
}
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function readWorkspaceLayouts(value: unknown): WorkspaceLayouts {
  const source = obj(value), out = {} as WorkspaceLayouts;
  for (const ws of Object.keys(WORKSPACE_NAMES) as Workspace[]) {
    const v = obj(source[ws]), d = defaultWorkspaceLayout(ws), allowed: readonly string[] = WORKSPACE_TOOLS[ws];
    const tools = Array.isArray(v.tools) ? [...new Set(v.tools.slice(0, 40).filter((x): x is WorkspaceTool => typeof x === 'string' && allowed.includes(x)))] : d.tools;
    // A recoverable painting tool always remains, even with malformed/empty preferences.
    if ((ws === 'draw' || ws === 'animate') && !tools.includes('brush')) tools.unshift('brush');
    out[ws] = { tools, toolDock: v.toolDock === 'left' || v.toolDock === 'right' ? v.toolDock : 'top',
      brushEdge: v.brushEdge === 'right' ? 'right' : 'left', labels: v.labels === true, advancedTargets: v.advancedTargets === true };
  }
  return out;
}
