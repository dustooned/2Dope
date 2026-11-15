/**
 * Story's panel beside the canvas (default) or under it: the toggle, the device preference (no undo
 * step, no project change), and a clean layout in both (canvas fits, nothing overlaps, 44 px
 * targets). Runs at the window's own size; storydock-responsive runs it at phone and iPad sizes.
 */
import { App } from '../app';
import { Project } from '../core/project';
import { BoardPanel } from './board';
import { Bubbles } from './bubbles';

const KEYS = ['2dope.story.dock', '2dope.board.view'];
const saved = KEYS.map((k) => { try { return localStorage.getItem(k); } catch { return null; } });
for (const k of KEYS) try { localStorage.removeItem(k); } catch { /* private window */ }

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage); app.loadProject(new Project(320, 180)); app.project.layer.exposures[0]!.length = 24; app.setWorkspace('board');
const errors: string[] = []; addEventListener('error', (e) => errors.push(e.message));
const root = document.querySelector<HTMLElement>('#board')!;
let board = new BoardPanel(app, root);
const bubbles = new Bubbles(app, stage, { fit: () => app.refit(), brushLibrary: () => {}, colorPanel: () => {}, layers: () => {}, share: { open: () => false, show: () => {} }, story: { view: () => board.currentView, setView: (v) => board.setView(v), images: () => board.pickImages(), exportBoard: () => {}, controlsInPanel: true } });
bubbles.setLevel('simple', false);
const refresh = () => { document.body.classList.remove('ws-board', 'ws-draw', 'ws-animate', 'ws-time', 'ws-motion'); document.body.classList.add(`ws-${app.workspace}`); board.update(); bubbles.update(); };
const wire = () => { board.onView = () => bubbles.update(); board.onDock = () => { bubbles.update(); app.fit(); }; };
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.onThumbs = refresh; app.history.onChange = refresh; wire(); refresh();
const wait = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));
const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const expect = (ok: unknown, why: string) => { if (!ok) throw new Error(why); };
let passed = 0, failed = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; } document.querySelector('#results')!.append(li); }

