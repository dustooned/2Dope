/**
 * The Select row from the command registry: the same chips as before, hide and recover them, and
 * the hidden set survives a page reload. Real App, Bubbles and App settings; an in-memory project.
 * Runs in two passes: the second, after a reload, checks what the first one hid.
 */
import { App } from '../app';
import { Project } from '../core/project';
import { defaultQuickMenu } from '../core/quickmenu';
import { COMMANDS_HIDDEN_KEY } from '../core/commandprefs';
import { STUDENT_PROFILES_KEY } from '../core/studentprefs';
import { Bubbles } from './bubbles';
import { AppSettingsUI } from './settings';

const PASS_KEY = 'commandrow.pass';
const second = sessionStorage.getItem(PASS_KEY) === '2';
// device preferences this page changes, put back exactly as they were at the end (saved once, before the first pass)
if (!second) sessionStorage.setItem('commandrow.saved', JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('2dope.')).map((k) => [k, localStorage.getItem(k)])));
if (!second) for (const k of ['2dope.symmetry', '2dope.guide', '2dope.inkpaint', '2dope.fill.mode', '2dope.select.shape', '2dope.ui.level', COMMANDS_HIDDEN_KEY]) localStorage.removeItem(k);

const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage);
app.loadProject(new Project(128, 128));
app.setWorkspace('draw');
app.setFrame(0);
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, layerCards() {}, fit: () => app.refit(), editShape() {} });
bubbles.setLevel('simple', false);
const refresh = () => bubbles.update();
app.onFrameChange = refresh; app.onCompChange = refresh; app.onToolChange = refresh; app.history.onChange = refresh;
const settle = (ms = 140) => new Promise<void>((r) => setTimeout(r, ms));
const row = () => [...document.querySelectorAll<HTMLButtonElement>('.bub-ctx button')].filter((b) => b.getAttribute('aria-label'));
const labels = () => row().map((b) => b.getAttribute('aria-label')!);
const chip = (name: string) => row().find((b) => b.getAttribute('aria-label') === name) ?? null;
const tools = () => [...document.querySelectorAll<HTMLButtonElement>('.bub-tools button')].map((b) => b.getAttribute('aria-label')).join();
const menuItem = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button')].find((b) => (b.firstChild?.textContent ?? '').trim() === text) ?? null;
function pointer(type: string, x: number, y: number) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 1, clientX: r.left + p.x, clientY: r.top + p.y }));
}
async function selectRect() {
  app.setTool('fill'); app.setFillMode('lasso'); app.setSelectShape('rect'); app.setSelectOp('new');
  pointer('pointerdown', 20, 20); pointer('pointermove', 100, 100); pointer('pointerup', 100, 100);
  await settle();
}
const results: [string, boolean][] = JSON.parse(sessionStorage.getItem('commandrow.results') ?? '[]');
function check(name: string, ok: boolean, info?: unknown) { results.push([`${name}${ok || info === undefined ? '' : ' ' + JSON.stringify(info)}`, ok]); }
function report() {
  for (const [name, ok] of results) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); }
  const passed = results.filter(([, ok]) => ok).length;
  document.querySelector('#summary')!.textContent = `${passed} passed, ${results.length - passed} failed · ${innerWidth}×${innerHeight}`;
}
function restore() {
  const saved: [string, string][] = JSON.parse(sessionStorage.getItem('commandrow.saved') ?? '[]');
  for (const k of Object.keys(localStorage)) if (k.startsWith('2dope.')) localStorage.removeItem(k);
  for (const [k, v] of saved) localStorage.setItem(k, v);
  for (const k of [PASS_KEY, 'commandrow.saved', 'commandrow.results']) sessionStorage.removeItem(k);
}

const SHAPES = ['Freehand', 'Rectangle', 'Ellipse', 'Automatic', 'Colour', 'New', 'Add', 'Subtract'];
const WITH_SELECTION = ['Transform', 'Fill', 'Copy', 'Cut', 'Duplicate', 'Copy to layer', 'Cut to layer', 'Delete', 'Invert', 'Deselect'];
const TRANSFORM = ['Apply', 'Cancel', 'Freeform', '−', '+', '⟲45', '⟳45', 'Flip ↔', 'Flip ↕', 'Fit', 'Reset', 'Customize'];
const hint = (text: string) => [...document.querySelectorAll('.bub-ctx .bub-hint')].some((s) => s.textContent === text);

