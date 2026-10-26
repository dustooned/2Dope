/** Real App/Flipbook/source UI; in-memory project, no project library or autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { drawComp } from '../view/composite';
import { ArtworkAssetsUI } from './artworkassets';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { TracksSheet } from './sheet';
import { Strip } from './strip';
import { FlipMode } from './flipmode';
import { Bubbles } from './bubbles';
import { Sidebar } from './sidebar';

const keys = ['2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view', '2dope.sheet.draw', '2dope.sheet.animate', '2dope.m3.--track-h', '2dope.flip.mini', '2dope.ui.level', '2dope.m0.brush', '2dope.m0.color'];
const saved = keys.map(k => localStorage.getItem(k));
for (const k of keys) localStorage.removeItem(k);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stripRoot = document.querySelector<HTMLElement>('#strip')!;
const app = new App(canvas, stage); app.loadProject(new Project(128, 128)); app.project.comp.duration = 24; app.project.comp.fps = 24; app.setWorkspace('animate'); app.setFrame(7); app.quickShape = false;
const sidebar = new Sidebar(app, document.querySelector<HTMLElement>('#sidebar')!), flip = new FlipMode(app, stage), strip = new Strip(app, stripRoot);
const sheet = new TracksSheet(app, document.querySelector<HTMLElement>('.stage-col')!, stripRoot, () => app.refit());
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh());
const assets = new ArtworkAssetsUI(app, document.querySelector<HTMLElement>('.painting-header')!);
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, layerCards() {}, fit: () => app.refit(), editShape() {}, flip: { on: () => flip.on, set: on => flip.set(on) } }); bubbles.setLevel('simple', false);
function refresh() { painting.update(); sheet.update(); strip.update(); assets.update(); bubbles.update(); sidebar.update(); }
app.onFrameChange = () => { flip.update(); refresh(); }; app.onCompChange = refresh; app.onToolChange = refresh; app.onBrushChange = refresh; app.editor.onChange = refresh; app.history.onChange = refresh;
app.onWorkspaceChange = () => { sheet.restore(); flip.update(); refresh(); }; flip.onChange = refresh; app.onFlipKey = e => flip.onKey(e);
const settle = (ms = 140) => new Promise<void>(r => setTimeout(r, ms));
const button = (name: string) => { const scope = document.querySelector('dialog[open]') ?? document; const b = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.offsetParent && !b.disabled && [b.getAttribute('aria-label'), b.textContent?.trim()].includes(name)); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string) => button(name).click();
function key(target: HTMLElement, k: string, shift = false) { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, shiftKey: shift, bubbles: true, cancelable: true })); }
const hit = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); };
const trim = () => document.querySelector<HTMLElement>('.flip-cel.on .flip-trim')!;
function stroke(colour: string) {
  app.setColor(colour); app.brush.size = 16; app.brush.opacity = 1; app.fit();
  for (const [type, x] of [['pointerdown', 24], ['pointermove', 64], ['pointermove', 104], ['pointerup', 104]] as const) {
    const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, 64);
    canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 1, clientX: r.x + p.x, clientY: r.y + p.y }));
  }
}
function pixel(comp: typeof app.project.comp, frame: number) { const c = document.createElement('canvas'); c.width = c.height = 128; drawComp(c.getContext('2d')!, app.project, comp, frame, { export: true }); return [...c.getContext('2d')!.getImageData(64, 64, 1, 1).data]; }
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; if (!ok) li.textContent += JSON.stringify({ ex: app.project.exposures.map(e => e.length), frame: app.frame, focus: document.activeElement?.outerHTML.slice(0, 160), playing: app.playing, workspace: app.workspace, comp: app.project.comp.name, stroke: app.strokeActive, classes: document.body.className, flip: flip.row.offsetHeight, stage: stage.offsetHeight, reserve: stage.style.getPropertyValue('--flip-h') }); document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
try {
  flip.set(false); await settle(); const shot = app.project.activeComp, shotLayer = app.project.activeLayer;
  click('Assets (0)'); click('New asset'); const input = document.querySelector<HTMLInputElement>('input[aria-label="New asset name"]')!; input.value = 'Animated source'; key(input, 'Enter'); await settle();
  const source = app.project.comp, sourceLayer = app.project.activeLayer; app.setFps(6); click('Flipbook'); await settle();
  check('New source enters Draw Flipbook without moving the shot origin', assets.assets.editing && app.workspace === 'draw' && flip.on && app.frame === 0);
  stroke('#ff0000'); click('Frame'); stroke('#00ff00'); click('Frame'); stroke('#0000ff'); await settle();
  check('Frame creates separate editable drawings on one source track', app.project.exposures.length === 3 && new Set(app.project.exposures.map(e => e.drawing)).size === 3 && app.frame === 2);
  check('Each source frame renders its own painted pixels', pixel(source, 0)[0]! > 240 && pixel(source, 1)[1]! > 240 && pixel(source, 2)[2]! > 240);
  check('Duration exposes its actual value and keyboard ownership', trim().tabIndex === 0 && trim().getAttribute('aria-valuenow') === '1' && trim().getAttribute('aria-valuetext') === '1 frame');
  app.history.clear(); trim().focus(); key(trim(), 'ArrowRight');
  check('Duration arrow changes the hold without moving the playhead and retains focus', app.project.exposures[2]!.length === 2 && app.frame === 2 && document.activeElement === trim() && trim().getAttribute('aria-valuenow') === '2');
  key(trim(), 'ArrowUp', true); check('Shift duration arrow changes ten frames', app.project.exposures[2]!.length === 12 && app.frame === 2);
  app.undo(); await settle(); check('Undo restores the previous duration', app.project.exposures[2]!.length === 2); app.redo(); await settle(); check('Redo restores the longer duration', app.project.exposures[2]!.length === 12);
  key(trim(), 'Home'); key(trim(), 'ArrowLeft'); check('Home and decrement respect one-frame minimum', app.project.exposures[2]!.length === 1);
  key(trim(), 'ArrowRight'); key(trim(), 'ArrowRight'); key(trim(), 'ArrowRight'); key(trim(), 'Escape');
  check('Escape returns duration focus to canvas without starting playback', document.activeElement === canvas && !app.playing && app.project.exposures[2]!.length === 4 && app.compEnd === 6);
  click('Previous drawing'); check('Previous drawing selects the preceding source drawing', app.frame === 1); click('Next drawing'); check('Next drawing selects the next source drawing', app.frame === 2);
  const actions = document.querySelector<HTMLElement>('.flip-actions')!, play = button('Play your drawings (loops)'); actions.scrollLeft = actions.scrollWidth; await settle();
  check('Play remains reachable when other controls scroll to the far end', hit(play) && play.getBoundingClientRect().width >= 43.9 && play.getBoundingClientRect().height >= 43.9);
  check('Every visible Flipbook button has a 44px target', [...document.querySelectorAll<HTMLElement>('.flip-head button')].filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9; }));
  // Seven fps avoids an exact six-frame alias when a background tab throttles RAF to 1Hz.
  app.setFps(7); const frames = new Set<number>(); let wrapped = false, previous = app.frame;
  const onFrame = app.onFrameChange;
  app.onFrameChange = () => { if (app.playing) { frames.add(app.frame); if (app.frame < previous) wrapped = true; previous = app.frame; } onFrame(); };
  click('Play your drawings (loops)'); const deadline = performance.now() + 8000;
  while ((!wrapped || frames.size < 2) && performance.now() < deadline) await settle(100);
  check('Source playback advances and loops only through its six frames', app.playing && wrapped && frames.size >= 2 && [...frames].every(f => f >= 0 && f < 6) && hit(button('Pause')));
  app.onFrameChange = onFrame; app.setFps(6);
  const sourcePosition = app.frame, history = app.history.peekUndo(); click('Done editing asset'); await settle();
  check('Done while playing stops playback and restores Animate shot/layer/frame', !app.playing && app.project.activeComp === shot && app.project.activeLayer === shotLayer && app.frame === 7 && app.workspace === 'animate' && !flip.on && document.activeElement === canvas);
  click('Assets (1)'); click('Place Animated source'); await settle(); click('Edit source'); await settle();
  check('Edit source resumes the animated track and stopped source frame', app.project.activeComp === source.id && app.project.activeLayer === sourceLayer && app.frame === sourcePosition && flip.on && !app.playing && document.activeElement === canvas);
  check('Source/shot navigation adds no document history beyond Place', app.history.peekUndo()?.label === 'Place artwork asset' && app.history.peekUndo() !== history);
  app.setFrame(2); click('Track'); click('Track'); click('Track'); click('Track'); await settle();
  app.pickLayer(sourceLayer); flip.update(); await settle();
  await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  const scroll = document.querySelector<HTMLElement>('.flip-scroll')!, row = document.querySelector<HTMLElement>('.flip-track.active')!, sr = scroll.getBoundingClientRect(), rr = row.getBoundingClientRect();
  check('Selecting a lower track scrolls it into the available strip', rr.top >= sr.top - 1 && rr.bottom <= sr.bottom + 1);
  scroll.style.maxHeight = '74px'; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  const resized = scroll.getBoundingClientRect(), selected = row.getBoundingClientRect();
  check('Resizing the track list keeps the active lower track visible', selected.top >= resized.top - 1 && selected.bottom <= resized.bottom + 1);
  scroll.style.maxHeight = ''; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  check('Short screens limit the track list to one row while taller screens show up to three', innerHeight > 500 || scroll.clientHeight <= 75);
  const stageH = stage.getBoundingClientRect().height, measured = parseFloat(stage.style.getPropertyValue('--flip-h'));
  check('Canvas fitting tracks the measured Flipbook height', Math.abs(measured - (flip.row.offsetHeight + 16)) < 1 && measured < stageH);
  check('Tools, Options and Brush recovery buttons remain directly reachable together', ['Toggle tools', 'Toggle options', 'Toggle brush controls'].every(name => hit(button(name))));
  click('Toggle tools'); click('Toggle options'); click('Toggle brush controls'); click('Fit canvas'); await settle();
  const page = app.view.docToScreen(64, 64), cr = canvas.getBoundingClientRect();
  check('Folding controls leaves a reachable drawing canvas above the short-screen Flipbook', document.elementFromPoint(cr.x + page.x, cr.y + page.y) === canvas && page.y < flip.row.getBoundingClientRect().top - cr.top);
  click('Done editing asset'); await settle();
  check('Multi-track source Done still returns to the shot frame', app.project.activeComp === shot && app.frame === 7 && app.workspace === 'animate');
  // At shot fps 24, source fps 6: one green frame lasts four shot frames, then blue.
  check('The placed animation follows source timing on the shared shot clock', pixel(app.project.comp, 0)[0]! > 240 && pixel(app.project.comp, 4)[1]! > 240 && pixel(app.project.comp, 8)[2]! > 240);
} catch (e) { check(String(e), false); }
finally { if (app.playing) app.togglePlay(); keys.forEach((k, i) => { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); }); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
