/** Real-browser pixel checks for Roughen edges and Gaussian blur, opened through /tests/effects.html. */
import { App } from '../app';
import { effectsPad, newEffect, type EffectType, type LayerEffect } from '../core/effects';
import { drawingsLayer } from '../core/comp';
import { Project, planeCanvas } from '../core/project';
import { EffectsPanel } from '../ui/effectspanel';
import { drawComp, drawEditingLayer, releaseScratch } from './composite';
import { drawEffected } from './effects';

const W = 64, H = 64;
const RED: [number, number, number] = [230, 57, 70];
const BLUE: [number, number, number] = [24, 24, 140];
type Paint = (g: CanvasRenderingContext2D) => void;

const blank = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const fx = (type: EffectType, p: Partial<LayerEffect> = {}): LayerEffect => ({ ...newEffect(type, `t${type}`, 1234), ...p });
const rect = (x: number, y: number, w: number, h: number, rgb = RED): Paint => (g) => { g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(x, y, w, h); };
const dot = (cx: number, cy: number, r: number, rgb = RED): Paint => (g) => { g.fillStyle = `rgb(${rgb.join(',')})`; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); };

/** The layer drawn through its effects at a layer frame; line/fill are painted as separate parts. */
function run(effects: LayerEffect[], line: Paint | null, fill: Paint | null = null, frame = 0, w = W, h = H): Uint8ClampedArray {
  const parts = { line: blank(w, h), fill: blank(w, h) };
  if (line) line(parts.line.getContext('2d')!);
  if (fill) fill(parts.fill.getContext('2d')!);
  const paint = (g: CanvasRenderingContext2D, part: 'all' | 'line' | 'fill') => {
    if (part !== 'line') g.drawImage(parts.fill, 0, 0);
    if (part !== 'fill') g.drawImage(parts.line, 0, 0);
  };
  const out = drawEffected({ id: 'L', effects }, frame, w, h, 'all', 0, paint);
  const c = blank(w, h), g = c.getContext('2d')!;
  if (out) { const p = effectsPad({ id: 'L', effects }); g.drawImage(out, -p, -p); } else paint(g, 'all');
  return g.getImageData(0, 0, w, h).data;
}
const at = (px: Uint8ClampedArray, x: number, y: number, w = W) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray, x0 = 0, y0 = 0, x1 = W, y1 = H) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let k = 0; k < 4; k++) if (a[(y * W + x) * 4 + k] !== b[(y * W + x) * 4 + k]) return true;
  return false;
};
const alphaCount = (px: Uint8ClampedArray) => { let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) n++; return n; };

let passed = 0, failed = 0;
const check = (name: string, test: () => true | string) => {
  const row = document.createElement('li');
  let result: true | string;
  try { result = test(); } catch (e) { result = String(e); }
  if (result === true) { passed++; row.textContent = `PASS: ${name}`; } else { failed++; row.textContent = `FAIL: ${name}: ${result}`; }
  document.querySelector('#results')!.append(row);
  releaseScratch();
};
const note = (text: string) => { const row = document.createElement('li'); row.textContent = `Measured: ${text}`; document.querySelector('#results')!.append(row); };

// 1. Gaussian blur
check('Gaussian blur at radius 0 leaves every pixel identical', () => {
  const art = dot(32, 32, 6);
  return same(run([fx('blur', { amount: 0 })], art), run([], art)) || 'pixels changed';
});
check('Gaussian blur at radius 8 spreads a hard dot without darkening its soft edge', () => {
  const art = dot(32, 32, 6), before = run([], art), after = run([fx('blur', { amount: 8 })], art);
  if (alphaCount(after) <= alphaCount(before) * 2) return `covered ${alphaCount(before)} → ${alphaCount(after)} px`;
  let worst = 0, soft = 0;
  for (let i = 0; i < after.length; i += 4) {
    const a = after[i + 3]!;
    if (a < 24 || a > 230) continue;
    soft++;
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(after[i + k]! - RED[k]!));
  }
  note(`blur 8 soft-edge pixels ${soft}, worst RGB drift ${worst}`);
  return (soft > 50 && worst <= 6) || `${soft} soft pixels, RGB drifted by ${worst}`;
});

