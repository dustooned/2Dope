import { describe, expect, it } from 'vitest';
import { drawingsLayer, newComp } from '../core/comp';
import { setKey } from '../core/anim';
import { cloneBrush, PRESETS } from '../core/brush';
import type { StrokeRecord } from '../core/stroke';
import { fitComp, fitPage, fitStroke } from './sendto';

const stroke = (): StrokeRecord => ({
  id: 's', tool: 'pen', brush: { ...cloneBrush(PRESETS[0]!), size: 10 }, color: '#000', seed: 1,
  points: [{ x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 0 }, { x: 100, y: 50, pressure: 1, tiltX: 0, tiltY: 0, t: 5 }],
  controls: { anchors: [0, 0, 100, 50], modes: {}, handles: { '0': { inx: -4, iny: 2, outx: 4, outy: -2 } } },
  clips: [{ runs: [0, 1], matrix: [1, 0, 0, 1, 10, 20] }],
});

describe('send to project: fitting a page into another', () => {
  it('fits and centres a page, and changes nothing for the same size', () => {
    expect(fitPage(1920, 1080, 1920, 1080)).toEqual({ s: 1, ox: 0, oy: 0 });
    expect(fitPage(1920, 1080, 960, 960)).toEqual({ s: 0.5, ox: 0, oy: 210 });
    expect(fitPage(100, 200, 400, 400)).toEqual({ s: 2, ox: 100, oy: 0 });
  });

  it('moves vector points, editable anchors, handles, clips and brush size onto the new page', () => {
    const f = fitPage(200, 100, 400, 400); // s 2, oy 100
    const r = fitStroke(stroke(), f);
    expect(r.points.map((p) => [p.x, p.y])).toEqual([[0, 100], [200, 200]]);
    expect(r.brush.size).toBe(20);
    expect(r.controls!.anchors).toEqual([0, 100, 200, 200]);
    expect(r.controls!.handles['0']).toEqual({ inx: -8, iny: 4, outx: 8, outy: -4 });
    expect(r.clips![0]!.matrix).toEqual([2, 0, 0, 2, 20, 140]);
    const same = stroke();
    expect(fitStroke(same, fitPage(200, 100, 200, 100))).toBe(same);
  });

  it('fits imported path matrices without rewriting their curves', () => {
    const source = stroke();
    source.shape = { path: 'M0 0C10 0 10 20 20 20Z', matrix: [1, 0, 0, 1, 8, 4], fill: '#ff0000', stroke: null, width: 0, rule: 'nonzero', cap: 'butt', join: 'miter', miter: 4 };
    const result = fitStroke(source, { s: 2, ox: 10, oy: 100 });
    expect(result.shape!.path).toBe(source.shape.path);
    expect(result.shape!.matrix).toEqual([2, 0, 0, 2, 26, 108]);
    expect(source.shape.matrix).toEqual([1, 0, 0, 1, 8, 4]);
  });

  it('moves a comp’s layer positions (and their keys), anchors and part offsets', () => {
    const c = newComp('c', 'Head', 200, 100, 12);
    const l = drawingsLayer('L', 'Head', [{ drawing: 'd1', length: 1 }], 200, 100);
    l.transform.position = setKey(setKey(l.transform.position, 0, [100, 50]), 10, [150, 50]);
    l.parts = { line: { visible: true, opacity: { value: 100, keys: [] }, tint: null, offset: { value: [5, 5], keys: [] } } };
    c.layers.push(l);
    fitComp(c, fitPage(200, 100, 400, 400), 400, 400);
    expect([c.width, c.height]).toEqual([400, 400]);
    expect(l.transform.position.keys.map((k) => k.v)).toEqual([[200, 200], [300, 200]]);
    expect(l.transform.anchor.value).toEqual([200, 200]);
    expect(l.parts.line!.offset.value).toEqual([10, 10]);
  });
});
