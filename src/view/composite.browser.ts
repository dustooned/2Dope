/** Real-browser pixel checks, opened through /tests/rendering.html on a separate Vite origin. */
import { cloneBrush, PRESETS } from '../core/brush';
import { drawingsLayer, opacityAt, partOf } from '../core/comp';
import { Project, planeCanvas, type Drawing } from '../core/project';
import { drawClipGroup, drawComp, drawEditingLayer, releaseScratch, type DrawingSource } from './composite';

const size = 16;
const canvas = () => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
};
const solid = (c: HTMLCanvasElement, color: string) => {
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
};
const pixels = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, size, size).data;
const pixel = (c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(8, 8, 1, 1).data];
const equal = (a: ArrayLike<number>, b: ArrayLike<number>, tolerance = 1) => {
  if (a.length !== b.length || Array.from(a).some((v, i) => Math.abs(v - b[i]!) > tolerance)) {
    throw new Error(`Pixels differ: ${Array.from(a).slice(0, 12)} vs ${Array.from(b).slice(0, 12)}`);
  }
};
const rig = () => {
  const p = new Project(size, size);
  const l = p.layer, d = p.drawing(l.exposures[0]!.drawing);
  const edit = (source?: (d: Drawing) => DrawingSource | null, editingMask = false) => {
    const c = canvas();
    drawEditingLayer(c.getContext('2d')!, p, p.comp, l, 0, d, new DOMMatrix(), { source, editingMask });
    return c;
  };
  const output = (source?: (d: Drawing) => DrawingSource | null) => {
    const c = canvas();
    drawComp(c.getContext('2d')!, p, p.comp, 0, { export: true, source });
    return c;
  };
  return { p, l, d, edit, output };
};
let passed = 0, failed = 0;
const check = (name: string, run: () => void) => {
  const row = document.createElement('li');
  try { run(); passed++; row.textContent = `PASS: ${name}`; }
  catch (e) { failed++; row.textContent = `FAIL: ${name}: ${String(e)}`; }
  document.querySelector('#results')!.append(row);
  releaseScratch();
};