// 2. Roughen edges is alpha-only
check('Roughen edges changes the rim, keeps the inside solid and every RGB as it was', () => {
  const art = rect(14, 14, 36, 36), before = run([], art), after = run([fx('roughen', { amount: 3 })], art);
  if (!differs(before, after)) return 'nothing changed';
  for (let y = 22; y < 42; y++) for (let x = 22; x < 42; x++) if (at(after, x, y)[3] !== 255) return `inside pixel ${x},${y} alpha ${at(after, x, y)[3]}`;
  let rim = 0;
  for (let i = 0; i < after.length; i += 4) {
    const a = after[i + 3]!;
    if (a !== before[i + 3]) rim++;
    if (a > before[i + 3]!) return `pixel ${i / 4} gained alpha`;
    if (a >= 64) for (let k = 0; k < 3; k++) if (Math.abs(after[i + k]! - RED[k]!) > 2) return `pixel ${i / 4} RGB ${[...after.slice(i, i + 3)]}`;
  }
  note(`roughen 3 px changed ${rim} rim pixels of ${alphaCount(before)}`);
  return true;
});

// 3. Determinism
check('Same seed and frame give identical pixels; Hold, a later frame and New pattern change them', () => {
  const art = rect(14, 14, 36, 36), r = (p: Partial<LayerEffect>, frame = 0) => run([fx('roughen', { amount: 4, hold: 2, ...p })], art, null, frame);
  const a = r({});
  if (!same(a, r({}))) return 'not repeatable';
  if (!same(a, r({}, 1))) return 'frame 1 should hold frame 0 on twos';
  if (same(a, r({}, 2))) return 'frame 2 (past the hold) did not change';
  if (same(r({ hold: 1 }, 0), r({ hold: 1 }, 1))) return 'hold 1 did not change on the next frame';
  if (same(a, r({ seed: 98765 }))) return 'a new seed did not change it';
  return true;
});

// 4. Target scoping (Colour on the left, Ink on the right, no overlap)
const split = { line: rect(36, 12, 22, 40, BLUE), fill: rect(6, 12, 22, 40, RED) };
check('Ink roughen leaves the Colour untouched; Colour roughen leaves the Ink untouched', () => {
  const base = run([], split.line, split.fill);
  const ink = run([fx('roughen', { amount: 4, target: 'line' })], split.line, split.fill);
  const colour = run([fx('roughen', { amount: 4, target: 'fill' })], split.line, split.fill);
  if (differs(base, ink, 0, 0, 32)) return 'Ink roughen changed the Colour side';
  if (!differs(base, ink, 32, 0, 64)) return 'Ink roughen did nothing to the Ink';
  if (differs(base, colour, 32, 0, 64)) return 'Colour roughen changed the Ink side';
  if (!differs(base, colour, 0, 0, 32)) return 'Colour roughen did nothing to the Colour';
  return true;
});
check('Whole-layer blur works on both Ink and Colour', () => {
  const base = run([], split.line, split.fill), blur = run([fx('blur', { amount: 4 })], split.line, split.fill);
  return (differs(base, blur, 0, 0, 32) && differs(base, blur, 32, 0, 64)) || 'one side was not blurred';
});

// 5. The editing layer stays clean while painting
check('While painting, the layer you draw on shows without its effects', () => {
  const p = new Project(W, H), l = p.layer, d = p.drawing(l.kind === 'drawings' ? l.exposures[0]!.drawing : '')!;
  if (l.kind !== 'drawings') return 'no drawings layer';
  rect(14, 14, 36, 36)(d.line.getContext('2d')!);
  dot(32, 32, 8, BLUE)(planeCanvas(d, 'fill').getContext('2d')!);
  const draw = () => { const c = blank(); drawEditingLayer(c.getContext('2d')!, p, p.comp, l, 0, d, new DOMMatrix()); return c.getContext('2d')!.getImageData(0, 0, W, H).data; };
  const clean = draw();
  l.effects = [fx('roughen', { amount: 6 }), fx('blur', { amount: 6 })];
  return same(clean, draw()) || 'effects leaked into the editing layer';
});

