import { describe, expect, it } from 'vitest';
import { editDistance, expand, searchAsk, stem, tokens, wordMatch, type AskEntry } from './ask';
import { effectAndToolEntries } from './askcatalog';

const e = (id: string, name: string, text: string, words = '', kind: AskEntry['kind'] = 'effect'): AskEntry => ({ id, kind, name, text, words });
const names = (hits: { entry: AskEntry }[]) => hits.map((h) => h.entry.id);

describe('words', () => {
  it('reduces plurals, endings and spellings to one root', () => {
    expect(stem('lines')).toBe('line');
    expect(stem('shaking')).toBe('shak');
    expect(stem('colours')).toBe(stem('colors'));
    expect(stem('grey')).toBe(stem('gray'));
    expect(stem('copies')).toBe('copy');
    expect(stem('glass')).toBe('glass');
  });
  it('drops filler words but keeps the meaningful ones', () => {
    expect(tokens('How do I make my line draw itself?')).toEqual(['line', 'draw', 'itself']);
    expect(tokens('')).toEqual([]);
  });
  it('measures spelling slips including swapped letters', () => {
    expect(editDistance('glitch', 'glich', 2)).toBe(1);
    expect(editDistance('wiggle', 'wigle', 2)).toBe(1);
    expect(editDistance('shake', 'shkae', 2)).toBe(1);
    expect(editDistance('blur', 'glow', 1)).toBeGreaterThan(1);
  });
  it('matches whole words, the start of a word and one slip, but not short words loosely', () => {
    expect(wordMatch('glitch', 'glitch')).toBe(1);
    expect(wordMatch('gli', 'glitch')).toBe(0.85);
    expect(wordMatch('glich', 'glitch')).toBe(0.7);
    expect(wordMatch('cat', 'car')).toBe(0);
    expect(wordMatch('tv', 'tx')).toBe(0);
  });
  it('lists everyday words that mean the same, at less weight', () => {
    const w = expand(stem('wiggle'));
    expect(w[0]).toEqual({ word: stem('wiggle'), weight: 1 });
    expect(w.map((x) => x.word)).toContain(stem('wobble'));
    expect(w.slice(1).every((x) => x.weight < 1)).toBe(true);
  });
});

describe('searchAsk', () => {
  const entries = [
    e('boil', 'Line boil', 'Lines wiggle a little every few frames, like hand-drawn animation', 'wiggle shaky jitter'),
    e('shake', 'Camera shake', 'The whole layer jitters like a shaken camera', 'earthquake impact explosion'),
    e('glitch', 'Glitch', 'Bands of the picture slide sideways and split into colour fringes', 'broken corrupted digital error screen static'),
    e('glow', 'Glow', 'The bright parts shine and bloom', 'neon shine bright light'),
    e('del', 'Delete', 'Remove what is selected', '', 'command'),
    e('man', 'Layers', 'Reorder layers by dragging the grip, or use Move up and Move down', '', 'manual'),
  ];
  it('finds by name, with a typo, or as you type', () => {
    expect(names(searchAsk(entries, 'glitch'))[0]).toBe('glitch');
    expect(names(searchAsk(entries, 'glich'))[0]).toBe('glitch');
    expect(names(searchAsk(entries, 'glit'))[0]).toBe('glitch');
    expect(names(searchAsk(entries, 'glow'))[0]).toBe('glow');
  });
  it('finds by everyday words and student wording', () => {
    expect(names(searchAsk(entries, 'wiggle'))[0]).toBe('boil');
    expect(names(searchAsk(entries, 'make my lines wobble'))[0]).toBe('boil');
    expect(names(searchAsk(entries, 'broken screen'))[0]).toBe('glitch');
    expect(names(searchAsk(entries, 'earthquake'))[0]).toBe('shake');
    expect(names(searchAsk(entries, 'neon sign'))[0]).toBe('glow');
  });
  it('finds a command by another word for it, and a manual section by what its text says', () => {
    expect(names(searchAsk(entries, 'remove'))[0]).toBe('del');
    expect(names(searchAsk(entries, 'trash'))[0]).toBe('del');
    expect(names(searchAsk(entries, 'reorder grip'))[0]).toBe('man');
    expect(names(searchAsk(entries, 'move layers'))).toContain('man');
  });
  it('ranks a name match above a word in a description', () => {
    expect(names(searchAsk(entries, 'camera'))[0]).toBe('shake');
  });
  it('returns nothing for an empty or unrelated query, and respects the limit', () => {
    expect(searchAsk(entries, '')).toEqual([]);
    expect(searchAsk(entries, 'the a my')).toEqual([]);
    expect(searchAsk(entries, 'zzzqqq')).toEqual([]);
    expect(searchAsk(entries, 'light line colour layer', 2).length).toBeLessThanOrEqual(2);
  });
  it('ranks more of what was typed higher', () => {
    const r = searchAsk(entries, 'camera jitter');
    expect(names(r)[0]).toBe('shake');
  });
});

describe('the real catalogue answers real student words', () => {
  const cat = effectAndToolEntries();
  const first = (q: string) => searchAsk(cat, q)[0]?.entry.id;
  it('maps what students remember to the right effect or tool', () => {
    expect(first('wiggly lines')).toBe('boil');
    expect(first('glitchy broken')).toBe('glitch');
    expect(first('old tv')).toBe('tv');
    expect(first('shakey camera')).toBe('shake');
    expect(first('mirror')).toBe('mirror');
    expect(first('pixelate')).toBe('mosaic');
    expect(first('draw itself')).toBe('drawon');
    expect(first('rubber')).toBeUndefined();
    expect(first('eraser')).toBe('eraser');
    expect(first('bucket')).toBe('fill');
    expect(first('earthquake')).toBe('shake');
    expect(first('undo')).toBe('tap2');
    expect(first('oops')).toBe('tap2');
    expect(first('redo')).toBe('tap3');
    expect(first('hide the interface')).toBe('tap4');
    expect(first('make it bounce')).toBe('preset.bounce');
    expect(first('fade in')).toBe('preset.fadein');
  });
  it('says how to do a gesture, in the words the Gesture controls page uses', () => {
    const hit = searchAsk(cat, 'undo').find((h) => h.entry.id === 'tap2')!;
    expect(hit.entry.kind).toBe('gesture');
    expect(hit.entry.text).toBe('Tapping with two fingers will undo.');
  });
});
