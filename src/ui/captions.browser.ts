import { App } from '../app';
import { newEffect } from '../core/effects';
import { apply } from '../core/comp';
import { Project } from '../core/project';
import { valueAt, type Prop } from '../core/anim';
import { captureProject, loadProjectFile } from '../io/projectio';
import { minimumDrawingSchema, validateProjectFile } from '../io/schema';
import { drawComp } from '../view/composite';
import { captionFontReady, captionFontsReady, setCaptionFontHooks } from '../view/captionfonts';
import { captionBalloon, captionLayout, captionSize } from '../view/caption';
import { CAPTION_KEYS, defaultCaption, type CaptionSpec } from '../lettering/spec';
import { CaptionEditor, readSavedStyles, svgOutline, writeSavedStyles } from './captioneditor';
import { captureStyle } from '../lettering/styles';
import { inside, normalizeOutline } from '../lettering/geometry';
import { MotionPanel } from './motion';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
const editor = new CaptionEditor(app);
setCaptionFontHooks({ redraw: () => app.requestRender(), source: async () => null, project: () => app.project });
app.letters.onEdit = (id, isNew) => editor.open(id, isNew);
app.history.onChange = () => editor.refresh();
Object.assign(window, { captionApp: app });
const errors: string[] = [];
app.onNotice = () => {};
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.loadProject(new Project(640, 360)); app.project.comp.duration = 96; app.setWorkspace('draw');
// a 1:1 view, so hit sizes (tail tips, taps) are the on-screen sizes
app.view.zoom = 1;

type Pt = { x: number; y: number };
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const dialog = () => document.querySelector<HTMLElement>('.caption-panel');
const inDialog = <T extends HTMLElement>(label: string) => { const f = dialog()?.querySelector<T>(`[aria-label="${label}"]`); if (!f) throw new Error(`Missing ${label}`); return f; };
const button = (name: string) => { const b = [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent === name || x.title.startsWith(name)); if (!b) throw new Error(`Missing ${name}`); return b; };
const footer = (name: string) => button(name === 'Apply' || name === 'Cancel' ? 'Done' : name);
const captions = () => app.project.comp.layers.filter(l => l.kind === 'drawings' && !!l.caption);
const cap = (id: string): CaptionSpec => { const l = app.project.comp.layers.find(x => x.id === id); if (l?.kind !== 'drawings' || !l.caption) throw new Error('caption gone'); return l.caption; };
const tap = (x: number, y: number) => { app.letters.down(1, { x, y }); app.letters.up(1, false); };
const stroke = (pts: Pt[]) => { app.letters.down(2, pts[0]!); for (const p of pts.slice(1)) app.letters.move(2, p); app.letters.up(2, false); };
const look = document.querySelector<HTMLCanvasElement>('#look')!, lg = look.getContext('2d', { willReadFrequently: true })!;
const render = (frame: number) => {
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, 640, 360); drawComp(lg, app.project, app.project.comp, frame);
  return (x: number, y: number) => [...lg.getImageData(x, y, 1, 1).data];
};
/** Dark, opaque pixels in a box (letters and ink). */
const inkIn = (x0: number, y0: number, w: number, h: number) => { const d = lg.getImageData(x0, y0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200 && d[i]! < 90) n++; return n; };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); editor.close(); }
  document.querySelector('#results')!.append(li);
};

let first = '';
await check('A tap with the Letter tool adds a caption, opens the editor, and Apply is one Undo step', async () => {
  app.setLettering(true); app.setFrame(4); app.history.clear();
  expect(app.lettering, 'Letter tool did not turn on');
  tap(320, 140);
  expect(captions().length === 1 && !!dialog(), 'no caption or no editor');
  first = captions()[0]!.id;
  expect(app.editor.open.has(first), 'a new caption is not opened in Motion');
  const l = app.project.comp.layers.find(x => x.id === first)!;
  expect(l.start === 4 && l.kind === 'drawings' && l.still, 'caption does not start at the playhead as a still');
  const t = inDialog<HTMLTextAreaElement>('Caption words');
  t.value = 'Hey! Wait for me, I have the map.'; t.dispatchEvent(new Event('input'));
  expect(cap(first).text.startsWith('Hey!'), 'typing did not preview live');
  footer('Apply').click();
  expect(!dialog() && app.history.peekUndo()?.label === 'Add caption', 'not one Add caption step: ' + app.history.peekUndo()?.label);
  app.undo(); await wait();
  expect(!captions().length, 'Undo left the caption');
  app.redo(); await wait();
  expect(cap(first).text.startsWith('Hey!'), 'Redo lost the words');
});

await check('Cancel on a brand-new caption with no words removes it', async () => {
  tap(120, 300);
  expect(captions().length === 2 && !!dialog(), 'second caption not made');
  footer('Cancel').click(); await wait();
  expect(captions().length === 1 && app.history.peekUndo()?.label === 'Add caption', 'empty caption stayed');
});