// 3. Drop shadow, glow, directional and radial blur
/** The effected layer on its padded page: pixels, pad and padded width. */
function padded(effects: LayerEffect[], line: Paint, fill: Paint | null = null) {
  const parts = { line: blank(), fill: blank() };
  line(parts.line.getContext('2d')!);
  if (fill) fill(parts.fill.getContext('2d')!);
  const out = drawEffected({ id: 'P', effects }, 0, W, H, 'all', 0, (g, part) => { if (part !== 'line') g.drawImage(parts.fill, 0, 0); if (part !== 'fill') g.drawImage(parts.line, 0, 0); })!;
  const pad = effectsPad({ id: 'P', effects });
  return { px: out.getContext('2d')!.getImageData(0, 0, out.width, out.height).data, pad, w: out.width, h: out.height };
}
const alphaAt = (r: { px: Uint8ClampedArray; w: number; pad: number }, x: number, y: number) => r.px[((y + r.pad) * r.w + x + r.pad) * 4 + 3]!;
check('Drop shadow falls down-right at 135°, at half strength, behind the art, and is padded past the page edge', () => {
  const r = padded([fx('shadow', { amount: 6 })], rect(40, 20, 24, 20)); // the art touches the right edge
  if (r.pad !== 8 || r.w !== W + 16) return `pad ${r.pad}, width ${r.w}`;
  const shadow = alphaAt(r, 66, 30), art = alphaAt(r, 50, 30), above = alphaAt(r, 50, 16);
  if (Math.abs(shadow - 128) > 3) return `shadow past the edge has alpha ${shadow}`;
  if (art !== 255 || above !== 0) return `art ${art}, above ${above}`;
  const only = padded([fx('shadow', { amount: 6, params: { only: true } })], rect(40, 20, 24, 20));
  return (alphaAt(only, 42, 22) === 0 && alphaAt(only, 50, 30) > 100) || 'Shadow only kept the art';
});
check('Glow lights up around bright art only, and Glow only drops the art', () => {
  const white = padded([fx('glow')], rect(26, 26, 12, 12, [255, 255, 255])), dark = padded([fx('glow')], rect(26, 26, 12, 12, [20, 20, 20]));
  if (alphaAt(white, 22, 32) === 0) return 'no glow next to white art';
  if (alphaAt(dark, 22, 32) !== 0) return 'dark art glowed';
  if (alphaAt(white, 32, 32) !== 255) return 'the art itself changed';
  const only = padded([fx('glow', { params: { composite: 'none' } })], rect(26, 26, 12, 12, [255, 255, 255]));
  return alphaAt(only, 32, 32) < 255 || 'Glow only still shows the solid art';
});
check('Directional blur streaks along its direction only; radial blur at 0 changes nothing', () => {
  const r = padded([fx('dirblur', { amount: 16 })], dot(32, 32, 4));
  if (alphaAt(r, 42, 32) === 0) return 'no streak sideways';
  if (alphaAt(r, 32, 42) !== 0) return 'it streaked up and down too';
  const art = dot(20, 32, 6);
  if (!same(run([fx('radialblur', { amount: 0 })], art), run([], art))) return 'amount 0 changed pixels';
  const spin = run([fx('radialblur', { amount: 40 })], art), zoom = run([fx('radialblur', { amount: 40, params: { mode: 'zoom' } })], art);
  return (differs(run([], art), spin) && differs(spin, zoom)) || 'spin and zoom did not change the art differently';
});

