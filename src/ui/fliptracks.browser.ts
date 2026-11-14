/**
 * Flipbook tracks after the Procreate Dreams research: track headers and colours by kind, trim at
 * both ends with snapping, lift-and-drag, pinch that zooms and pans, a flick that glides, and
 * scrolling while a drag is near the strip's end.
 */
import { App } from '../app';
import { Project } from '../core/project';
import type { DrawingsLayer } from '../core/comp';
import { closeContextMenu } from './contextmenu';
import { FlipMode } from './flipmode';

// this fixture switches the Flipbook on; put every saved setting back when it ends (later fixtures share them)
const savedSettings = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)!]));
const stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, stage);
const errors: string[] = [];
addEventListener('error', (e) => errors.push(e.message));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
app.loadProject(new Project(128, 128));
app.project.comp.duration = 240;
app.setWorkspace('draw');
const flip = new FlipMode(app, stage);
app.onFrameChange = () => flip.update();
app.history.onChange = () => flip.update();
app.editor.onChange = () => flip.update();
const wait = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); }
  document.querySelector('#results')!.append(li);
};

// Track A (animation): four drawings of two frames. Track B (animation): 7 + 3 frames. A background still.
const A = app.project.activeLayer;
for (let i = 0; i < 3; i++) app.appendFrame();
const setLengths = (lengths: number[]) => {
  const before = app.project.exposures;
  const after = before.map((e, i) => ({ ...e, length: lengths[i] ?? e.length }));
  app.previewExposures(after);
  app.commitExposures('Fixture holds', before, after);
};
setLengths([2, 2, 2, 2]);
app.addFlipTrack();
const B = app.project.activeLayer;
const d2 = app.project.newDrawing().id;
app.editor.edit('Fixture track', (c) => {
  const l = c.layers.find((x) => x.id === B) as DrawingsLayer;
  l.exposures = [{ drawing: l.exposures[0]!.drawing, length: 7 }, { drawing: d2, length: 3 }];
});
app.addStillLayer('background');
const BG = app.project.activeLayer;
app.pickLayer(A);
// (a new track's frames reach the first track's end: set A's holds last)
setLengths([2, 2, 2, 2]);
app.history.clear();
app.setFrame(0);
flip.set(true);
flip.update();
await wait(200);

const layer = (id: string) => app.project.comp.layers.find((l) => l.id === id) as DrawingsLayer;
const lengths = (id = A) => layer(id).exposures.map((e) => e.length).join();
const order = () => layer(A).exposures.map((e) => e.drawing);
const scroll = document.querySelector<HTMLElement>('.flip-scroll')!;
const row = (id: string) => document.querySelector<HTMLElement>(`.flip-track[data-id="${id}"]`)!;
const cel = (id: string, i: number) => row(id).querySelector<HTMLElement>(`.flip-cel[data-i="${i}"]`)!;
const cellPx = () => cel(A, 0).getBoundingClientRect().width / layer(A).exposures[0]!.length + 3 / layer(A).exposures[0]!.length;
let pid = 20;
const pe = (target: EventTarget, type: string, x: number, y: number, o: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: pid, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pointerType: 'mouse', ...o }));
const reset = async () => { closeContextMenu(); app.history.clear(); app.pickLayer(A); app.setFrame(0); flip.zoomTo(44, 0); scroll.scrollLeft = 0; flip.update(); await wait(120); };

await check('Setup', () => { expect(lengths(A) === '2,2,2,2' && lengths(B) === '7,3' && layer(A).start === 0, `A ${lengths(A)} @${layer(A).start}, B ${lengths(B)}, ${app.project.comp.layers.map((l) => l.id + ':' + l.name).join(' ')}`); });

