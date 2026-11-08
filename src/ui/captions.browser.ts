import { App } from '../app';
import { Project } from '../core/project';
import { valueAt, type Prop } from '../core/anim';
import { captureProject, loadProjectFile } from '../io/projectio';
import { minimumDrawingSchema, validateProjectFile } from '../io/schema';
import { drawComp } from '../view/composite';
import { captionFontReady, captionFontsReady, setCaptionFontHooks } from '../view/captionfonts';
import { captionBalloon, captionLayout, captionSize } from '../view/caption';
import { CAPTION_KEYS, defaultCaption, type CaptionSpec } from '../lettering/spec';
import { CaptionEditor } from './captioneditor';
import { MotionPanel } from './motion';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
const editor = new CaptionEditor(app);
setCaptionFontHooks({ redraw: () => app.requestRender(), source: async () => null, project: () => app.project });
app.letters.onEdit = (id, isNew) => editor.open(id, isNew);
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
const dialog = () => document.querySelector<HTMLDialogElement>('dialog.caption-editor[open]');
const inDialog = <T extends HTMLElement>(label: string) => { const f = dialog()?.querySelector<T>(`[aria-label="${label}"]`); if (!f) throw new Error(`Missing ${label}`); return f; };
const footer = (name: string) => { const b = [...dialog()!.querySelectorAll<HTMLButtonElement>('.vfoot button')].find(x => x.textContent === name); if (!b) throw new Error(`Missing ${name}`); return b; };
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
  const f = inDialog<HTMLSelectElement>('Font'); f.value = 'bangers'; f.dispatchEvent(new Event('change'));
  await captionFontsReady(app.project); await wait();
  footer('Apply').click();
  expect(cap(first).font === 'bangers' && app.history.peekUndo()?.label === 'Edit caption', 'font change not applied');
  expect(captionFontReady(cap(first)), 'Bangers did not load');
  const after = captionLayout(cap(first), 0, 640, 360);
  expect(JSON.stringify(after.fit.lines) !== JSON.stringify(before.fit.lines), 'measurement ignored the new font');
});

await check('Motion shows the caption settings as rows, ready to key', () => {
  const l = app.project.comp.layers.find(x => x.id === first)!;
  const rows = app.editor.rowsOf(l).filter(r => r.startsWith('cap:'));
  expect(rows.length === CAPTION_KEYS.length, 'caption rows missing: ' + rows.join());
  app.setLettering(false); app.setWorkspace('motion'); app.editor.select(first); app.editor.open.add(first); motion.update();
  const names = [...document.querySelectorAll('#motion .pname.fx')].map(n => n.textContent ?? '');
  expect(names.some(n => n.includes('Reveal')), 'Motion did not list caption rows: ' + names.join('|'));
  app.editor.setValue(first, 'cap:tracking', 12, 'Change tracking');
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
