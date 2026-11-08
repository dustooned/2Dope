import type { App } from '../app';
import { locate } from '../core/timeline';
import { lastMenuPoint, type CtxItem } from './contextmenu';
import { showCustomize } from './customize';

/**
 * The press-and-hold / right-click menu for the selected drawings. The X-sheet, Draw's strip and
 * Flip share it, so a frame has the same options everywhere (Procreate Dreams' frame options:
 * duplicate, insert, split, fill duration, duration, clear, delete).
 */
export function frameMenu(app: App, extra: CtxItem[] = []): CtxItem[] {
  const n = app.targets.length;
  const roles = (['key', 'breakdown', 'inbetween'] as const).map((r) => ({ label: r === 'key' ? 'Key' : r === 'breakdown' ? 'Breakdown' : 'In-between', title: `Mark as ${r}`, run: () => app.setRole(r) }));
  const holds = [1, 2, 3, 4, 6, 8].map((k) => ({ label: `${k}`, title: `Show for ${k} frame${k > 1 ? 's' : ''}`, run: () => app.setExposure(k) }));
  // splitting needs the playhead inside a held drawing (not on its first frame)
  const here = n === 1 ? locate(app.project.exposures, app.lf) : null;
  const canSplit = !!here && here.offset > 0;
  return [
    { title: n > 1 ? `${n} drawings` : 'Frame' },
    { id: 'frame.duplicate', label: 'Duplicate', run: () => app.duplicateSelection(), hint: 'D' },
    { id: 'frame.insertafter', label: 'Insert frame after', run: () => app.insertBlank('after'), hint: 'N' },
    { id: 'frame.insertbefore', label: 'Insert frame before', run: () => app.insertBlank('before') },
    ...(canSplit ? [{ id: 'frame.split', label: 'Split here', run: () => app.splitHold() }] : []),
    ...(n === 1 ? [{ id: 'frame.filltoend', label: 'Fill to the end', run: () => app.fillDuration() }] : []),
    { sep: true },
    { title: '⏱ Show for (frames)' },
    { chips: [...holds, { label: '−1', title: 'One frame shorter', run: () => app.changeHold(-1) }, { label: '+1', title: 'One frame longer', run: () => app.changeHold(1) }] },
    { title: n > 1 ? `🔁 Repeat these ${n} as a cycle` : '🔁 Repeat as a cycle' },
    { chips: [1, 2, 3].map((k) => ({ label: `×${k + 1}`, title: `Show ${n > 1 ? 'these drawings' : 'this drawing'} ${k + 1} times in a row (same drawings)`, run: () => app.repeatSelection(k) })).concat([{ label: 'To end', title: 'Repeat until the end of the shot', run: () => app.repeatSelection('end') }]) },
    ...(app.project.layer.kind === 'drawings' && app.project.layer.tweenVectors ? [
      { title: '〰 Tween to the next pose' },
      { chips: ([[null, 'Even', 'The same speed all the way'], ['easeIn', 'Slow start', 'Leaves this pose slowly, then speeds up'], ['easeOut', 'Slow end', 'Settles slowly into the next pose'], ['easeInOut', 'Both', 'Slow start and slow end']] as const).map(([e, label, title]) => ({ label, title, on: (app.project.exposures[app.targets[0] ?? -1]?.ease ?? null) === e, run: () => app.setTweenEase(e) })) },
    ] : []),
    { title: 'Mark' },
    { chips: roles },
    { sep: true },
    { id: 'frame.copy', label: 'Copy', run: () => app.copySelection(), hint: 'Ctrl+C' },
    { id: 'frame.cut', label: 'Cut', run: () => app.cutSelection(), hint: 'Ctrl+X' },
    { id: 'frame.paste', label: 'Paste (same drawings)', run: () => app.paste(), disabled: !app.clipboard.length, hint: 'Ctrl+V' },
    { id: 'frame.pastenew', label: 'Paste as new drawings', run: () => app.paste(true), disabled: !app.clipboard.length },
    { sep: true },
    { id: 'frame.earlier', label: 'Move earlier', run: () => app.moveSelection(-1) },
    { id: 'frame.later', label: 'Move later', run: () => app.moveSelection(1) },
    ...extra,
    ...(n === 1 ? [{ id: 'frame.clear', label: 'Clear frame', run: () => app.clearFrame() }] : []),
    { id: 'frame.delete', label: 'Delete', run: () => app.deleteFrame(), danger: true, hint: 'Del' },
    { sep: true },
    { label: 'Customize this menu…', run: () => { const p = lastMenuPoint(); showCustomize('frame', p.x, p.y, 'Show in this menu'); } },
  ];
}