const wide = matchMedia('(min-width: 1100px) and (min-height: 650px)').matches;
const box = (e: Element) => e.getBoundingClientRect();
const toggle = () => document.querySelector<HTMLButtonElement>('.story-dock-toggle')!;
const shown = (e: HTMLElement) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
const overlap = (a: DOMRect, b: DOMRect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const snapshot = () => JSON.stringify(app.project.comp.layers) + JSON.stringify(app.board?.exposures ?? null);

/** The stage and the board share the screen without overlapping; the page fits inside the stage. */
async function layoutOk(where: string) {
  await frames(); app.fit(); await frames();
  const s = box(stage), b = box(root), vw = innerWidth;
  expect(s.width > 100 && s.height > 80, `${where}: canvas squeezed to ${Math.round(s.width)}×${Math.round(s.height)}`);
  expect(overlap(s, b) < 2, `${where}: canvas and Story overlap (${JSON.stringify([s, b].map((r) => [r.x, r.y, r.width, r.height].map(Math.round)))})`);
  expect(document.documentElement.scrollWidth <= vw + 1, `${where}: page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
  expect(b.right <= vw + 1 && b.bottom <= innerHeight + 1, `${where}: Story runs off screen`);
  const a = app.view.docToScreen(0, 0), z = app.view.docToScreen(app.docW, app.docH), c = box(canvas);
  expect(a.x >= -1 && a.y >= -1 && z.x <= c.width + 1 && z.y <= c.height + 1, `${where}: page does not fit the canvas (${[a.x, a.y, z.x, z.y].map(Math.round)} in ${Math.round(c.width)}×${Math.round(c.height)})`);
  const small = [...root.querySelectorAll<HTMLElement>('.board-bar button, .board-bar select')].filter((x) => shown(x) && (x.offsetWidth < 44 || x.offsetHeight < 44)).map((x) => `${x.getAttribute('aria-label') ?? x.textContent?.trim()} ${x.offsetWidth}×${x.offsetHeight}`);
  expect(!small.length, `${where}: small targets ${small.join(', ')}`);
}

app.createBoard(); app.addPanel(); app.addPanel(); await wait(200);
const before = snapshot(), undo = app.history.peekUndo();

await check(`Story opens on the right by default${wide ? '' : ' (under the canvas: no room beside it at this size)'}`, async () => {
  expect(board.currentDock === 'right' && !document.body.classList.contains('story-dock-bottom'), 'default is not right');
  await frames();
  if (wide) {
    expect(shown(toggle()) && toggle().getAttribute('aria-pressed') === 'false', 'toggle hidden or pressed on a wide screen');
    expect(box(root).left >= box(stage).right - 1, 'Story is not beside the canvas');
  } else {
    expect(!shown(toggle()), 'toggle shows where it would do nothing');
    expect(box(root).top >= box(stage).bottom - 1, 'Story is not under the canvas');
  }
  await layoutOk('right');
});

await check('Timeline view on the right: panels and their sound lane fit', async () => {
  board.setView('timeline'); await wait();
  const t = root.querySelector<HTMLElement>('.btl')!, p = root.querySelector<HTMLElement>('.btl-panel')!, lane = root.querySelector<HTMLElement>('.btl-audio')!;
  expect(shown(t) && box(t).height >= 140, `timeline ${Math.round(box(t).height)} px tall`);
  expect(p.offsetHeight <= 112 && box(lane).top >= box(p).bottom && box(lane).top - box(p).bottom < 40, 'sound lane is not right under the panels');
  await layoutOk('right, timeline');
});

await check('The toggle docks Story at the bottom: no undo step, no project change, remembered on this device', async () => {
  if (wide) toggle().click(); else board.setDock('bottom');
  await wait();
  expect(board.currentDock === 'bottom' && document.body.classList.contains('story-dock-bottom'), 'not docked at the bottom');
  expect(localStorage.getItem('2dope.story.dock') === 'bottom', 'choice not stored');
  expect(snapshot() === before && app.history.peekUndo() === undo, 'docking changed the project or history');
  expect(box(root).top >= box(stage).bottom - 1, 'Story is not under the canvas');
  if (wide) expect(toggle().getAttribute('aria-pressed') === 'true' && toggle().getAttribute('aria-label') === 'Story timeline at the bottom', 'toggle state not announced');
  await layoutOk('bottom, timeline');
});

await check('At the bottom on a wide screen the Story header is one row and the canvas keeps its room', async () => {
  const bar = root.querySelector<HTMLElement>('.board-bar')!;
  if (innerWidth >= 960 && innerHeight >= 501) expect(bar.offsetHeight <= 90, `header ${bar.offsetHeight} px tall`);
  expect(box(stage).height >= Math.min(300, innerHeight * 0.4), `canvas only ${Math.round(box(stage).height)} px tall`);
});

await check('Every Story view lays out cleanly at the bottom', async () => {
  for (const v of ['grid', 'panels', 'split', 'timeline'] as const) { board.setView(v); await wait(80); await layoutOk(`bottom, ${v}`); }
});

await check('A new session (a reload) opens Story where it was left', async () => {
  root.replaceChildren(); board = new BoardPanel(app, root); wire(); refresh(); await wait();
  expect(board.currentDock === 'bottom' && document.body.classList.contains('story-dock-bottom'), 'dock not restored');
  await layoutOk('bottom after reload');
});

await check('The toggle brings Story back to the right; every view lays out cleanly there', async () => {
  if (wide) toggle().click(); else board.setDock('right');
  await wait();
  expect(board.currentDock === 'right' && !document.body.classList.contains('story-dock-bottom') && localStorage.getItem('2dope.story.dock') === 'right', 'not back on the right');
  for (const v of ['grid', 'panels', 'split', 'timeline'] as const) { board.setView(v); await wait(80); await layoutOk(`right, ${v}`); }
  expect(snapshot() === before && app.history.peekUndo() === undo, 'the project or history changed');
});

await check('Story tools → Burn in timecode adds a timecode layer on top (one Undo) and keeps drawing on the board', async () => {
  const tools = [...root.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.getAttribute('aria-label') === 'Story tools' || b.textContent?.trim() === 'Story tools')!;
  tools.click(); await wait(60);
  const item = [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button')].find((b) => b.textContent?.trim() === 'Burn in timecode');
  expect(item && !item.disabled, 'no Burn in timecode'); item!.click(); await wait();
  const top = app.project.comp.layers[0]!;
  expect(top.effects?.[0]?.type === 'timecode' && app.history.peekUndo()?.label === 'Add timecode layer', 'no timecode layer on top');
  expect(app.project.activeLayer === app.board!.id, 'Story stopped drawing on its board');
  tools.click(); await wait(60);
  const again = [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button')].find((b) => b.textContent?.trim() === 'Burn in timecode');
  expect(again?.disabled, 'a second burn-in is offered'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.ctxmenu')?.remove();
  app.undo(); await wait(); expect(!app.project.comp.layers.some((l) => l.effects?.some((e) => e.type === 'timecode')), 'Undo left it');
});

await check('No page errors', () => expect(!errors.length, errors.join(' | ')));
KEYS.forEach((k, i) => { try { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); } catch { /* private window */ } });
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
