/** Workspace changes are views of one document, never document conversions. */
export type Workspace = 'board' | 'draw' | 'animate' | 'time' | 'motion';
export type PaintingWorkspace = 'draw' | 'animate';
export type PaintingView = 'still' | 'flipbook' | 'clips';
export const isPaintingWorkspace = (w: Workspace): w is PaintingWorkspace => w === 'draw' || w === 'animate';
export function paintingView(w: PaintingWorkspace, saved: string | null): PaintingView {
  if (w === 'draw') return saved === 'flipbook' ? 'flipbook' : 'still';
  return saved === 'clips' || saved === 'timeline' ? 'clips' : 'flipbook';
}