await check('The caption paints fill, ink and letters in the shared renderer, with a loaded comic font', async () => {
  await captionFontsReady(app.project);
  expect(captionFontReady(cap(first)), 'Comic Neue did not load');
  const c = cap(first), lay = captionLayout(c, 6, 640, 360);
  expect(lay.fit.lines.length >= 2, 'words did not wrap into lines');
  const at = render(10);
  const edge = at(Math.round(c.x), Math.round(c.y - lay.fit.b * 0.85));
  expect(edge[0]! > 240 && edge[3]! > 240, 'balloon fill missing inside its top ' + edge);
  expect(inkIn(Math.round(c.x - lay.fit.a * 0.7), Math.round(c.y - lay.fit.b * 0.6), Math.round(lay.fit.a * 1.4), Math.round(lay.fit.b * 1.2)) > 40, 'no letters inside the balloon');
  const tail = c.tails[0]!, tip = at(Math.round(tail.x + (c.x - tail.x) * 0.1), Math.round(tail.y + (c.y - tail.y) * 0.1));
  expect(tip[3]! > 100, 'tail not painted near its tip');
});

await check('Letter sizes follow the page height and stay the same for every caption of a size', () => {
  const c = cap(first);
  expect(Math.abs(captionSize(c, 360) - 360 * 0.034) < 1e-9 && Math.abs(captionSize(c, 720) / captionSize(c, 360) - 2) < 1e-9, 'size not tied to page height');
  const a = captionLayout({ ...c, text: 'Hi' }, 0, 640, 360);
  const b = captionLayout({ ...c, text: 'A much longer line of words that has to wrap more than once in its balloon' }, 0, 640, 360);
  expect(a.size === b.size, 'letter size changed with the amount of text');
  expect(b.fit.lines.length >= 2 && b.fit.lines.length <= 6, 'long text did not wrap into a sensible shape ' + b.fit.lines.length);
});

await check('Changing the font is live and changes the measured letters', async () => {
  const before = captionLayout(cap(first), 0, 640, 360);
  app.letters.onEdit!(first, false);
  button('Bangers').click();
  await captionFontsReady(app.project); await wait();
  expect(cap(first).font === 'bangers' && app.history.peekUndo()?.label === 'Change caption font', 'font change not applied');
  expect(dialog()!.querySelector('[role=radio][aria-checked=true]')?.textContent?.includes('Bangers'), 'panel did not show the new font');
  footer('Apply').click();
  expect(captionFontReady(cap(first)), 'Bangers did not load');
  const after = captionLayout(cap(first), 0, 640, 360);
  expect(JSON.stringify(after.fit.lines) !== JSON.stringify(before.fit.lines), 'measurement ignored the new font');
});

await check('The panel previews the caption and its sliders commit one Undo step each', async () => {
  app.focusLayer(first); app.letters.onEdit!(first, false);
  const pv = dialog()!.querySelector<HTMLCanvasElement>('.cap-preview canvas')!, pg = pv.getContext('2d')!;
  const dark = () => { const d = pg.getImageData(0, 0, pv.width, pv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i]! < 80) n++; return n; };
  expect(dark() > 200, 'preview shows no lettering');
  const lines = captionLayout(cap(first), 0, 640, 360).fit.lines.length;
  const width = inDialog<HTMLInputElement>('Width'); width.value = '220'; width.dispatchEvent(new Event('input'));
  expect(cap(first).shape === 2.2 && app.history.peekUndo()?.label !== 'Change balloon width', 'width did not preview live');
  width.dispatchEvent(new Event('change'));
  expect(app.history.peekUndo()?.label === 'Change balloon width' && captionLayout(cap(first), 0, 640, 360).fit.lines.length < lines, 'wider balloon did not give fewer lines');
  const ink = inDialog<HTMLInputElement>('Ink width'); ink.value = '20'; ink.dispatchEvent(new Event('input')); ink.dispatchEvent(new Event('change'));
  expect(cap(first).inkWidth === 0.2 && app.history.peekUndo()?.label === 'Balloon ink width', 'ink width not kept');
  const track = inDialog<HTMLInputElement>('Tracking'); track.value = '40'; track.dispatchEvent(new Event('input')); track.dispatchEvent(new Event('change'));
  expect(cap(first).values?.tracking === 40, 'tracking slider did not set the value');
  app.undo(); await wait(); app.undo(); await wait(); app.undo(); await wait();
  expect(!cap(first).shape && cap(first).inkWidth === 0.09 && !cap(first).values?.tracking, 'three Undo steps did not restore the caption');
  expect(inDialog<HTMLInputElement>('Width').value === '100', 'panel did not follow Undo');
  // tabs: one group at a time, and the panel keeps its place after a change
  const tabs = [...dialog()!.querySelectorAll<HTMLButtonElement>('[role=tab]')].map(t => t.textContent);
  expect(JSON.stringify(tabs) === JSON.stringify(['AaLetters', 'Balloon', 'Tails', 'Animate', 'Place', 'Styles']), 'tabs wrong: ' + tabs.join());
  const tab = (name: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(t => t.textContent?.endsWith(name))!;
  tab('Balloon').click();
  const panes = [...dialog()!.querySelectorAll<HTMLElement>('.cap-pane')].filter(x => !x.hidden);
  expect(panes.length === 1 && panes[0]!.getAttribute('aria-label') === 'Balloon', 'Balloon tab did not show its pane alone');
  const body = dialog()!.querySelector<HTMLElement>('.cap-body')!;
  body.style.maxHeight = '120px'; body.scrollTop = 60; const top = body.scrollTop;
  const ink2 = inDialog<HTMLInputElement>('Ink width'); ink2.value = '12'; ink2.dispatchEvent(new Event('input')); ink2.dispatchEvent(new Event('change'));
  const body2 = dialog()!.querySelector<HTMLElement>('.cap-body')!;
  expect(top > 0 && body2.scrollTop === top && !dialog()!.querySelector<HTMLElement>('.cap-pane[aria-label=Balloon]')!.hidden, `panel jumped after a change: ${top} → ${body2.scrollTop}`);
  app.undo(); await wait();
  tab('Tails').click();
  button('Add tail').click();
  expect(cap(first).tails.length === 2 && app.history.peekUndo()?.label === 'Add caption tail', 'Add tail failed');
  expect(dialog()!.querySelectorAll('.cap-tail').length === 2, 'panel did not list the new tail');
  app.undo(); await wait();
  footer('Apply').click();
});

