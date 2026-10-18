import type { App } from '../app';
import { locate } from '../core/timeline';
import type { CtxItem } from './contextmenu';

/**
 * The press-and-hold / right-click menu for the selected drawings. The X-sheet, Draw's strip and
 * Flip share it, so a frame has the same options everywhere (Procreate Dreams' frame options:
 * duplicate, insert, split, fill duration, duration, clear, delete).
 */
export function frameMenu(app: App, extra: CtxItem[] = []): CtxItem[] {
  const n = app.targets.length;
  const roles = (['key', 'breakdown', 'inbetween'] as const).map((r) => ({ label: r === 'key' ? '🔑 Key' : r === 'breakdown' ? 'Breakdown' : 'In-between', title: `Mark as ${r}`, run: () => app.setRole(r) }));
  const holds = [1, 2, 3, 4, 6, 8].map((k) => ({ label: `${k}`, title: `Show for ${k} frame${k > 1 ? 's' : ''}`, run: () => app.setExposure(k) }));
  // splitting needs the playhead inside a held drawing (not on its first frame)
  const here = n === 1 ? locate(app.project.exposures, app.lf) : null;
  const canSplit = !!here && here.offset > 0;
  return [
    { title: n > 1 ? `${n} drawings` : 'Frame' },
    { label: 'Duplicate', run: () => app.duplicateSelection(), hint: 'D' },
    { label: 'Insert frame after', run: () => app.insertBlank('after'), hint: 'N' },
    { label: 'Insert frame before', run: () => app.insertBlank('before') },
    ...(canSplit ? [{ label: 'Split here', run: () => app.splitHold() }] : []),
    ...(n === 1 ? [{ label: 'Fill to the end', run: () => app.fillDuration() }] : []),
    { sep: true },
    { title: '⏱ Show for (frames)' },
    { chips: [...holds, { label: '−1', title: 'One frame shorter', run: () => app.changeHold(-1) }, { label: '+1', title: 'One frame longer', run: () => app.changeHold(1) }] },
    { title: 'Mark' },
    { chips: roles },
    { sep: true },
    { label: 'Copy', run: () => app.copySelection(), hint: 'Ctrl+C' },
    { label: 'Cut', run: () => app.cutSelection(), hint: 'Ctrl+X' },
    { label: 'Paste (same drawings)', run: () => app.paste(), disabled: !app.clipboard.length, hint: 'Ctrl+V' },
    { label: 'Paste as new drawings', run: () => app.paste(true), disabled: !app.clipboard.length },
    { sep: true },
    { label: 'Move earlier', run: () => app.moveSelection(-1) },
    { label: 'Move later', run: () => app.moveSelection(1) },
    ...extra,
    ...(n === 1 ? [{ label: 'Clear frame', run: () => app.clearFrame() }] : []),
    { label: 'Delete', run: () => app.deleteFrame(), danger: true, hint: 'Del' },
  ];
}