/** Slice 2: the other rows come from the registry with the same chips, in the same order. */
async function otherRows() {
  // Transform: Freeform still flips its state and title; a hidden step leaves the rest in place
  chip('Transform')!.click(); await settle();
  const ff = chip('Freeform')!;
  ff.click(); await settle();
  check('Transform: Freeform still toggles (pressed, title)', app.transformFreeform && chip('Freeform')!.getAttribute('aria-pressed') === 'true' && chip('Freeform')!.title.startsWith('Freeform'));
  chip('Freeform')!.click(); await settle();
  const scale = app.transformParams!.scale;
  chip('+')!.click(); await settle();
  check('Transform: + still makes it bigger', app.transformParams!.scale > scale);
  chip('−')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })); await settle();
  const hideSmaller = menuItem('Hide “Smaller” from this row');
  check('A symbol chip is named in words in its hide menu', !!hideSmaller);
  hideSmaller?.click(); await settle();
  check('Hiding Smaller leaves the rest of the Transform row', labels().join() === TRANSFORM.filter((n) => n !== '−').join(), labels());
  chip('Customize')!.click(); await settle();
  check('Transform Customize lists its 11 commands by name', document.querySelectorAll('.ctxmenu button[role="menuitem"]').length === 11 && !!menuItem('Smaller'));
  menuItem('Smaller')?.click(); await settle();
  check('Customize brings Smaller back', labels().join() === TRANSFORM.join(), labels());
  app.cancelTransform(); await settle();

  // Fill: the style chips stay; Swap with a gradient; Fill selection with a selection
  app.setTool('fill'); app.setFillMode('tap'); app.setFillStyle('solid'); await settle();
  check('Fill row: tap modes, styles, Fill selection, Customize', labels().join() === 'Tap / drag,Leftovers,Solid,Linear,Radial,Fill selection,Customize', labels());
  app.setFillStyle('linear'); await settle();
  check('Fill row: Swap appears with a gradient', labels().includes('Swap') && labels().indexOf('Swap') < labels().indexOf('Fill selection'), labels());
  app.setFillStyle('solid'); await settle();

  // Smudge: Softer and Stronger around the strength readout
  app.setTool('brush'); app.setSmudging(true); await settle();
  check('Smudge row: Line, Fill, Softer, Stronger, Customize', labels().join() === 'Line,Fill,Softer,Stronger,Customize', labels());
  const s0 = app.smudgeStrength;
  chip('Softer')!.click(); await settle();
  check('Smudge: Softer lowers the strength and the readout follows', app.smudgeStrength < s0 && hint(`Strength ${Math.round(app.smudgeStrength * 100)}%`));
  chip('Stronger')!.click(); await settle();
  app.setSmudging(false); await settle();

  // Brush and Vector: Customize ends the row; Edit points with a vector line
  check('Brush row ends with Customize', labels().at(-1) === 'Customize' && labels().includes('Brushes'), labels());
  app.setTool('pen'); await settle();
  check('Vector row without a line: no Edit points', !chip('Edit points'), labels());
  pointer('pointerdown', 30, 60); for (let x = 32; x <= 100; x += 4) pointer('pointermove', x, 60 + (x % 8)); pointer('pointerup', 100, 60);
  await settle(300);
  check('Vector row with a line: Edit points before Customize', labels().slice(-2).join() === 'Edit points,Customize', labels());

  // Points: the registry chips around the width meter
  chip('Edit points')!.click(); await settle();
  const pts = labels();
  check('Points row: same chips in the same order, then Customize', pts.join() === 'Curved point,All straight,Point settings,Width: whole line,Thinner,Thicker,Done,Customize', pts);
  chip('Width: whole line')!.click(); await settle();
  check('Points: width scope still steps and shows it', !!chip('Width: this point') && chip('Width: this point')!.getAttribute('aria-pressed') === 'true', labels());
  chip('Width: this point')!.click(); await settle(); chip('Width: sections')!.click(); await settle();
  chip('Done')!.click(); await settle();
  check('Points: Done still leaves point editing', !app.pointEditing);

  // Timing: holds, steps and roles
  app.setWorkspace('time'); await settle();
  check('Timing row: holds, steps, roles, Customize', labels().join() === '1,2,3,4,−,+,Key,Breakdown,In-between,Customize', labels());
  chip('2')!.click(); await settle();
  check('Timing: 2 still sets the hold and lights', app.currentHold === 2 && chip('2')!.getAttribute('aria-pressed') === 'true');
  chip('1')!.click(); await settle();
  app.setWorkspace('draw'); await settle();
}