await check('Canvas handles: bend a tail, straighten it, and widen the balloon', async () => {
  app.focusLayer(first); app.setFrame(10);
  const l = app.project.comp.layers.find(x => x.id === first)!;
  if (l.kind !== 'drawings') throw new Error('not drawings');
  const h = app.letters.handles(l)!;
  expect(h.tips.length === 1 && h.bends.length === 1 && !!h.width, 'handles missing');
  const b = h.bends[0]!;
  app.letters.down(5, b); app.letters.move(5, { x: b.x + 40, y: b.y }); app.letters.up(5, false);
  expect(cap(first).tails[0]!.bend && Math.abs(cap(first).tails[0]!.bend![0] - (b.x + 40)) < 1 && app.history.peekUndo()?.label === 'Bend caption tail', 'bend handle failed');
  const nb = app.letters.handles(l)!.bends[0]!;
  expect(Math.abs(nb.x - (b.x + 40)) < 1, 'bend handle not at the bend');
  app.letters.down(6, nb); app.letters.up(6, false); app.letters.down(6, nb); app.letters.up(6, false);
  expect(!cap(first).tails[0]!.bend && app.history.peekUndo()?.label === 'Straighten caption tail', 'double-tap did not straighten');
  const w = h.width!, a0 = w.x - cap(first).x;
  app.letters.down(7, w); app.letters.move(7, { x: w.x + a0 * 0.5, y: w.y }); app.letters.up(7, false);
  expect(Math.abs((cap(first).shape ?? 1) - 1.5) < 0.05 && app.history.peekUndo()?.label === 'Change balloon width', 'width grip failed: ' + cap(first).shape);
  app.undo(); await wait();
});

