/** Workspace changes are views of one document, never document conversions. */
export type Workspace = 'board' | 'draw' | 'animate' | 'time' | 'motion';
export type PaintingWorkspace = 'draw' | 'animate';
export type PaintingView = 'still' | 'flipbook' | 'clips';
export const isPaintingWorkspace = (w: Workspace): w is PaintingWorkspace => w === 'draw' || w === 'animate';
export function paintingView(w: PaintingWorkspace, saved: string | null): PaintingView {
  if (w === 'draw') return saved === 'flipbook' ? 'flipbook' : 'still';
  return saved === 'clips' || saved === 'timeline' ? 'clips' : 'flipbook';
}

/** What the bubble options row shows. */
export type OptionsRow = 'assets' | 'points' | 'time' | 'layers' | 'transform' | 'adjust' | 'smudge' | 'paint' | 'fill' | 'select' | 'board' | 'motion' | 'none';

/** The tool bubble that is lit: an adjustment or the smudge brush beats the tool under it. */
export type ToolChoice = 'assets' | 'adjust' | 'smudge' | 'select' | 'brush' | 'eraser' | 'pen' | 'fill';

export interface OptionsState {
  workspace: Workspace;
  tool: 'brush' | 'eraser' | 'pen' | 'fill';
  /** Fill's mode; 'lasso' is the Select tool. */
  fillMode: string;
  smudging: boolean;
  adjusting: boolean;
  transforming: boolean;
  pointEditing: boolean;
  arranging: boolean;
  /** The quick Layers chips (Draw, Animate, Timing). */
  layersOpen: boolean;
}

export function toolChoice(s: OptionsState): ToolChoice {
  if (s.arranging) return 'assets';
  if (s.adjusting) return 'adjust';
  if (s.tool === 'fill') return s.fillMode === 'lasso' ? 'select' : 'fill';
  if (s.tool === 'brush' && s.smudging) return 'smudge';
  return s.tool;
}

/**
 * Which options belong in the row. Drawing tools and their temporary states (transform,
 * adjustment, point editing, asset arranging) only show in Draw and Animate: Story, Timing and
 * Motion keep their own options whatever drawing tool was used last.
 */
export function optionsRow(s: OptionsState): OptionsRow {
  const ws = s.workspace;
  const painting = isPaintingWorkspace(ws);
  const t = toolChoice(s);
  if (painting && s.arranging) return 'assets';
  if (painting && s.pointEditing) return 'points';
  if (ws === 'time' && !s.layersOpen) return 'time';
  if (s.layersOpen && (painting || ws === 'time') && !(painting && s.transforming)) return 'layers';
  if (painting && s.transforming) return 'transform';
  if (painting && t === 'adjust') return 'adjust';
  if (painting && t === 'smudge') return 'smudge';
  if (painting && (t === 'brush' || t === 'pen' || t === 'eraser')) return 'paint';
  if (painting && t === 'fill') return 'fill';
  if (painting && t === 'select') return 'select';
  if (ws === 'board') return 'board';
  if (ws === 'motion') return 'motion';
  return 'none';
}