for (const opacity of [0, 10, 50, 100]) {
  check(`Layer ${opacity}% flattens overlapping Line and Fill once, matching export`, () => {
    const r = rig();
    solid(planeCanvas(r.d, 'fill'), '#ff0000');
    solid(r.d.line, '#0000ff');
    r.l.transform.opacity.value = opacity;
    equal(pixel(r.edit()), opacity ? [0, 0, 255, Math.round(255 * opacity / 100)] : [0, 0, 0, 0]);
    equal(pixels(r.edit()), pixels(r.output()));
  });
  for (const part of ['line', 'fill'] as const) check(`${part} ${opacity}% has no editing opacity floor`, () => {
    const r = rig();
    solid(planeCanvas(r.d, part), '#0000ff');
    r.l.parts = { [part]: { ...partOf(r.l, part), opacity: { value: opacity, keys: [] } } };
    equal(pixel(r.edit()), opacity ? [0, 0, 255, Math.round(255 * opacity / 100)] : [0, 0, 0, 0]);
    equal(pixels(r.edit()), pixels(r.output()));
  });
}
for (const part of ['line', 'fill'] as const) check(`Hidden ${part} stays hidden, including preview ink`, () => {
  const r = rig();
  r.l.parts = { [part]: { ...partOf(r.l, part), visible: false } };
  const source = () => ({ line: r.d.line, fill: r.d.fill, overlay: (g: CanvasRenderingContext2D, name: string) => {
    if (name === part) { g.fillStyle = '#ff0000'; g.fillRect(0, 0, size, size); }
  } });
  equal(pixel(r.edit(source)), [0, 0, 0, 0]);
});
check('Hidden layer remains hidden in Draw', () => {
  const r = rig(); solid(r.d.line, '#0000ff'); r.l.visible = false;
  equal(pixel(r.edit()), [0, 0, 0, 0]);
});
check('Live raster replacement obeys layer and plane opacity, without changing saved pixels', () => {
  const r = rig(), live = canvas(); solid(live, '#0000ff');
  r.l.transform.opacity.value = 50;
  r.l.parts = { line: { ...partOf(r.l, 'line'), opacity: { value: 50, keys: [] } } };
  const source = () => ({ line: live, fill: null });
  equal(pixel(r.edit(source)), [0, 0, 255, 64]);
  equal(pixel(r.d.line), [0, 0, 0, 0]);
});
check('Vector preview and overlapping raster inherit plane opacity once', () => {
  const r = rig(); solid(r.d.line, '#0000ff');
  const brush = cloneBrush(PRESETS[0]!); brush.size = 12; brush.opacity = 1;
  const vector = { id: 'preview', tool: 'pen' as const, brush, color: '#0000ff', seed: 1,
    points: [{ x: 8, y: 8, pressure: 1, tiltX: 0, tiltY: 0, t: 0 }] };
  r.l.parts = { line: { ...partOf(r.l, 'line'), opacity: { value: 50, keys: [] } } };
  equal(pixel(r.edit(() => ({ line: r.d.line, fill: null, vectors: [vector] }))), [0, 0, 255, 128]);
  if (r.d.vectors.length) throw new Error('Preview was committed');
});
check('Predicted ink that sets its own alpha still inherits plane opacity', () => {
  const r = rig(); r.l.parts = { line: { ...partOf(r.l, 'line'), opacity: { value: 10, keys: [] } } };
  equal(pixel(r.edit(() => ({ line: r.d.line, fill: null, overlay: (g, part) => {
    if (part === 'line') { g.globalAlpha = 1; g.fillStyle = '#0000ff'; g.fillRect(0, 0, size, size); }
  } }))), [0, 0, 255, 26]);
});
check('Vector-only preview obeys Line opacity without being committed', () => {
  const r = rig();
  const brush = cloneBrush(PRESETS[0]!); brush.size = 12; brush.opacity = 1;
  r.l.parts = { line: { ...partOf(r.l, 'line'), opacity: { value: 50, keys: [] } } };
  equal(pixel(r.edit(() => ({ line: r.d.line, fill: null, vectors: [{
    id: 'live', tool: 'pen', brush, color: '#0000ff', seed: 1,
    points: [{ x: 8, y: 8, pressure: 1, tiltX: 0, tiltY: 0, t: 0 }],
  }] }))), [0, 0, 255, 128]);
  if (r.d.vectors.length) throw new Error('Preview was committed');
});
check('Parked thumbnail inherits layer opacity without reading parked pixels', () => {
  const r = rig();
  r.d.thumb = canvas(); solid(r.d.thumb, '#0000ff');
  r.d.line.width = r.d.line.height = 0;
  r.d.parked = { rev: 0, line: null, fill: null };
  r.l.transform.opacity.value = 50;
  equal(pixel(r.edit()), [0, 0, 255, 128]);
  if (!r.d.parked || r.d.line.width !== 0) throw new Error('Placeholder changed residency');
});
for (const opacity of [0, 50, 100]) check(`Mask with layer ${opacity}% agrees with export`, () => {
  const r = rig(); solid(r.d.line, '#0000ff');
  const mask = r.p.newDrawing(); r.l.mask = mask.id;
  const mg = mask.line.getContext('2d')!; mg.fillStyle = '#000'; mg.fillRect(0, 0, 8, size);
  r.l.transform.opacity.value = opacity;
  equal(pixels(r.edit()), pixels(r.output()));
  equal([...r.edit().getContext('2d')!.getImageData(4, 8, 1, 1).data], [0, 0, 0, 0]);
});
check('Live mask replacement and mask-edit bypass preserve the document mask', () => {
  const r = rig(); solid(r.d.line, '#0000ff'); const mask = r.p.newDrawing(); r.l.mask = mask.id;
  const live = canvas(); solid(live, '#000');
  const source = (d: typeof r.d) => ({ line: d === mask ? live : d.line, fill: d.fill });
  equal(pixel(r.edit(source)), [0, 0, 0, 0]);
  equal(pixel(r.edit(source, true)), [0, 0, 255, 255]);
  equal(pixel(mask.line), [0, 0, 0, 0]);
});
for (const blend of ['normal', 'multiply', 'screen', 'overlay'] as const) check(`${blend} blend against another layer agrees with export`, () => {
  const r = rig(); solid(r.d.line, '#cc8040'); r.l.blend = blend; r.l.transform.opacity.value = 50;
  const bg = r.p.newDrawing(); solid(bg.line, '#40a0cc');
  r.p.comp.layers.push(drawingsLayer('bg', 'Background', [{ drawing: bg.id, length: 1 }], size, size));
  const c = canvas(); solid(c, '#40a0cc');
  drawEditingLayer(c.getContext('2d')!, r.p, r.p.comp, r.l, 0, r.d, new DOMMatrix());
  equal(pixels(c), pixels(r.output()));
});
for (const opacity of [0, 50, 100]) check(`Clipping base ${opacity}% with member 50% agrees with export`, () => {
  const r = rig(); solid(r.d.line, '#0000ff'); r.l.transform.opacity.value = opacity;
  const d = r.p.newDrawing(); solid(d.line, '#ff0000');
  const member = drawingsLayer('clip', 'Clipped', [{ drawing: d.id, length: 1 }], size, size);
  member.clip = true; member.transform.opacity.value = 50;
  r.p.comp.layers.unshift(member);
  const c = canvas(), g = c.getContext('2d')!;
  drawClipGroup(g,
    (x) => drawEditingLayer(x, r.p, r.p.comp, r.l, 0, r.d, new DOMMatrix(), { alpha: 1, blend: 'normal' }),
    opacityAt(r.l, 0), r.l.blend,
    [{ draw: (x) => drawEditingLayer(x, r.p, r.p.comp, member, 0, d, new DOMMatrix(), { blend: 'normal' }), blend: member.blend }], 'test');
  equal(pixels(c), pixels(r.output()));
});
document.querySelector('#summary')!.textContent = `${passed} passed; ${failed} failed`;
document.body.dataset.result = failed ? 'failed' : 'passed';