await check('Balloon looks: presets, spikes, and an imported SVG shape that the words fit inside', async () => {
  // the reference balloon from the owner (an Affinity export with nested group transforms)
  const svg = '<svg width="944px" height="433px" version="1.1" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1,0,0,1,-627.125518,-358.125518)"><g transform="matrix(4.166667,0,0,4.166667,1464.321929,440.921296)"><path d="M0,64.003C21.343,51.227 24.604,6.013 -16.604,-4.319C-47.953,-12.179 -146.645,-11.544 -171.203,-2.887C-195.562,5.7 -201.469,55.698 -164.718,65.592C-125.379,76.182 -41.396,76.162 -9.79,67.818L0,64.003Z" style="fill:white;stroke:rgb(35,31,32);stroke-width:2px;"/></g></g></svg>';
  const pts = svgOutline(svg)!;
  expect(pts && pts.length > 100, 'SVG outline not read');
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  // the curve spans about 207 × 84 units inside a ×4.17 group: about 860 × 350 once transformed
  expect(w > 800 && w < 960 && Math.abs(w / h - 2.46) < 0.2, `group transforms not applied (${w.toFixed()} × ${h.toFixed()})`);
  expect(svgOutline('<svg xmlns="http://www.w3.org/2000/svg"></svg>') === null && svgOutline('not svg') === null, 'empty or broken SVG accepted');
  app.focusLayer(first); app.letters.onEdit!(first, false);
  const outline = normalizeOutline(pts);
  app.editor.edit('Balloon shape from SVG', c => { const l = c.layers.find(x => x.id === first); if (l?.kind === 'drawings' && l.caption) l.caption = { ...l.caption, look: { outline } }; });
  await wait();
  const c = cap(first), { lay, shapes } = captionBalloon(c, 0, 640, 360);
  for (const l of lay.fit.lines) for (const sx of [-1, 1]) for (const sy of [-1, 1]) expect(inside(shapes.outline, { x: c.x + (sx * l.width) / 2, y: c.y + l.y + (sy * lay.size) / 2 }), 'a line pokes out of the SVG balloon');
  expect(button('Clear shape'), 'no Clear shape for a custom outline');
  button('Clear shape').click();
  expect(!cap(first).look?.outline && app.history.peekUndo()?.label === 'Clear balloon shape', 'Clear shape failed');
  button('Oval').click();
  expect(cap(first).look?.round === 2 && app.history.peekUndo()?.label === 'Balloon look: oval', 'Oval preset failed');
  const round = inDialog<HTMLInputElement>('Roundness'); round.value = '45'; round.dispatchEvent(new Event('input')); round.dispatchEvent(new Event('change'));
  expect(cap(first).look?.round === 4.5, 'Roundness slider failed');
  button('Classic').click();
  expect(!cap(first).look, 'Classic did not return to the default look');
  button('Shout').click();
  const spikes = inDialog<HTMLInputElement>('Spikes'); spikes.value = '8'; spikes.dispatchEvent(new Event('input')); spikes.dispatchEvent(new Event('change'));
  expect(cap(first).look?.spikes === 8 && captionBalloon(cap(first), 0, 640, 360).shapes.outline.length >= 16, 'spikes not applied');
  for (let i = 0; i < 7; i++) { app.undo(); await wait(30); }
  expect(cap(first).style === 'speech' && !cap(first).look, 'Undo did not return to the plain balloon: ' + JSON.stringify(cap(first).look) + cap(first).style);
  footer('Apply').click();
});