await check('Track headers are readable and at least 44 px tall; each track kind has its own colour', () => {
  const eye = row(A).querySelector<HTMLElement>('.flip-eye')!.getBoundingClientRect();
  expect(eye.width >= 90 && eye.height >= 44, `header ${eye.width}×${eye.height}`);
  expect(row(A).querySelector('.flip-name')?.textContent && row(A).querySelector('.flip-kind')?.textContent === 'Animation', 'name or kind missing');
  expect(row(BG).dataset.kind === 'still' && row(BG).querySelector('.flip-kind')?.textContent === 'Still', `background kind ${row(BG).dataset.kind}`);
  const kindA = getComputedStyle(row(A)).getPropertyValue('--kind').trim(), kindBG = getComputedStyle(row(BG)).getPropertyValue('--kind').trim();
  expect(kindA && kindBG && kindA !== kindBG, `colours ${kindA} / ${kindBG}`);
  // a pressed header is not painted with the accent like a pressed button
  expect(getComputedStyle(row(A).querySelector('.flip-eye')!).borderLeftColor !== getComputedStyle(row(A).querySelector('.flip-eye')!).backgroundColor, 'header bar and fill match');
  expect(cel(B, 0).classList.contains('roomy') && !cel(A, 0).classList.contains('roomy'), 'touch grips widen only on long drawings');
  expect(cel(A, 0).getBoundingClientRect().height >= 44, `cel ${cel(A, 0).getBoundingClientRect().height}px tall`);
});

await check('A colour tag replaces the kind colour on the track', async () => {
  app.editor.setLabel(B, 2);
  await wait();
  expect(getComputedStyle(row(B)).getPropertyValue('--kind').trim() === '#ffd24a', getComputedStyle(row(B)).getPropertyValue('--kind'));
  app.editor.setLabel(B, 0);
  await wait();
});

await check('The playhead carries the frame number on the ruler', async () => {
  app.setFrame(5);
  await wait();
  expect(document.querySelector<HTMLElement>('.flip-playhead')!.dataset.f === '6', `tab ${document.querySelector<HTMLElement>('.flip-playhead')!.dataset.f}`);
});

await check('The current drawing has a start grip (not the first drawing); it rolls the cut before it (one Undo step)', async () => {
  await reset();
  app.setFrame(0);
  await wait();
  expect(!cel(A, 0).querySelector('.flip-trim.start'), 'the first drawing has a start grip');
  app.setFrame(4);
  await wait();
  expect(!cel(A, 1).querySelector('.flip-trim.start'), 'a drawing away from the playhead has a start grip');
  const h = cel(A, 2).querySelector<HTMLElement>('.flip-trim.start')!;
  expect(h, 'no start grip on the current drawing');
  const b = h.getBoundingClientRect(), x = b.left + 3, y = b.top + 10, c = cellPx();
  pe(h, 'pointerdown', x, y); pe(h, 'pointermove', x - c * 1.1, y); pe(h, 'pointerup', x - c * 1.1, y);
  await wait(120);
  expect(lengths() === '2,1,3,2', `holds ${lengths()}`);
  app.undo(); await wait();
  expect(lengths() === '2,2,2,2', `undo ${lengths()}`);
});

await check('Arrow keys on the start grip move the start a frame at a time', async () => {
  await reset();
  app.setFrame(4); await wait();
  const h = cel(A, 2).querySelector<HTMLElement>('.flip-trim.start')!;
  h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait();
  expect(lengths() === '2,3,1,2', `holds ${lengths()}`);
  app.undo(); await wait();
});

await check('Zoomed out, a trimmed end snaps to another track’s cut; Shift skips the magnet', async () => {
  await reset();
  flip.zoomTo(6, 0); scroll.scrollLeft = 0; await wait(120);
  const drag = async (to: number, shift: boolean) => {
    const h = cel(A, 3).querySelector<HTMLElement>('.flip-trim:not(.start)')!;
    const b = h.getBoundingClientRect(), y = b.top + 10, x0 = b.right - 1;
    const grid = document.querySelector<HTMLElement>('.flip-grid')!.getBoundingClientRect();
    const label = row(A).querySelector<HTMLElement>('.flip-eye')!.getBoundingClientRect().width;
    // the end of drawing 4 (frame 8) dragged so the edge is at `to` frames
    const xTo = grid.left + label + to * 6 + (x0 - (grid.left + label + 8 * 6));
    pe(h, 'pointerdown', x0, y, { shiftKey: shift });
    await wait(40);
    pe(h, 'pointermove', xTo, y, { shiftKey: shift });
    const snapped = document.querySelector('.flip-snap.show') !== null;
    await wait(40);
    pe(h, 'pointerup', xTo, y, { shiftKey: shift });
    await wait(120);
    return snapped;
  };
  const shown = await drag(9.2, false);
  expect(lengths() === '2,2,2,4', `snapped holds ${lengths()}`);
  expect(shown, 'no snap line while snapping');
  expect(!document.querySelector('.flip-snap.show'), 'the snap line stayed after letting go');
  app.undo(); await wait();
  await drag(9.2, true);
  expect(lengths() === '2,2,2,3', `Shift holds ${lengths()}`);
  app.undo(); await wait();
});

