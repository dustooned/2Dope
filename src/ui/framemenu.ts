import type { App } from '../app';
import type { CtxItem } from './contextmenu';

/** The press-and-hold / right-click menu for the selected drawings (X-sheet and strip share it). */
export function frameMenu(app: App): CtxItem[] {
  const n = app.targets.length;
  const roles = (['key', 'breakdown', 'inbetween'] as const).map((r) => ({ label: r === 'key' ? 'Key' : r === 'breakdown' ? 'Bkdn' : 'Inbtw', title: `Mark as ${r}`, run: () => app.setRole(r) }));
  const holds = [1, 2, 3, 4].map((k) => ({ label: `${k}s`, title: `Hold each for ${k} frame${k > 1 ? 's' : ''}`, run: () => app.setExposure(k) }));
  return [
    { title: n > 1 ? `${n} drawings` : 'Drawing' },
    { label: 'Insert blank before', run: () => app.insertBlank('before') },
    { label: 'Insert blank after', run: () => app.insertBlank('after'), hint: 'N' },
    { label: 'Duplicate', run: () => app.duplicateSelection(), hint: 'D' },
    { sep: true },
    { label: 'Copy', run: () => app.copySelection(), hint: 'Ctrl+C' },
    { label: 'Cut', run: () => app.cutSelection(), hint: 'Ctrl+X' },
    { label: 'Paste (same drawings)', run: () => app.paste(), disabled: !app.clipboard.length, hint: 'Ctrl+V' },
    { label: 'Paste as new drawings', run: () => app.paste(true), disabled: !app.clipboard.length },
    { sep: true },
    { title: 'Hold' },
    { chips: [...holds, { label: '−1', title: 'One frame shorter', run: () => app.changeHold(-1) }, { label: '+1', title: 'One frame longer', run: () => app.changeHold(1) }] },
    { title: 'Mark' },
    { chips: roles },
    { sep: true },
    { label: 'Move earlier', run: () => app.moveSelection(-1) },
    { label: 'Move later', run: () => app.moveSelection(1) },
    { label: 'Delete', run: () => app.deleteFrame(), danger: true, hint: 'Del' },
  ];
}