await check('Draw shape redraws a balloon from a loop; Edit shape reshapes it with handles; Turn and Mirror', async () => {
  app.focusLayer(first); app.letters.onEdit!(first, false); app.setFrame(10);
  const tab = (name: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(t => t.textContent?.endsWith(name))!;
  tab('Balloon').click();
  button('Draw shape').click();
  expect(app.letters.shapeTarget === first && app.lettering, 'Draw shape did not arm the tool');
  // a tilted, lopsided loop drawn somewhere else on the canvas
  const loop: Pt[] = [];
  for (let i = 0; i <= 80; i++) { const t = (i / 80) * Math.PI * 2, x = Math.cos(t) * (Math.cos(t) < 0 ? 110 : 70), y = Math.sin(t) * 40; loop.push({ x: 480 + x * Math.cos(0.5) - y * Math.sin(0.5), y: 260 + x * Math.sin(0.5) + y * Math.cos(0.5) }); }
  const before = captions().length;
  stroke(loop);
  expect(captions().length === before && !!cap(first).look?.outline && app.history.peekUndo()?.label === 'Draw balloon shape' && !app.letters.shapeTarget, 'loop did not become the balloon shape');
  const o = cap(first).look!.outline!, mid = o.filter(([, y]) => Math.abs(y) < 0.06).map(([x]) => x);
  expect(Math.max(...mid) > 0.6 && Math.min(...mid) < -0.6, 'tilted shape was not turned to run with the words');
  await wait();
  button('Edit shape').click();
  const l = app.project.comp.layers.find(x => x.id === first)!;
  if (l.kind !== 'drawings') throw new Error('not drawings');
  const hs = app.letters.shapeHandles(l);
  expect(hs.length === 16, 'no reshape handles');
  // the top handle, pulled up a little (handles near the sides would hit the shape's limits)
  const h0 = hs[4]!, { fit } = captionLayout(cap(first), 0, 640, 360);
  app.letters.down(8, h0.p); app.letters.move(8, { x: h0.p.x, y: h0.p.y - 12 }); app.letters.up(8, false);
  const moved = cap(first).look!.outline![h0.index]!;
  expect(Math.abs(moved[1] - (o[h0.index]![1] - 12 / fit.b)) < 0.02 && app.history.peekUndo()?.label === 'Reshape balloon', 'reshape handle failed');
  await wait();
  button('Turn 90°').click();
  expect(app.history.peekUndo()?.label === 'Turn balloon shape', 'Turn failed');
  button('Mirror').click();
  expect(app.history.peekUndo()?.label === 'Mirror balloon shape', 'Mirror failed');
  for (let i = 0; i < 4; i++) { app.undo(); await wait(30); }
  expect(!cap(first).look?.outline, 'Undo did not restore the balloon');
  footer('Apply').click();
  expect(!app.letters.shapeEditing && !app.letters.shapeTarget, 'closing the panel left shape editing on');
});

await check('Each tail style shows its own settings in the Tails tab', async () => {
  app.focusLayer(first); app.letters.onEdit!(first, false);
  const tab = (name: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(t => t.textContent?.endsWith(name))!;
  tab('Tails').click();
  const pane = () => dialog()!.querySelector<HTMLElement>('.cap-pane[aria-label=Tails]')!;
  const labels = () => [...pane().querySelectorAll('input[type=range]')].map(i => i.getAttribute('aria-label'));
  expect(JSON.stringify(labels()) === '["Base width","Taper","Tip"]', 'joined tail settings: ' + labels().join());
  [...pane().querySelectorAll<HTMLButtonElement>('[role=radio]')].find(b => b.textContent === 'Bubbles')!.click();
  expect(JSON.stringify(labels()) === '["Spread","Bubble count","Bubble size","Shrink"]', 'bubble settings: ' + labels().join());
  const count = inDialog<HTMLInputElement>('Bubble count'); count.value = '5'; count.dispatchEvent(new Event('input')); count.dispatchEvent(new Event('change'));
  expect(cap(first).tails[0]!.count === 5 && captionBalloon(cap(first), 0, 640, 360).shapes.bubbles.length === 5, 'bubble count not applied');
  [...pane().querySelectorAll<HTMLButtonElement>('[role=radio]')].find(b => b.textContent === 'Lightning')!.click();
  expect(JSON.stringify(labels()) === '["Base width","Zigs","Zig width"]', 'lightning settings: ' + labels().join());
  for (let i = 0; i < 3; i++) { app.undo(); await wait(30); }
  expect(cap(first).tails[0]!.join === 'merged' && !cap(first).tails[0]!.count, 'Undo did not restore the tail');
  footer('Apply').click();
});

await check('Effects can target a caption’s text, balloon ink or fill separately', async () => {
  app.setFrame(10);
  const l = app.project.comp.layers.find(x => x.id === first)!;
  const c = cap(first), lay = captionLayout(c, 6, 640, 360), line = lay.fit.lines[0]!;
  const recolour = (target: 'text' | 'line', color: string) => { const e = newEffect('fill', 'fx1', 1); e.target = target; e.params = { ...e.params, color, mode: 'replace' }; return e; };
  // count red letter pixels and green ink pixels in the frame
  const census = () => {
    render(10);
    const d = lg.getImageData(0, 0, 640, 360).data; let red = 0, green = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3]! < 200) continue; if (d[i]! > 180 && d[i + 1]! < 90 && d[i + 2]! < 90) red++; else if (d[i + 1]! > 150 && d[i]! < 90) green++; else if (d[i]! < 70 && d[i + 1]! < 70 && d[i + 2]! < 70) dark++; }
    return { red, green, dark };
  };
  try {
  const plain = census();
  expect(plain.dark > 200 && plain.red === 0, 'plain caption not as expected');
  l.effects = [recolour('text', '#e00000')];
  const text = census();
  // the letters turn red; the balloon's ink stays dark; the fill stays white
  expect(text.red > 100 && text.dark > 40 && text.dark < plain.dark, `Text target did not recolour only the letters: ${JSON.stringify(text)}`);
  const fillPx = lg.getImageData(Math.round(c.x), Math.round(c.y + lay.fit.b * 0.8), 1, 1).data;
  expect(fillPx[0]! > 240 && fillPx[1]! > 240, 'balloon fill changed');
  l.effects = [recolour('line', '#00c000')];
  const ink = census();
  expect(ink.green > 100 && ink.dark > 100 && ink.red === 0, `Balloon ink target changed the letters too: ${JSON.stringify(ink)}`);
  expect(line.width > 0, 'no line');
  } finally { delete l.effects; }
});

await check('Strokes painted on a caption layer show in the composite (Motion, exports)', () => {
  const l = app.project.comp.layers.find(x => x.id === first)!;
  if (l.kind !== 'drawings') throw new Error('not drawings');
  const d = app.project.drawings.get(l.exposures[0]!.drawing!)!;
  const g = d.line.getContext('2d')!; g.fillStyle = '#0000ff'; g.fillRect(20, 300, 30, 30); d.rev++;
  const at = render(10);
  const px = at(35, 315);
  expect(px[2]! > 200 && px[0]! < 60 && px[3]! > 200, 'the stroke on the caption layer did not render: ' + px);
  g.clearRect(20, 300, 30, 30); d.rev++;
});