await check('Touch and hold a drawing, then drag: it lifts and moves to another time on its track (one Undo step)', async () => {
  await reset();
  const before = order();
  const c = cel(A, 1), b = c.getBoundingClientRect(), x = b.left + 20, y = b.top + 20, px = cellPx();
  pe(c, 'pointerdown', x, y, { pointerType: 'touch' });
  await wait(560);
  expect(c.classList.contains('lifted'), 'the drawing did not lift');
  pe(c, 'pointermove', x + px * 2.5, y, { pointerType: 'touch' });
  pe(c, 'pointermove', x + px * 4.5, y, { pointerType: 'touch' });
  await wait(40);
  expect(cel(A, 2).style.getPropertyValue('--s') === '2' && cel(A, 3).style.getPropertyValue('--s') === '4', `the next drawings did not slide aside (${cel(A, 2).style.getPropertyValue('--s')}, ${cel(A, 3).style.getPropertyValue('--s')})`);
  pe(c, 'pointerup', x + px * 4.5, y, { pointerType: 'touch' });
  await wait(150);
  expect(order().join() === [before[0], before[2], before[3], before[1]].join(), `order ${order().map((d) => before.indexOf(d)).join()}`);
  expect(app.frame === 6, `playhead ${app.frame}`);
  app.undo(); await wait();
  expect(order().join() === before.join(), 'undo did not restore the order');
});

await check('Hold a drawing and let go without moving: its options open, nothing moves', async () => {
  await reset();
  const before = order().join();
  const c = cel(A, 2), b = c.getBoundingClientRect(), x = b.left + 20, y = b.top + 20;
  pe(c, 'pointerdown', x, y, { pointerType: 'touch' });
  await wait(560);
  pe(c, 'pointerup', x, y, { pointerType: 'touch' });
  await wait(80);
  expect(document.querySelector('.ctxmenu'), 'no menu');
  expect(order().join() === before && !app.history.canUndo, 'something changed');
  expect(app.frame >= 4 && app.frame < 6, `playhead ${app.frame}`);
  closeContextMenu();
});

await check('Two fingers pinch to zoom and drag to pan together: the frame between them stays under them', async () => {
  await reset();
  scroll.scrollLeft = 1200; flip.update(); await wait(80);
  const r = scroll.getBoundingClientRect(), y = r.top + 60;
  const grid = () => document.querySelector<HTMLElement>('.flip-grid')!.getBoundingClientRect();
  const label = row(A).querySelector<HTMLElement>('.flip-eye')!.getBoundingClientRect().width;
  const at = (x: number, cell: number) => (x - grid().left - label) / cell;
  const a0 = r.left + 300, b0 = r.left + 500, f0 = at((a0 + b0) / 2, 44);
  pe(scroll, 'pointerdown', a0, y, { pointerType: 'touch', pointerId: 31 });
  pe(scroll, 'pointerdown', b0, y, { pointerType: 'touch', pointerId: 32, isPrimary: false });
  // spread to twice the distance, and move both 80 px to the right
  pe(scroll, 'pointermove', a0 - 100 + 80, y, { pointerType: 'touch', pointerId: 31 });
  pe(scroll, 'pointermove', b0 + 100 + 80, y, { pointerType: 'touch', pointerId: 32, isPrimary: false });
  const cell = cel(A, 0).getBoundingClientRect().width / 2 + 1.5;
  const f1 = at((a0 + b0) / 2 + 80, 88);
  pe(scroll, 'pointerup', a0 - 20, y, { pointerType: 'touch', pointerId: 31 });
  pe(scroll, 'pointerup', b0 + 180, y, { pointerType: 'touch', pointerId: 32, isPrimary: false });
  await wait(80);
  expect(Math.abs(cell - 88) < 2, `zoom ${cell}`);
  expect(Math.abs(f1 - f0) < 0.1, `frame under the fingers ${f0.toFixed(2)} → ${f1.toFixed(2)}`);
});

