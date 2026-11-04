import { describe, expect, it } from 'vitest';
import { defaultTitle, readTitle } from './title';
import { drawingsLayer, newComp, compLayer } from './comp';
import { layerPresentation } from './layerpresentation';
describe('editable title metadata and shared layer facts', () => {
  it('counts Unicode code points, normalizes line endings and bounds four lines', () => {
    expect(readTitle({ ...defaultTitle(), text: '😀'.repeat(280) }).text).toHaveLength(560);
    expect(readTitle({ ...defaultTitle(), text: 'A\r\nB' }).text).toBe('A\nB');
    expect(() => readTitle({ ...defaultTitle(), text: '😀'.repeat(281) })).toThrow('280'); expect(() => readTitle({ ...defaultTitle(), text: '1\n2\n3\n4\n5' })).toThrow('four');
  });
  it.each([{ text: '  ' }, { font: 'https://fonts.invalid/a' }, { size: Infinity }, { size: 513 }, { strokeWidth: 17 }, { fill: 'red' }, { v: 2 }, { arbitrary: 1 }])('rejects unsupported title data: %j', patch => expect(() => readTitle({ ...defaultTitle(), ...patch })).toThrow());
  it('uses the same ordered title, mask, effects and lock labels for every row adapter', () => {
    const l = drawingsLayer('t', 'Heading', [{ drawing: 'd', length: 1 }], 64, 64); l.title = defaultTitle(); l.still = true; l.mask = 'm'; l.locked = true;
    expect(layerPresentation(l, new Map(), 0).badges).toEqual(['Title', 'Mask', 'Locked']);
    const c = newComp('asset', 'Badge source', 64, 64, 24); c.asset = true; const group = compLayer('instance', 'Instance', c, c); group.name = 'My placement'; const facts = layerPresentation(group, new Map([[c.id, c]]), 0);
    expect(facts.name).toBe('My placement'); expect(facts.kind).toBe('Symbol'); expect(facts.source).toBe('Badge source');
  });
});
