/**
 * Editing bars like the Dock (tool bar and an options row), the animation actions on Animate's bar,
 * and touch and hold on the canvas (one finger: eyedropper; two fingers: the menu). Real App and
 * Bubbles, an in-memory project; this device's 2dope.* settings are put back at the end.
 */
import { App } from '../app';
import { Project } from '../core/project';
import { WORKSPACE_LAYOUT_KEY } from '../core/workspacelayout';
import { COMMANDS_HIDDEN_KEY } from '../core/commandprefs';
import { Bubbles } from './bubbles';
import { closeContextMenu } from './contextmenu';
import { HOLD_MS } from './contextmenu';

const saved = Object.keys(localStorage).filter((k) => k.startsWith('2dope.')).map((k) => [k, localStorage.getItem(k)!] as const);
for (const k of [WORKSPACE_LAYOUT_KEY, COMMANDS_HIDDEN_KEY, '2dope.ui.level']) localStorage.removeItem(k);

const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage);
app.loadProject(new Project(160, 120));
app.setWorkspace('draw');
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, layerCards() {}, fit: () => app.refit(), editShape() {} });
bubbles.setLevel('simple', false);
const refresh = () => bubbles.update();
app.onFrameChange = refresh; app.onToolChange = refresh; app.history.onChange = refresh;
const settle = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name: string, ok: boolean, info?: unknown) {
  const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}${ok || info === undefined ? '' : ' ' + JSON.stringify(info)}`;
  document.querySelector('#results')!.append(li); if (ok) passed++; else failed++;
}
const tools = () => [...document.querySelectorAll<HTMLElement>('.bub-tools > [data-tool-key]')].map((b) => b.dataset.toolKey!).filter((k) => k !== 'more');
const tool = (k: string) => document.querySelector<HTMLElement>(`.bub-tools > [data-tool-key="${k}"]`)!;
const tray = (id: string) => document.querySelector<HTMLElement>(`.bar-tray [data-add="${id}"]`);
const mid = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] as const; };
function ev(type: string, target: EventTarget, x: number, y: number, pointerType: string, pointerId = 21) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, pointerId, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5 }));
}
async function drag(from: Element, to: readonly [number, number], pointerType: string) {
  const [x, y] = mid(from);
  ev('pointerdown', from, x, y, pointerType);
  for (let i = 1; i <= 8; i++) { ev('pointermove', document, x + ((to[0] - x) * i) / 8, y + ((to[1] - y) * i) / 8, pointerType); await settle(10); }
  ev('pointerup', document, to[0], to[1], pointerType);
  await settle();
}

try {
  await settle(200);
  // ---- the tool bar
  const start = tools();
  bubbles.editTools(); await settle();
  check('Edit tool bar: the bar wiggles and a tray opens', document.querySelector('.bub-tools')!.classList.contains('bar-editing') && !!document.querySelector('.bar-tray:not([hidden])'));
  check('The tray offers the animation actions', ['play', 'onion', 'prevdraw', 'nextdraw', 'insert', 'dup', 'del', 'fx'].every((k) => !!tray(k)), [...document.querySelectorAll<HTMLElement>('.bar-tray [data-add]')].map((b) => b.dataset.add));
  const brushAt = mid(tool('brush'));
  await drag(tool('transform'), [brushAt[0] - 14, brushAt[1]], 'mouse');
  check('Mouse: drag Transform in front of Brush', tools()[0] === 'transform' && tools()[1] === 'brush', tools());
  await drag(tool('layers'), [innerWidth / 2, innerHeight - 40], 'touch');
  check('Finger: drag Layers off the bar removes it', !tools().includes('layers') && !!tray('layers'), tools());
  await drag(tray('onion')!, mid(tool('select')), 'pen');
  const t = tools();
  check('Pen: drag Onion skin from the tray onto the bar, where it was dropped', t.includes('onion') && Math.abs(t.indexOf('onion') - t.indexOf('select')) === 1, t);
  const stored = JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_KEY) ?? '{}').draw?.tools;
  check('The bar is saved on this device', JSON.stringify(stored) === JSON.stringify(tools()), stored);
  // a tap picks, it does not use the tool
  const toolBefore = app.tool;
  const [ex, ey] = mid(tool('eraser'));
  ev('pointerdown', tool('eraser'), ex, ey, 'touch'); ev('pointerup', document, ex, ey, 'touch'); tool('eraser').click(); await settle();
  check('A tap picks a bar item without switching tools', app.tool === toolBefore && tool('eraser').classList.contains('bar-picked'));
  [...document.querySelectorAll<HTMLButtonElement>('.bar-tray-pick button')].find((b) => b.textContent === 'Remove')!.click(); await settle();
  check('Remove in the tray takes the picked item off', !tools().includes('eraser'), tools());
  tool('brush').focus(); tool('brush').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await settle();
  check('Brush cannot leave the bar', tools().includes('brush'));
  tool('smudge').focus(); tool('smudge').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await settle();
  check('Arrow keys move the focused item', tools().indexOf('smudge') < tools().indexOf('brush') || tools()[0] === 'smudge', tools());
  document.querySelector<HTMLButtonElement>('.bar-tray-reset')!.click(); await settle();
  check('Reset puts the built-in bar back', tools().join() === start.join(), tools());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  check('Escape ends editing', !document.querySelector('.bar-editing') && !!document.querySelector('.bar-tray[hidden]'));

  // ---- Animate: an animation action pinned to the bar works
  app.setWorkspace('animate'); await settle();
  const ws = app.workspaceLayouts.animate;
  app.setWorkspaceLayouts({ ...app.workspaceLayouts, animate: { ...ws, tools: [...ws.tools, 'onion', 'insert'] } }); await settle();
  const onion = app.onion.enabled, drawings = app.project.drawings.size;
  tool('onion').click(); tool('insert').click(); await settle();
  check('Animate: Onion skin and New drawing work from the bar', app.onion.enabled !== onion && app.project.drawings.size === drawings + 1);
  app.undo(); if (app.onion.enabled !== onion) app.toggleOnion();
  app.setWorkspace('draw'); await settle();

  // ---- an options row: Select
  app.setTool('fill'); app.setFillMode('lasso'); await settle();
  const cmds = () => [...document.querySelectorAll<HTMLElement>('.bub-ctx > [data-command]')].map((b) => b.dataset.command!);
  const before = cmds();
  bubbles.editRow('select'); await settle();
  const first = document.querySelector('.bub-ctx > [data-command]')!, last = [...document.querySelectorAll('.bub-ctx > [data-command]')].at(-1)!;
  const f = mid(first);
  await drag(last, [f[0] - 10, f[1]], 'touch');
  const after = cmds();
  check('A row: drag its last action to the front', after[0] === before.at(-1) && after.length === before.length, after);
  check('The row order is saved', JSON.parse(localStorage.getItem(COMMANDS_HIDDEN_KEY) ?? '{}').order?.select?.[0] === before.at(-1));
  document.querySelector<HTMLButtonElement>('.bar-tray-reset')!.click(); await settle();
  check('Reset puts the row back', cmds().join() === before.join(), cmds());
  document.querySelector<HTMLButtonElement>('.bar-tray-done')!.click(); await settle();
  app.setTool('brush'); await settle();

  // ---- touch and hold on the canvas
  const g = app.drawing.line.getContext('2d')!;
  g.fillStyle = '#d02030'; g.fillRect(20, 20, 60, 60); app.requestRender(); await settle(100);
  const r = canvas.getBoundingClientRect(), at = (x: number, y: number) => { const p = app.view.docToScreen(x, y); return [r.left + p.x, r.top + p.y] as const; };
  app.setColor('#000000');
  const [rx, ry] = at(50, 50);
  ev('pointerdown', canvas, rx, ry, 'touch', 31); await settle(HOLD_MS + 150);
  check('One finger held on red picks red', app.color.toLowerCase() === '#d02030', app.color);
  check('The loupe shows while the finger is down', !!document.querySelector('.hold-loupe'));
  const [wx, wy] = at(130, 100);
  ev('pointermove', canvas, wx, wy, 'touch', 31); await settle(60);
  check('Sliding the finger picks what is under it now', app.color.toLowerCase() !== '#d02030', app.color);
  ev('pointerup', canvas, wx, wy, 'touch', 31); await settle();
  check('Lifting keeps the colour and hides the loupe', !document.querySelector('.hold-loupe') && app.color.toLowerCase() !== '#000000');
  check('The eyedropper drew nothing', app.history.peekUndo()?.label !== 'Brush stroke');

  const undoBefore = app.history.peekUndo();
  const [ax, ay] = at(40, 40), [bx, by] = at(90, 70);
  ev('pointerdown', canvas, ax, ay, 'touch', 41); ev('pointerdown', canvas, bx, by, 'touch', 42); await settle(HOLD_MS + 150);
  check('Two fingers held still open the canvas menu', !!document.querySelector('.ctxmenu'));
  ev('pointerup', canvas, ax, ay, 'touch', 41); ev('pointerup', canvas, bx, by, 'touch', 42); await settle();
  check('…and it is not a two-finger undo', app.history.peekUndo() === undoBefore);
  closeContextMenu(); await settle();

  app.setPenPrefs({ ...app.penPrefs, touchHold: 'menu' });
  const [cx, cy] = at(100, 30);
  ev('pointerdown', canvas, cx, cy, 'touch', 51); await settle(HOLD_MS + 150);
  check('Set to menu: one finger held opens the menu again', !!document.querySelector('.ctxmenu') && !document.querySelector('.hold-loupe'));
  ev('pointerup', canvas, cx, cy, 'touch', 51); await settle();
  closeContextMenu();
  app.setPenPrefs({ ...app.penPrefs, touchHold: 'eyedropper' });
} catch (e) { check(String(e), false); }
for (const k of Object.keys(localStorage)) if (k.startsWith('2dope.')) localStorage.removeItem(k);
for (const [k, v] of saved) localStorage.setItem(k, v);
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
