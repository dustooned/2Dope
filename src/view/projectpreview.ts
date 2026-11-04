import type { App } from '../app';
import { frameContent } from '../core/comp';
import type { Drawing } from '../core/project';
import { encodePng } from '../io/codec';
import { drawComp } from './composite';
import { THUMB_H, THUMB_W } from './planeops';

/** Gallery pictures use the composed frame, never a selected drawing or editor overlays. */
export async function projectPreview(app: App): Promise<Uint8Array | null> {
  if (app.strokeActive) return null;
  const project = app.project, comp = project.comp, frame = app.frame, edit = app.history.peekUndo();
  const workspace = app.workspace, camera = workspace === 'motion' || app.arrangingAssets ? app.editor.throughCamera : true;
  const board = app.workspace === 'board' ? app.board?.id : undefined;
  const pinned: Drawing[] = [];
  const current = () => app.project === project && project.comp === comp && app.frame === frame && app.workspace === workspace && app.history.peekUndo() === edit && !app.strokeActive;
  try {
    for (const id of frameContent(project.comps, comp, frame).drawings) {
      if (!current()) return null;
      const drawing = project.drawing(id); pinned.push(drawing); await app.residency.pin(drawing);
    }
    if (!current()) return null;
    const c = document.createElement('canvas'); c.width = THUMB_W; c.height = THUMB_H;
    const g = c.getContext('2d')!, scale = Math.min(c.width / comp.width, c.height / comp.height);
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.translate((c.width - comp.width * scale) / 2, (c.height - comp.height * scale) / 2); g.scale(scale, scale);
    drawComp(g, project, comp, frame, { export: true, camera, ...(board ? { guide: board, onlyGuide: true } : {}) });
    return await encodePng(c);
  } finally { for (const drawing of pinned) app.residency.unpin(drawing); }
}