try {
  app.fit();
  await settle();
  if (!second) {
    // the row as the build before the registry drew it, plus Customize
    app.setTool('fill'); app.setFillMode('lasso'); await settle();
    check('With nothing selected: shapes, operations, Move all, Select all, then Customize', labels().join() === [...SHAPES, 'Move all', 'Select all', 'Customize'].join(), labels());
    await selectRect();
    check('With a selection: the same action chips in the same order, then Customize', labels().join() === [...SHAPES, ...WITH_SELECTION, 'Customize'].join(), labels());
    check('Action chips keep their icons, titles and unpressed state', WITH_SELECTION.every((n) => { const b = chip(n)!; return !!b.querySelector('svg') && !!b.title && b.getAttribute('aria-pressed') === 'false'; }));
    check('Shape and operation chips keep their pressed state', chip('Rectangle')!.getAttribute('aria-pressed') === 'true' && chip('New')!.getAttribute('aria-pressed') === 'true');
    chip('Copy')!.click(); await settle();
    check('Copy still copies, and Paste appears before Customize', app.hasArtClip && labels().slice(-2).join() === 'Paste,Customize');
    chip('Transform')!.click(); await settle();
    const transformRow = labels();
    check('Transform still starts a transform, with its own row from the registry', app.transforming && transformRow.join() === TRANSFORM.join(), transformRow);
    app.cancelTransform(); await settle();
    const toolsBefore = tools();

    // hide Copy from its hold / right-click menu
    chip('Copy')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    await settle();
    const hide = menuItem('Hide “Copy” from this row');
    check('Right-click on a chip offers to hide it', !!hide);
    hide?.click(); await settle();
    check('Hiding removes exactly that chip', labels().join() === [...SHAPES, ...WITH_SELECTION.filter((n) => n !== 'Copy'), 'Paste', 'Customize'].join(), labels());
    check('The hidden set is saved on this device', JSON.parse(localStorage.getItem(COMMANDS_HIDDEN_KEY) ?? '{}').hidden?.join() === 'select.copy');
    app.setTool('fill'); app.setFillMode('lasso'); await settle();
    check('The tool bar is untouched', tools() === toolsBefore);
    chip('Transform')!.click(); await settle();
    check('The transform row is untouched', labels().join() === transformRow.join());
    app.cancelTransform(); await settle();

    await otherRows();
    await selectRect();

    // reload the page; the second pass checks the chip is still hidden
    sessionStorage.setItem('commandrow.results', JSON.stringify(results));
    sessionStorage.setItem(PASS_KEY, '2');
    location.reload();
  } else {
    await selectRect();
    check('After a reload Copy is still hidden', !chip('Copy') && !!chip('Cut') && !!chip('Customize'), labels());

    // Customize lists every Select command and brings Copy back
    chip('Customize')!.click(); await settle();
    const shown = menuItem('✓ Transform'), hidden = menuItem('Copy');
    check('Customize lists every Select command, ticked when shown', !!shown && !!hidden && document.querySelectorAll('.ctxmenu button[role="menuitem"]').length === 14);
    hidden?.click(); await settle();
    check('Customize → Copy shows it again in its place', labels().join() === [...SHAPES, ...WITH_SELECTION, 'Customize'].join(), labels());

    // App settings: Hidden controls lists it, Show applies with Apply, and profiles do not include it
    chip('Invert')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    await settle();
    menuItem('Hide “Invert” from this row')?.click(); await settle();
    const profilesBefore = localStorage.getItem(STUDENT_PROFILES_KEY);
    const settings = new AppSettingsUI(app, canvas, () => defaultQuickMenu(), () => {});
    settings.show();
    await settle();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.app-settings')!;
    const showInvert = dialog.querySelector<HTMLButtonElement>('button[aria-label="Show Invert"]');
    check('App settings lists the hidden control with a Show button', !!showInvert && dialog.textContent!.includes('Hidden controls'));
    showInvert?.click(); await settle();
    check('Show waits for Apply', !chip('Invert'));
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Apply settings')!.click(); await settle();
    check('Apply shows it again', !!chip('Invert') && JSON.parse(localStorage.getItem(COMMANDS_HIDDEN_KEY) ?? '{}').hidden?.length === 0);
    const profilesAfter = localStorage.getItem(STUDENT_PROFILES_KEY) ?? '';
    check('Student profiles do not store hidden controls', !profilesAfter.includes('select.') && !(profilesBefore ?? '').includes('select.'));
    check('The project file has no hidden controls', !JSON.stringify(app.project.comp).includes('select.'));
  }
} catch (e) {
  check(String(e), false);
}
if (second || results.some(([, ok]) => !ok) && sessionStorage.getItem(PASS_KEY) !== '2') {
  report();
  restore();
}