await check('Turn and scale a caption with its handles, around the balloon, one Undo each', async () => {
  app.setLettering(true); app.focusLayer(first); app.setFrame(10);
  const l = app.project.comp.layers.find(x => x.id === first)!;
  if (l.kind !== 'drawings') throw new Error('not drawings');
  const c = cap(first), centre = () => apply(app.editor.matrixOf(l), [cap(first).x, cap(first).y]);
  const before = centre(), h = app.letters.handles(l)!;
  const turn = apply(app.editor.matrixOf(l), [h.turn.x, h.turn.y]);
  // drag the turn handle a quarter turn clockwise around the centre
  const r = Math.hypot(turn[0] - before[0], turn[1] - before[1]);
  app.letters.down(9, { x: turn[0], y: turn[1] }); app.letters.move(9, { x: before[0] + r * 0.7, y: before[1] - r * 0.7 }); app.letters.move(9, { x: before[0] + r, y: before[1] }); app.letters.up(9, false);
  const live = app.project.comp.layers.find(x => x.id === first)!;
  expect(Math.abs(live.transform.rotation.value - 90) < 0.5 && app.history.peekUndo()?.label === 'Turn caption', 'turn failed: ' + live.transform.rotation.value);
  const after = apply(app.editor.matrixOf(live), [c.x, c.y]);
  expect(Math.hypot(after[0] - before[0], after[1] - before[1]) < 0.5, 'the balloon moved while turning');
  const h2 = app.letters.handles(live as typeof l)!, sq = apply(app.editor.matrixOf(live), [h2.scale.x, h2.scale.y]);
  app.letters.down(10, { x: sq[0], y: sq[1] }); app.letters.move(10, { x: before[0] + (sq[0] - before[0]) * 1.5, y: before[1] + (sq[1] - before[1]) * 1.5 }); app.letters.up(10, false);
  const sized = app.project.comp.layers.find(x => x.id === first)!;
  expect(Math.abs(sized.transform.scale.value[0] - 150) < 1 && app.history.peekUndo()?.label === 'Scale caption', 'scale failed: ' + sized.transform.scale.value);
  app.undo(); await wait(); app.undo(); await wait();
  const back = app.project.comp.layers.find(x => x.id === first)!;
  expect(back.transform.rotation.value === 0 && back.transform.scale.value[0] === 100, 'Undo did not restore the caption');
  // Transform on a caption switches to these handles
  app.setTool('brush'); app.toggleDrawTransform();
  expect(app.lettering && !app.transforming, 'Transform on a caption did not hand over to the Letter tool');
});

