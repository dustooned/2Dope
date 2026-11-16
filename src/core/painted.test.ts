import { describe, expect, it } from 'vitest';
import { groupOf, isPainted, moveGroup, paintedLead, PAINTED_MAX, railTracks, setPainted, stackAt } from './cellink';
import { drawingsLayer, newComp, type DrawingsLayer, type Layer } from './comp';
import { compFile, compsFromFile, minimumDrawingSchema, validateProjectFile, SCHEMA } from '../io/schema';

const L = (id: string, drawings: string[], extra: Partial<DrawingsLayer> = {}): DrawingsLayer =>
  ({ ...drawingsLayer(id, id, drawings.map((drawing) => ({ drawing, length: 1 })), 64, 48), ...extra });
const tracks = (ls: Layer[]) => ls.filter((l): l is DrawingsLayer => l.kind === 'drawings');

describe('painted tracks', () => {
  it('Make painted puts a plain track in its own group, and plain again keeps the group', () => {
    const ls: Layer[] = [L('A', ['a1', 'a2']), L('B', ['b1'])];
    const on = setPainted(ls, 'A', true)!;
    const a = on[0] as DrawingsLayer;
    expect(a.painted && a.cel === 'A' && isPainted(a)).toBe(true);
    expect(on[1]).toBe(ls[1]);
    expect(setPainted(on, 'A', true)).toBeNull();
    const off = setPainted(on, 'A', false)!;
    expect((off[0] as DrawingsLayer).painted).toBeUndefined();
    expect((off[0] as DrawingsLayer).cel).toBe('A');
  });

  it('Make painted marks every member of an existing linked group', () => {
    const ls: Layer[] = [L('top', ['t1'], { cel: 'base' }), L('other', ['o1']), L('base', ['b1'], { cel: 'base' })];
    const on = setPainted(ls, 'top', true)!;
    expect(tracks(on).filter((l) => l.painted).map((l) => l.id)).toEqual(['top', 'base']);
  });

  it('guides, adjustment and text layers cannot be painted', () => {
    expect(setPainted([L('g', ['g1'], { guide: true })], 'g', true)).toBeNull();
    expect(setPainted([L('x', ['x1'], { adjust: true })], 'x', true)).toBeNull();
  });

  it('the rail shows one track per painted group: its lead', () => {
    const ls: Layer[] = [L('p2', ['c', 'd'], { cel: 'p', painted: true }), L('p', ['a', 'b'], { cel: 'p', painted: true }), L('plain', ['z'])];
    expect(paintedLead(ls, ls[0] as DrawingsLayer).id).toBe('p');
    expect(railTracks(ls, tracks(ls)).map((l) => l.id)).toEqual(['p', 'plain']);
    // the group id's layer was deleted: the bottom member leads
    const rest: Layer[] = [L('p3', ['e'], { cel: 'p', painted: true }), L('p2', ['c'], { cel: 'p', painted: true })];
    expect(railTracks(rest, tracks(rest)).map((l) => l.id)).toEqual(['p2']);
    // plain linked art layers still show one row each
    const linked: Layer[] = [L('ink', ['i'], { cel: 'g' }), L('col', ['c'], { cel: 'g' })];
    expect(railTracks(linked, tracks(linked)).length).toBe(2);
  });

  it('a frame of a painted track is its members\u2019 cels, bottom first, visible only', () => {
    const ls: Layer[] = [L('top', ['t1', 't2'], { cel: 'p', painted: true }), L('mid', ['m1', 'm2'], { cel: 'p', painted: true, visible: false }), L('p', ['b1', 'b2'], { cel: 'p', painted: true })];
    expect(stackAt(ls, ls[2] as DrawingsLayer, 1)).toEqual(['b2', 't2']);
    expect(stackAt(ls, ls[2] as DrawingsLayer, 1, false)).toEqual(['b2', 'm2', 't2']);
    expect(stackAt(ls, L('plain', ['x']), 0)).toEqual(['x']);
    expect(groupOf(ls, 'mid').length).toBe(3);
  });

  it('moving a painted track moves its members together, in order', () => {
    const ls: Layer[] = [L('A', ['a']), L('p2', ['c'], { cel: 'p', painted: true }), L('p', ['b'], { cel: 'p', painted: true }), L('B', ['x'])];
    const rail = railTracks(ls, tracks(ls));
    expect(moveGroup(ls, rail, 'p', -1)!.map((l) => l.id)).toEqual(['p2', 'p', 'A', 'B']);
    expect(moveGroup(ls, rail, 'p', 1)!.map((l) => l.id)).toEqual(['A', 'B', 'p2', 'p']);
    expect(moveGroup(ls, rail, 'p', 0)).toBeNull();
    // a plain track steps over a whole painted group
    expect(moveGroup(ls, rail, 'A', 1)!.map((l) => l.id)).toEqual(['p2', 'p', 'A', 'B']);
  });

  it('Lite holds fewer layers per frame than Full', () => {
    expect(PAINTED_MAX.lite).toBe(3);
    expect(PAINTED_MAX.full).toBeGreaterThan(PAINTED_MAX.lite);
  });
});

describe('painted tracks in the project file', () => {
  const comp = () => {
    const c = newComp('c1', 'Shot', 64, 48, 12);
    c.layers = [L('p2', ['d2'], { cel: 'p', painted: true }), L('p', ['d1'], { cel: 'p', painted: true })];
    return c;
  };
  const file = (layers: unknown) => ({ format: '2dope', schema: SCHEMA, canvas: { width: 64, height: 48 }, main: 'c1', comps: { c1: layers }, folders: {}, drawings: { d1: { num: 1, line: null, fill: null, vectors: [] }, d2: { num: 2, line: null, fill: null, vectors: [] } } });

  it('the flag saves and reads back', () => {
    const f = validateProjectFile(file(compFile(comp())));
    const back = compsFromFile(f).get('c1')!.layers as DrawingsLayer[];
    expect(back.map((l) => [l.id, l.cel, l.painted])).toEqual([['p2', 'p', true], ['p', 'p', true]]);
  });

  it('needs no newer reader: plain and painted projects keep their minimum schema', () => {
    const f = validateProjectFile(file(compFile(comp())));
    expect(minimumDrawingSchema(f.drawings, f.comps)).toBe(3);
  });

  it('old projects open unchanged, and a stray flag without a group is dropped', () => {
    const plain = newComp('c1', 'Shot', 64, 48, 12);
    plain.layers = [L('a', ['d1']), L('b', ['d2'], { cel: 'g' })];
    const back = compsFromFile(validateProjectFile(file(compFile(plain)))).get('c1')!.layers as DrawingsLayer[];
    expect(back.some((l) => l.painted)).toBe(false);
    const raw = compFile(plain) as unknown as { layers: Record<string, unknown>[] };
    raw.layers[0]!.painted = true;
    const stray = compsFromFile(validateProjectFile(file(raw))).get('c1')!.layers as DrawingsLayer[];
    expect(stray[0]!.painted).toBeUndefined();
  });
});