// 4. Stylise and distort
const ramp: Paint = (g) => { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
check('Posterize, Threshold and Mosaic', () => {
  const p = run([fx('posterize', { amount: 2 })], ramp);
  for (let i = 0; i < p.length; i += 4) if ((p[i] !== 0 && p[i] !== 255) || p[i + 3] !== 255) return `posterize 2 left ${p[i]}`;
  const t = run([fx('threshold', { amount: 128 })], ramp);
  if (at(t, 10, 5)[0] !== 0 || at(t, 54, 5)[0] !== 255) return 'threshold did not split black/white';
  const m = run([fx('mosaic', { amount: 8, size: 8 })], ramp);
  for (let x = 0; x < 8; x++) if (at(m, x, 3)[0] !== at(m, 0, 3)[0] || at(m, x, 7)[0] !== at(m, 0, 0)[0]) return 'a mosaic block is not one colour';
  return at(m, 0, 0)[0] !== at(m, 8, 0)[0] || 'neighbouring blocks match';
});
check('Find edges: dark outline on white, inside stays white; Invert flips it', () => {
  const e = run([fx('edges')], rect(16, 16, 32, 32)), inv = run([fx('edges', { params: { invert: true } })], rect(16, 16, 32, 32));
  if (at(e, 32, 32)[0] !== 255 || at(e, 16, 32)[0]! > 128) return `inside ${at(e, 32, 32)[0]}, edge ${at(e, 16, 32)[0]}`;
  return (at(inv, 32, 32)[0] === 0 && at(inv, 16, 32)[0]! > 128) || 'invert did not flip';
});
check('Twirl and Wave warp at 0 change nothing; Mirror reflects; Offset wraps; Wave warp moves over time', () => {
  const art = rect(8, 20, 20, 10);
  if (!same(run([fx('twirl', { amount: 0 })], art), run([], art))) return 'twirl 0 changed';
  if (!differs(run([fx('twirl', { amount: 180, size: 80 })], art), run([], art))) return 'twirl did nothing';
  if (!same(run([fx('wave', { amount: 0 })], art), run([], art))) return 'wave height 0 changed';
  const m = run([fx('mirror')], art); // the right half shows the left half reflected
  if (at(m, 63 - 10, 25)[3] !== 255 || at(m, 63 - 10, 25)[0] !== RED[0]) return 'mirror did not reflect onto the right';
  const o = run([fx('offset', { params: { x: 75 } })], art); // slide 16 px left, wrapping
  if (at(o, 60, 25)[3] !== 255 || at(o, 20, 25)[3] !== 0) return 'offset did not wrap';
  const w0 = run([fx('wave')], dot(32, 32, 10), null, 0), w6 = run([fx('wave')], dot(32, 32, 10), null, 6);
  return differs(w0, w6) || 'wave did not move between frames';
});

// 5. Fringe
check('Fringe trails fading copies to the right (90°), padded, and none at offset 0', () => {
  const r = padded([fx('fringe', { amount: 12, size: 4, params: { falloff: 75 } })], rect(40, 20, 20, 20));
  const near = alphaAt(r, 62, 30), far = alphaAt(r, 71, 30), left = alphaAt(r, 36, 30);
  if (!(near > far && far > 0)) return `copies near ${near}, far ${far}`;
  if (left) return 'copies on the wrong side';
  return same(run([fx('fringe', { amount: 0 })], dot(32, 32, 6)), run([], dot(32, 32, 6))) || 'offset 0 changed pixels';
});

// 6. Retro TV
check('Retro TV: Strength 0 changes nothing; seeded and repeatable; static changes with frames; Roll scrolls', () => {
  const art = rect(10, 10, 44, 44);
  if (!same(run([fx('tv', { amount: 0 })], art), run([], art))) return 'strength 0 changed pixels';
  const a = run([fx('tv')], art, null, 0);
  if (!same(a, run([fx('tv')], art, null, 0))) return 'not repeatable';
  if (!differs(a, run([], art))) return 'did nothing';
  if (same(a, run([fx('tv')], art, null, 1))) return 'static did not change on the next frame';
  if (same(a, run([fx('tv', { seed: 777 })], art, null, 0))) return 'a new seed did not change it';
  const still = { static: 0, chromaLoss: 0, chromaShift: 0 };
  const rolled = run([fx('tv', { params: { ...still, roll: 4 } })], art, null, 2); // 8 rows down
  return (at(rolled, 30, 15)[3] === 0 && at(rolled, 30, 60)[3] === 255) || `roll: ${at(rolled, 30, 15)[3]}, ${at(rolled, 30, 60)[3]}`;
});

check('In the comp, a padded effect keeps the art where it was (export path)', () => {
  const p = new Project(W, H), l = p.layer;
  if (l.kind !== 'drawings') return 'no drawings layer';
  const d = p.drawing(l.exposures[0]!.drawing)!;
  rect(20, 20, 16, 16)(d.line.getContext('2d')!);
  const out = () => { const c = blank(); drawComp(c.getContext('2d')!, p, p.comp, 0, { export: true }); return c.getContext('2d')!.getImageData(0, 0, W, H).data; };
  const plain = out();
  l.effects = [fx('shadow', { amount: 6, params: { opacity: 100 } })];
  const shadowed = out();
  if (differs(plain, shadowed, 20, 20, 36, 36)) return 'the art moved or changed';
  return at(shadowed, 38, 38)[3]! > 200 || `no shadow down-right (alpha ${at(shadowed, 38, 38)[3]})`;
});

// Undo steps through the real Effects card
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), panel = new EffectsPanel(app);
let docChanges = 0;
const dirty = app.onDocChanged; app.onDocChanged = () => { docChanges++; dirty(); };
const effects = () => { const l = app.project.layer; return l.kind === 'drawings' ? l.effects ?? [] : []; };
check('Adding an effect, moving its slider and New pattern are one undo step each', () => {
  panel.show(app.project.layer.id);
  const root = document.querySelector<HTMLElement>('.fxpanel')!;
  const add = [...root.querySelectorAll<HTMLButtonElement>('.fx-add button')].find((b) => b.textContent?.trim() === 'Roughen edges');
  if (!add) return 'no Roughen edges button';
  const start = app.history.peekUndo(), changes = docChanges;
  add.click();
  if (effects().length !== 1 || effects()[0]!.type !== 'roughen') return 'effect not added';
  const added = app.history.peekUndo();
  if (!added || added === start) return 'adding made no undo step';
  if (docChanges === changes) return 'autosave was not notified';
  const slider = root.querySelector<HTMLInputElement>('input[aria-label="Roughness"]');
  if (!slider) return 'no Roughness slider';
  slider.value = '9';
  slider.dispatchEvent(new Event('input'));
  if (app.history.peekUndo() !== added) return 'a live slider preview made an undo step';
  slider.dispatchEvent(new Event('change'));
  const moved = app.history.peekUndo();
  if (moved === added || effects()[0]!.amount !== 9) return 'letting go of the slider was not one step';
  const seed = effects()[0]!.seed;
  // New pattern is an Advanced setting; switching the card's mode is not a document edit
  const mode = localStorage.getItem('2dope.fx.mode');
  [...root.querySelectorAll<HTMLButtonElement>('.fx-mode button')].find((b) => b.textContent === 'Advanced')?.click();
  if (mode === null) localStorage.removeItem('2dope.fx.mode'); else localStorage.setItem('2dope.fx.mode', mode);
  if (app.history.peekUndo() !== moved) return 'switching to Advanced made an undo step';
  const reseed = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'New pattern');
  if (!reseed) return 'no New pattern button';
  reseed.click();
  if (effects()[0]!.seed === seed || app.history.peekUndo() === moved) return 'New pattern was not one step';
  app.history.undo();
  if (effects()[0]!.seed !== seed) return 'undo did not bring the pattern back';
  app.history.undo();
  if (effects()[0]!.amount === 9) return 'undo did not bring the roughness back';
  app.history.undo();
  if (effects().length) return 'undo did not remove the effect';
  if (app.history.peekUndo() !== start) return 'more than three steps were recorded';
  panel.close();
  return true;
});