await check('A flick of the strip keeps scrubbing, slowing down; a touch stops it', async () => {
  await reset();
  app.setFrame(100); flip.centre(); await wait(80);
  const c = scroll.getBoundingClientRect(), y = c.top + 60;
  let x = c.left + 700;
  pe(scroll, 'pointerdown', x, y, { pointerType: 'touch', pointerId: 41 });
  for (let k = 0; k < 4; k++) { x -= 40; pe(scroll, 'pointermove', x, y, { pointerType: 'touch', pointerId: 41 }); await wait(8); }
  pe(scroll, 'pointerup', x, y, { pointerType: 'touch', pointerId: 41 });
  const atUp = app.frame;
  expect(flip.gliding, 'no glide after a flick');
  await wait(250);
  expect(app.frame > atUp, `frame ${atUp} → ${app.frame}`);
  pe(scroll, 'pointerdown', x, y, { pointerType: 'touch', pointerId: 42 });
  pe(scroll, 'pointerup', x, y, { pointerType: 'touch', pointerId: 42 });
  expect(!flip.gliding, 'a touch did not stop the glide');
  closeContextMenu();
  // a slow drag that stops before letting go does not glide
  app.setFrame(100); flip.centre(); await wait(80);
  x = c.left + 700;
  pe(scroll, 'pointerdown', x, y, { pointerType: 'touch', pointerId: 43 });
  for (let k = 0; k < 4; k++) { x -= 12; pe(scroll, 'pointermove', x, y, { pointerType: 'touch', pointerId: 43 }); await wait(30); }
  await wait(120);
  pe(scroll, 'pointerup', x, y, { pointerType: 'touch', pointerId: 43 });
  expect(!flip.gliding, 'a drag that had stopped glided');
});

await check('Trimming near the strip’s right end scrolls it and keeps lengthening (one Undo step)', async () => {
  await reset();
  const h = cel(A, 0).querySelector<HTMLElement>('.flip-trim:not(.start)')!;
  const b = h.getBoundingClientRect(), y = b.top + 10, r = scroll.getBoundingClientRect();
  pe(h, 'pointerdown', b.left + 3, y);
  pe(h, 'pointermove', r.right - 6, y);
  await wait(400);
  const scrolled = scroll.scrollLeft;
  pe(h, 'pointerup', r.right - 6, y);
  await wait(120);
  const n = layer(A).exposures[0]!.length;
  const label = row(A).querySelector<HTMLElement>('.flip-eye')!.getBoundingClientRect().width;
  const withoutScroll = Math.round((r.right - 6 - r.left - label) / 44);
  expect(scrolled > 60, `scrolled ${scrolled}px`);
  expect(n > withoutScroll, `held ${n} frames (${withoutScroll} without scrolling)`);
  app.undo(); await wait();
  expect(lengths() === '2,2,2,2', `undo ${lengths()}`);
});

await check('Existing gestures still work: tap a frame of another track goes there; end grip keeps working', async () => {
  await reset();
  scroll.scrollTop = 0;
  await wait(700); // (the click after a drag is swallowed for a moment)
  const c = cel(B, 1), b = c.getBoundingClientRect();
  pe(c, 'pointerdown', b.left + 30, b.top + 20);
  pe(c, 'pointerup', b.left + 30, b.top + 20);
  c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + 30, clientY: b.top + 20 }));
  await wait();
  expect(app.project.activeLayer === B && app.frame === 7, `track ${app.project.activeLayer === B} frame ${app.frame}`);
});

await check('No page errors', () => { expect(!errors.length, errors.join(' | ')); });
// leave the flipbook showing for a look, but put the settings back
await reset();
app.setFrame(4);
localStorage.clear();
for (const [k, v] of Object.entries(savedSettings)) localStorage.setItem(k, v);
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