await check('Caption styles: apply a ready-made one, save your own, and import one that brings its font', async () => {
  writeSavedStyles([]);
  app.focusLayer(first); app.letters.onEdit!(first, false);
  const tab = (name: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(t => t.textContent?.endsWith(name))!;
  tab('Styles').click();
  const cards = () => [...dialog()!.querySelectorAll<HTMLButtonElement>('.cap-style-use')];
  expect(cards().length === 6, 'ready-made styles missing: ' + cards().length);
  const words = cap(first).text, where = [cap(first).x, cap(first).y], tip = { ...cap(first).tails[0]! };
  cards().find(b => b.textContent === 'Big shout')!.click();
  const c = cap(first);
  expect(c.style === 'shout' && c.font === 'bangers' && c.fill === '#fff36b' && app.history.peekUndo()?.label === 'Caption style: Big shout', 'Big shout not applied');
  expect(c.text === words && c.x === where[0] && c.tails[0]!.x === tip.x && c.tails[0]!.y === tip.y, 'style changed the words, place or tail tip');
  // save this look under a name (the name dialog)
  button('Save this style…').click(); await wait();
  const ask = document.querySelector<HTMLDialogElement>('dialog[open]:not(.caption-editor)')!;
  const input = ask.querySelector<HTMLInputElement>('input')!; input.value = 'Our shout'; input.dispatchEvent(new Event('input'));
  [...ask.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Save')!.click(); await wait();
  expect(readSavedStyles().length === 1 && readSavedStyles()[0]!.name === 'Our shout', 'style not saved');
  expect(cards().length === 7 && cards()[0]!.textContent === 'Our shout', 'saved style not listed first');
  app.undo(); await wait();
  expect(cap(first).style === 'speech', 'Undo did not restore the look');
  // a shared file that carries its own font: using it adds the font to the project
  const bytes = new Uint8Array(await (await fetch('/fonts/IndieFlower-Regular.ttf')).arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const shared = { ...captureStyle({ ...cap(first), font: 'custom:theirs' }, 'shared1', 'From a friend'), font: { name: 'Friend Hand', ext: 'ttf', data: btoa(bin) } };
  const fontsBefore = app.project.fonts.size;
  (editor as unknown as { useStyle(s: unknown): void }).useStyle(JSON.parse(JSON.stringify(shared)));
  expect(app.project.fonts.size === fontsBefore + 1 && cap(first).font.startsWith('custom:') && cap(first).font !== 'custom:theirs', 'the style’s font was not added');
  await captionFontsReady(app.project);
  expect(captionFontReady(cap(first)), 'the imported style font did not load');
  app.undo(); await wait();
  writeSavedStyles([]);
  footer('Apply').click();
});

await check('Motion shows the caption settings as rows, ready to key', () => {
  const l = app.project.comp.layers.find(x => x.id === first)!;
  const rows = app.editor.rowsOf(l).filter(r => r.startsWith('cap:'));
  expect(rows.length === CAPTION_KEYS.length, 'caption rows missing: ' + rows.join());
  app.setLettering(false); app.setWorkspace('motion'); app.editor.select(first); app.editor.open.add(first); motion.update();
  const names = [...document.querySelectorAll('#motion .pname.fx')].map(n => n.textContent ?? '');
  expect(names.some(n => n.includes('Reveal')), 'Motion did not list caption rows: ' + names.join('|'));
  const sc = document.querySelector<HTMLElement>('#motion .mscroll')!;
  document.querySelector<HTMLElement>('#motion')!.style.cssText = 'position:fixed;left:0;bottom:0;width:600px;height:160px;display:flex;flex-direction:column;z-index:300'; sc.style.height = '120px'; sc.style.flex = 'none'; sc.style.overflow = 'auto'; motion.update();
  sc.scrollTop = 80; const before = sc.scrollTop;
  app.editor.setValue(first, 'cap:tracking', 12, 'Change tracking');
  motion.update();
  expect(before > 0 && sc.scrollTop === before, `Motion jumped to the top after an edit: ${before} → ${sc.scrollTop}`);
  expect(cap(first).values?.tracking === 12, 'row edit did not reach the caption');
  app.undo();
  app.setWorkspace('draw'); app.setLettering(true);
});

await check('Fade in and Type on presets key the caption at the playhead and render over time', async () => {
  app.focusLayer(first); app.setFrame(4);
  app.captionPreset('fadeIn'); app.captionPreset('typeOn');
  const c = cap(first), op = c.keys!.textOpacity as unknown as Prop<number>, rev = c.keys!.reveal as unknown as Prop<number>;
  expect(valueAt(op, 0) === 0 && valueAt(op, 8) === 100 && valueAt(rev, 0) === 0, 'preset keys wrong');
  const lay = captionLayout(c, 60, 640, 360), box = [Math.round(c.x - lay.fit.a * 0.7), Math.round(c.y - lay.fit.b * 0.6), Math.round(lay.fit.a * 1.4), Math.round(lay.fit.b * 1.2)] as const;
  render(4);
  expect(inkIn(...box) < 5, 'faded-in caption visible on its first frame');
  render(60);
  expect(inkIn(...box) > 40, 'caption not fully shown later');
  app.undo(); await wait(); app.undo(); await wait();
  expect(!cap(first).keys?.textOpacity && !cap(first).keys?.reveal, 'Undo kept preset keys');
});

let speechId = '';
await check('A drawn loop becomes a recognised balloon; a line out of it becomes its tail', async () => {
  const write = (words: string) => { const t = inDialog<HTMLTextAreaElement>('Caption words'); t.value = words; t.dispatchEvent(new Event('input')); footer('Apply').click(); };
  app.setFrame(0); const n = captions().length;
  const box: Pt[] = [];
  for (let i = 0; i <= 40; i++) box.push({ x: 380 + i * 5, y: 40 });
  for (let i = 1; i <= 20; i++) box.push({ x: 580, y: 40 + i * 5 });
  for (let i = 1; i <= 40; i++) box.push({ x: 580 - i * 5, y: 140 });
  for (let i = 1; i <= 20; i++) box.push({ x: 380, y: 140 - i * 5 });
  stroke(box);
  expect(!!dialog(), 'drawn balloon did not open the editor'); write('Meanwhile, at the lab...');
  expect(captions().length === n + 1, 'loop did not make a caption');
  const made = cap(captions().find(l => l.id !== first && Math.abs(cap(l.id).x - 480) < 5)!.id);
  expect(made.style === 'box', 'box not recognised: ' + made.style);
  const oval: Pt[] = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; oval.push({ x: 160 + Math.cos(a) * 90, y: 90 + Math.sin(a) * 50 }); }
  stroke(oval);
  write('Over here!'); await wait();
  const speech = captions().find(l => Math.abs(cap(l.id).x - 160) < 5);
  expect(speech && cap(speech.id).style === 'speech', 'oval not recognised as speech: ' + (speech ? cap(speech.id).style : 'none'));
  speechId = speech!.id;
  // press inside (not on the edge) moves the balloon; nothing is drawn
  app.letters.down(4, { x: 160, y: 90 }); app.letters.move(4, { x: 170, y: 95 }); app.letters.up(4, true);
  expect(cap(speechId).x === 160 || Math.abs(cap(speechId).x - 160) < 5, 'cancelled move changed the balloon');
  const edge = captionBalloon(cap(speechId), 0, 640, 360).shapes.outline.reduce((m, p) => (p.y > m.y ? p : m));
  const line: Pt[] = []; for (let i = 0; i <= 20; i++) line.push({ x: edge.x + i * ((220 - edge.x) / 20), y: edge.y + i * ((220 - edge.y) / 20) });
  stroke(line);
  const t = cap(speechId).tails;
  expect(t.length === 1 && Math.abs(t[0]!.x - 220) < 2 && Math.abs(t[0]!.y - 220) < 2, 'tail not drawn to the line end ' + JSON.stringify(t));
  expect(app.history.peekUndo()?.label === 'Draw caption tail', 'tail not one Undo step');
});

await check('Dragging a tail tip re-aims it in one Undo step', () => {
  const tip = cap(speechId).tails[0]!;
  app.letters.down(3, { x: tip.x, y: tip.y }); app.letters.move(3, { x: tip.x - 60, y: tip.y + 10 }); app.letters.up(3, false);
  const now = cap(speechId).tails[0]!;
  expect(Math.abs(now.x - (tip.x - 60)) < 1 && app.history.peekUndo()?.label === 'Aim caption tail', 'tail tip not re-aimed');
});

await check('Story: a dialogue line becomes a caption timed to the animatic', () => {
  app.setLettering(false); app.setWorkspace('board'); app.createBoard();
  const b = app.board!; b.exposures[0]!.length = 48; b.exposures[0]!.dialogue = 'Mia: Run!\nLeo: Where to?';
  const id = app.captionFromDialogue(0, 'Leo', 'Where to?');
  expect(id, 'no caption from the line');
  const l = app.project.comp.layers.find(x => x.id === id)!, c = cap(id!);
  expect(c.text === 'Where to?' && l.start > b.start && l.name.includes('Leo'), 'caption words, start or name wrong ' + JSON.stringify({ start: l.start, name: l.name }));
  const op = c.keys!.balloonOpacity as unknown as Prop<number>, last = op.keys.at(-1)!;
  expect(valueAt(op, 0) === 0 && valueAt(op, 6) > 50 && last.v === 0 && l.start + last.f <= b.start + 48, 'caption not timed to its line');
  expect(app.history.peekUndo()?.label === 'Caption from dialogue', 'not one Undo step: ' + app.history.peekUndo()?.label);
  expect(app.captionFromDialogue(0, 'Leo', 'Not on the board') === null, 'unknown line accepted');
  app.setWorkspace('draw');
});

await check('Archives keep captions and imported fonts and need reader 10; plain projects stay older', async () => {
  const bytes = new Uint8Array(await (await fetch('/fonts/PatrickHand-Regular.ttf')).arrayBuffer());
  expect(bytes.length > 1000, 'test font not served');
  app.project.fonts.set('ftest', { name: 'Test Hand', path: 'assets/testhand.ttf', bytes });
  app.editor.edit('Use imported font', c => { const l = c.layers.find(x => x.id === first); if (l?.kind === 'drawings' && l.caption) l.caption = { ...l.caption, font: 'custom:ftest' }; });
  await captionFontsReady(app.project);
  expect(captionFontReady(cap(first)), 'imported font did not load');
  const saved = await captureProject(app.project, { mode: 'archive' }).settle();
  expect(saved.file.schema === 10, 'caption project not gated at 10: ' + saved.file.schema);
  const back = loadProjectFile(validateProjectFile(saved.file)).project;
  const bl = back.comp.layers.find(x => x.id === first);
  expect(bl?.kind === 'drawings' && bl.caption?.font === 'custom:ftest' && bl.caption.text.startsWith('Hey!'), 'caption lost on reload');
  expect(back.fonts.get('ftest')?.name === 'Test Hand', 'imported font not kept');
  const plain = await captureProject(new Project(320, 180), { mode: 'archive' }).settle();
  expect(minimumDrawingSchema(plain.file.drawings, plain.file.comps) < 10, 'plain project needs reader 10');
  const bad = structuredClone(saved.file);
  const badCap = (bad.comps[bad.main]!.layers.find(l => l.id === first) as unknown as { caption: { size: string; v: number } }).caption;
  badCap.size = 'huge';
  const read = validateProjectFile(structuredClone(bad)).comps[bad.main]!.layers.find(l => l.id === first)!.caption!;
  expect(read.size === 'body', 'an unknown size was not read as Body');
  badCap.v = 2;
  expect((() => { try { validateProjectFile(bad); return false; } catch { return true; } })(), 'a newer caption format was accepted');
});

await check('Two hundred caption layouts stay fast', () => {
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) captionLayout({ ...defaultCaption(100, 100), text: `Line ${i} with a few words to wrap` }, 0, 640, 360);
  const ms = performance.now() - t0;
  const li = document.createElement('li'); li.textContent = `Measured: 200 caption layouts ${ms.toFixed(1)} ms`; document.querySelector('#results')!.append(li);
  expect(ms < 1500, `200 layouts took ${ms.toFixed()}ms`);
});

await check('No page errors', () => { expect(!errors.length, errors.join(' | ')); });
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