check('A further setting (Shadow only, Direction) is one undo step each', () => {
  panel.show(app.project.layer.id);
  const root = document.querySelector<HTMLElement>('.fxpanel')!;
  [...root.querySelectorAll<HTMLButtonElement>('.fx-add button')].find((b) => b.textContent?.trim() === 'Drop shadow')?.click();
  if (effects().at(-1)?.type !== 'shadow') return 'no shadow added';
  const mode = localStorage.getItem('2dope.fx.mode');
  [...root.querySelectorAll<HTMLButtonElement>('.fx-mode button')].find((b) => b.textContent === 'Advanced')?.click();
  if (mode === null) localStorage.removeItem('2dope.fx.mode'); else localStorage.setItem('2dope.fx.mode', mode);
  const added = app.history.peekUndo();
  const only = root.querySelector<HTMLButtonElement>('button[aria-label="Shadow only"]');
  if (!only) return 'no Shadow only switch';
  only.click();
  if (effects().at(-1)!.params?.only !== true || app.history.peekUndo() === added) return 'Shadow only was not one step';
  const toggled = app.history.peekUndo();
  const dir = root.querySelector<HTMLInputElement>('input[aria-label="Direction"]')!;
  dir.value = '45'; dir.dispatchEvent(new Event('input'));
  if (app.history.peekUndo() !== toggled) return 'dragging Direction made a step';
  dir.dispatchEvent(new Event('change'));
  if (effects().at(-1)!.params?.angle !== 45 || effects().at(-1)!.params?.only !== true) return 'Direction lost a setting';
  app.history.undo(); app.history.undo(); app.history.undo();
  panel.close();
  return effects().every((e) => e.type !== 'shadow') || 'undo did not remove the shadow';
});

