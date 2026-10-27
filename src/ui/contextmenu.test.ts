import { describe, expect, it } from 'vitest';
import { visibleItems, type CtxItem } from './contextmenu';

const run = () => {};
const labels = (items: CtxItem[]) => items.map((it) => ('label' in it ? it.label : 'title' in it ? `[${it.title}]` : 'sep' in it ? '—' : 'chips'));

describe('context menu entries this device hides', () => {
  const menu: CtxItem[] = [
    { title: 'Frame' },
    { id: 'frame.duplicate', label: 'Duplicate', run },
    { sep: true },
    { title: 'Copy' },
    { id: 'frame.copy', label: 'Copy', run },
    { id: 'frame.cut', label: 'Cut', run },
    { sep: true },
    { label: 'Always here', run },
    { sep: true },
    { id: 'frame.delete', label: 'Delete', run },
  ];

  it('keeps everything when nothing is hidden', () => {
    expect(visibleItems(menu, () => false)).toEqual(menu);
  });

  it('drops hidden entries, then the titles and separators they leave behind', () => {
    const hidden = new Set(['frame.copy', 'frame.cut', 'frame.delete']);
    expect(labels(visibleItems(menu, (id) => hidden.has(id)))).toEqual(['[Frame]', 'Duplicate', '—', 'Always here']);
  });

  it('never hides entries without an id, and keeps chip rows', () => {
    const items: CtxItem[] = [{ title: 'Tool' }, { chips: [{ label: 'Brush', run }] }, { label: 'Hide interface', run }];
    expect(visibleItems(items, () => true)).toEqual(items);
  });
});
