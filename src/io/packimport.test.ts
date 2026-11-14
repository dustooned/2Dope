import { describe, expect, it } from 'vitest';
import { PACK_LIMITS, isPackImage, packBaseName, packPlacement, packImageTooLarge, packSummary, planPackImport, uniqueName } from './packimport';

const file = (name: string, size = 1000, type = '') => ({ name, size, type });

describe('My Assets image batch plan', () => {
  it('names cards after files, within the collection, counting existing cards and the batch', () => {
    const plan = planPackImport([file('Rocket.png'), file('rocket.PNG'), file('Atom.jpg'), file('Beaker.webp')], '  Science Retro Set ',
      [{ name: 'Rocket', collection: 'Science Retro Set' }, { name: 'Atom', collection: 'Other' }]);
    expect(plan.collection).toBe('Science Retro Set');
    expect(plan.items.map(i => i.name)).toEqual(['Rocket (2)', 'rocket (3)', 'Atom', 'Beaker']);
    expect(plan.skipped).toEqual([]);
    expect(plan.total).toBe(4);
  });
  it('carries names across batches into the same collection', () => {
    const first = planPackImport([file('Car.png')], 'Retro Car', []);
    const second = planPackImport([file('Car.png'), file('Car.png')], 'Retro Car', first.items.map(i => ({ name: i.name, collection: 'Retro Car' })));
    expect(second.items.map(i => i.name)).toEqual(['Car (2)', 'Car (3)']);
  });
  it('trims names to 80 characters, including any suffix', () => {
    const long = 'x'.repeat(120);
    expect(packBaseName(`${long}.png`)).toHaveLength(80);
    const name = uniqueName('y'.repeat(80), new Set(['y'.repeat(80)]));
    expect(name).toHaveLength(80);
    expect(name.endsWith(' (2)')).toBe(true);
    expect(packBaseName('.png')).toBe('Image');
  });
  it('skips files that are not PNG, JPG or WebP', () => {
    const plan = planPackImport([file('a.eps'), file('b.png'), file('c.ai'), file('d.jpeg'), file('notes.txt', 10, 'text/plain')], 'Set', []);
    expect(plan.items.map(i => i.index)).toEqual([1, 3]);
    expect(plan.skipped.map(s => s.file)).toEqual(['a.eps', 'c.ai', 'notes.txt']);
    expect(isPackImage('photo', 'image/jpeg')).toBe(true);
    expect(isPackImage('anim.gif', 'image/gif')).toBe(false);
  });
  it('refuses a batch over 50 images or 100 MB before anything is written', () => {
    const many = Array.from({ length: PACK_LIMITS.files + 1 }, (_, i) => file(`${i}.png`));
    expect(() => planPackImport(many, 'Set', [])).toThrow(/up to 50 images/);
    expect(() => planPackImport([file('a.png', 60 * 1024 * 1024), file('b.png', 41 * 1024 * 1024)], 'Set', [])).toThrow(/100 MB/);
    expect(() => planPackImport([file('a.eps')], 'Set', [])).toThrow(/PNG, JPG or WebP/);
    // unsupported files do not count toward the image limit
    expect(planPackImport([...many.slice(1), file('x.eps')], 'Set', []).items).toHaveLength(50);
  });
  it('places images at native size, scaling down only, centred', () => {
    expect(packPlacement(90, 157, 1920, 1080)).toEqual({ x: 915, y: 462, w: 90, h: 157 });
    expect(packPlacement(3840, 1080, 1920, 1080)).toEqual({ x: 0, y: 270, w: 1920, h: 540 });
    expect(packImageTooLarge(8193, 10)).toBe(true);
    expect(packImageTooLarge(8000, 5001)).toBe(true);
    expect(packImageTooLarge(2992, 3508)).toBe(false);
  });
  it('summarises what was added and skipped', () => {
    expect(packSummary({ added: 37, unreadable: 1, tooLarge: 0, unsupported: 0 }, 38, 'Science Retro Set'))
      .toBe('Added 37 of 38 images to Science Retro Set. Skipped 1 unreadable image.');
    expect(packSummary({ added: 1, unreadable: 0, tooLarge: 0, unsupported: 2, stop: 'cancel' }, 5, ''))
      .toMatch(/^Added 1 of 5 images to Unfiled\. Skipped 2 files that are not PNG, JPG or WebP\. Import cancelled/);
    expect(packSummary({ added: 3, unreadable: 0, tooLarge: 0, unsupported: 0, stop: 'storage' }, 9, 'Set')).toContain('Storage is full after 3 cards.');
  });
});