check('An effect setting can be keyframed (◆), animates in the export, shows in Motion and takes React to audio', () => {
  const l = app.project.layer, ed = app.editor;
  app.project.comp.duration = 24;
  ed.edit('long', (c) => { const x = c.layers.find((y) => y.id === l.id); if (x && x.kind === 'drawings') x.exposures = [{ drawing: x.exposures[0]!.drawing, length: 24 }]; });
  const d = app.project.drawing(l.exposures[0]!.drawing);
  const g = d.line.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(d.line.width / 2 - 20, d.line.height / 2 - 20, 40, 40); d.rev++;
  panel.show(l.id);
  const root = document.querySelector<HTMLElement>('.fxpanel')!;
  [...root.querySelectorAll<HTMLButtonElement>('.fx-add button')].find((b) => b.textContent?.trim() === 'Glow')!.click();
  const glow = () => effects().find((e) => e.type === 'glow')!;
  app.setFrame(0);
  const before = app.history.peekUndo();
  root.querySelector<HTMLButtonElement>('button[aria-label="Keyframe Radius"]')!.click();
  if (app.history.peekUndo() === before || app.history.peekUndo()?.label !== 'Keyframe effect' || glow().keys?.amount?.keys.length !== 1) return 'the ◆ was not one step that adds a key';
  const row = `fx:${glow().id}:amount` as const;
  if (!ed.rowsOf(app.project.layer).includes(row)) return 'no Motion row for the keyed setting';
  ed.setValue(l.id, row, 0); app.setFrame(20); ed.setValue(l.id, row, 60);
  if (glow().keys!.amount!.keys.length !== 2) return `keys ${glow().keys!.amount!.keys.length}`;
  const at = (f: number) => { const c = document.createElement('canvas'); c.width = app.project.width; c.height = app.project.height; drawComp(c.getContext('2d')!, app.project, app.project.comp, f, { export: true }); return c.getContext('2d')!.getImageData(c.width / 2 + 34, c.height / 2, 1, 1).data[3]!; };
  if (!(at(20) > at(0))) return `glow beside the art ${at(0)} → ${at(20)}`;
  ed.bakeReaction([{ layer: l.id, prop: row }], [{ frame: 5, value: 10 }, { frame: 6, value: 30 }]);
  const keys = glow().keys!.amount!.keys;
  if (app.history.peekUndo()?.label !== 'React to audio' || !keys.some((k) => k.f === 6)) return 'React to audio did not write keys on the effect setting';
  panel.close();
  return true;
});

check('An adjustment layer’s effects change the layers below it, not above, mixed by its opacity', () => {
  const p = new Project(W, H), comp = p.comp, below = p.layer;
  if (below.kind !== 'drawings') return 'no drawings layer';
  rect(10, 10, 20, 20)(p.drawing(below.exposures[0]!.drawing)!.line.getContext('2d')!);
  const adjD = p.newDrawing(), topD = p.newDrawing();
  rect(40, 40, 16, 16, BLUE)(topD.line.getContext('2d')!);
  const adj = drawingsLayer('A', 'Adjustment', [{ drawing: adjD.id, length: 1 }], W, H);
  adj.adjust = true; adj.effects = [fx('threshold', { amount: 128 })];
  const top = drawingsLayer('T', 'Top', [{ drawing: topD.id, length: 1 }], W, H);
  comp.layers.unshift(top, adj); // front first: Top, Adjustment, Drawing
  const out = () => { const c = blank(); drawComp(c.getContext('2d')!, p, p.comp, 0, { export: true }); return c.getContext('2d')!.getImageData(0, 0, W, H).data; };
  const full = out();
  if (at(full, 20, 20)[0] !== 0 || at(full, 20, 20)[3] !== 255) return `below not thresholded: ${at(full, 20, 20)}`; // red is darker than 128 → black
  if (at(full, 48, 48)[2] !== BLUE[2]) return `the layer above changed: ${at(full, 48, 48)}`;
  adj.transform.opacity.value = 50;
  const half = out()[(20 * W + 20) * 4]!;
  if (!(half > 40 && half < 200)) return `opacity did not mix (red ${half})`;
  adj.transform.opacity.value = 100; adj.effects = [];
  return at(out(), 20, 20)[0] === RED[0] || 'without effects it should change nothing';
});

// What it looks like: a thin line, a thick stroke and a filled shape (for a person to look at)
const looks = document.querySelector<HTMLElement>('#looks')!;
const art: [string, Paint][] = [
  ['thin line (1.5 px)', (g) => { g.strokeStyle = '#18181b'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, 50); g.bezierCurveTo(60, 0, 120, 110, 230, 30); g.stroke(); }],
  ['thick stroke (12 px)', (g) => { g.strokeStyle = '#18181b'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(20, 60); g.bezierCurveTo(70, 0, 150, 120, 220, 50); g.stroke(); }],
  ['filled shape', (g) => { g.fillStyle = '#e63946'; g.beginPath(); g.ellipse(120, 60, 90, 42, 0.2, 0, Math.PI * 2); g.fill(); }],
];
for (const [label, effect] of [['none', null], ['Roughen edges 3 (default)', fx('roughen')], ['Roughen edges 8', fx('roughen', { amount: 8 })], ['Gaussian blur 6 (default)', fx('blur', { target: 'line' })], ['Drop shadow 8, soft 6', fx('shadow', { amount: 8, size: 6 })], ['Glow (default)', fx('glow')], ['Wave warp (default)', fx('wave')], ['Fringe 12', fx('fringe', { amount: 12 })], ['Retro TV (default)', fx('tv')], ['Twirl 90', fx('twirl', { size: 60 })]] as const) {
  for (const [name, paint] of art) {
    const px = run(effect ? [{ ...effect, target: 'line' }] : [], paint, null, 0, 240, 120);
    const c = blank(240, 120);
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), 240, 120), 0, 0);
    c.title = `${label}: ${name}`;
    const cell = document.createElement('figure');
    cell.style.margin = '0';
    cell.append(c, Object.assign(document.createElement('figcaption'), { textContent: `${label} · ${name}` }));
    looks.append(cell);
  }
}
// a thin line keeps how much of its ink at the default roughness
{
  const [, thin] = art[0]!, plain = run([], thin, null, 0, 240, 120), rough = run([fx('roughen')], thin, null, 0, 240, 120);
  let a = 0, b = 0;
  for (let i = 3; i < plain.length; i += 4) { a += plain[i]!; b += rough[i]!; }
  note(`thin 1.5 px line keeps ${Math.round((100 * b) / a)}% of its ink at Roughen edges 3`);
  check('Roughen edges at its default keeps a thin 1.5 px line together (at least 55% of its ink)', () => (b / a >= 0.55) || `kept ${Math.round((100 * b) / a)}%`);
}

document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
