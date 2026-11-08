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
import { closeContextMenu, showContextMenu } from './contextmenu';
import { frameMenu } from './framemenu';
import { frameContent } from '../core/comp';
import { tweenStrokes } from '../core/vectortween';

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
let brushPanels = 0;
const bubbles = new Bubbles(app, stage, { brushLibrary() { brushPanels++; }, colorPanel() {}, layers() {}, layerCards() {}, fit: () => app.refit(), editShape() {} });
bubbles.setLevel('simple', false);
const refresh = () => bubbles.update();
app.onFrameChange = refresh; app.onCompChange = refresh; app.onToolChange = refresh; app.history.onChange = refresh;
const settle = (ms = 140) => new Promise<void>((r) => setTimeout(r, ms));
const row = () => [...document.querySelectorAll<HTMLButtonElement>('.bub-ctx button')].filter((b) => b.getAttribute('aria-label'));
const labels = () => row().map((b) => b.getAttribute('aria-label')!);
const chip = (name: string) => row().find((b) => b.getAttribute('aria-label') === name) ?? null;
const tools = () => [...document.querySelectorAll<HTMLButtonElement>('.bub-tools button')].map((b) => b.getAttribute('aria-label')).join();
const trayItem = (id: string) => document.querySelector<HTMLButtonElement>(`.bar-tray [data-add="${id}"]`);
/** A tap on a tray item, as a finger: down and up on the spot. */
function tapTray(id: string) {
  const b = trayItem(id); if (!b) return;
  const r = b.getBoundingClientRect(), o = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 5, clientX: r.left + 5, clientY: r.top + 5, button: 0 };
  b.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 })); b.click();
}
const menuItem = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button')].find((b) => (b.firstChild?.textContent ?? '').trim() === text) ?? null;
function pointer(type: string, x: number, y: number, pointerType = 'pen', pointerId = 1) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, pointerId, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 1, clientX: r.left + p.x, clientY: r.top + p.y }));
}
const drag = (x: number, y: number, toX: number, toY: number) => {
  pointer('pointerdown', x, y); pointer('pointermove', toX, toY); pointer('pointerup', toX, toY);
};
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
const TRANSFORM_PRIMARY = ['Uniform', 'Freeform', 'Distort', 'Warp', 'Apply', 'Cancel', 'Transform options'];
const TRANSFORM = [...TRANSFORM_PRIMARY, 'Snapping', 'Magnetics', '−', '+', '⟲45', '⟳45', 'Flip ↔', 'Flip ↕', 'Fit', 'Reset', 'Customize'];
const hint = (text: string) => [...document.querySelectorAll('.bub-ctx .bub-hint')].some((s) => s.textContent === text);

/** Slice 2: the other rows come from the registry with the same chips, in the same order. */
async function otherRows() {
  // Transform: all modes stay available; a hidden step leaves the rest in place.
  chip('Transform')!.click(); await settle();
  chip('Transform options')!.click(); await settle();
  const ff = chip('Freeform')!;
  ff.click(); await settle();
  check('Transform: Freeform is pressed and describes independent scaling', app.transformMode === 'freeform' && chip('Freeform')!.getAttribute('aria-pressed') === 'true' && /independently/.test(chip('Freeform')!.title));
  for (const mode of ['Distort', 'Warp', 'Uniform']) {
    chip(mode)!.click(); await settle();
    check(`Transform: ${mode} is the only active mode`, app.transformMode === mode.toLowerCase() &&
      ['Uniform', 'Freeform', 'Distort', 'Warp'].filter((name) => chip(name)?.getAttribute('aria-pressed') === 'true').join() === mode);
  }
  const scale = app.transformParams!.scale;
  chip('+')!.click(); await settle();
  check('Transform: + still makes it bigger', app.transformParams!.scale > scale);
  chip('−')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })); await settle();
  const hideSmaller = menuItem('Hide “Smaller” from this row');
  check('A symbol chip is named in words in its hide menu', !!hideSmaller);
  hideSmaller?.click(); await settle();
  check('Hiding Smaller leaves the rest of the Transform row', labels().join() === TRANSFORM.filter((n) => n !== '−').join(), labels());
  chip('Customize')!.click(); await settle();
  check('Transform Customize opens the row for editing, Smaller in its tray', document.querySelector('.bub-ctx')!.classList.contains('bar-editing') && !!trayItem('transform.smaller'));
  tapTray('transform.smaller'); await settle();
  document.querySelector<HTMLButtonElement>('.bar-tray-done')!.click(); await settle();
  check('A tap on Smaller in the tray brings it back in its place', labels().join() === TRANSFORM.join(), labels());
  app.cancelTransform(); await settle();

  // Fill: the style chips stay; Swap with a gradient; Fill selection with a selection
  app.setTool('fill'); app.setFillMode('tap'); app.setFillStyle('solid'); await settle();
  check('Fill row: tap modes, styles, Fill selection, Customize', labels().join() === 'Tap / drag,Leftovers,Solid,Linear,Radial,Fill selection,Customize', labels());
  app.setFillStyle('linear'); await settle();
  check('Fill row: Swap appears with a gradient', labels().includes('Swap') && labels().indexOf('Swap') < labels().indexOf('Fill selection'), labels());
  app.setFillStyle('solid'); await settle();

  // Smudge: Softer and Stronger around the strength readout
  app.setTool('brush'); app.setSmudging(true); await settle();
  check('Smudge row: Ink target, Colour target, Softer, Stronger, Customize', labels().join() === 'Ink target,Colour target,Softer,Stronger,Customize', labels());
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
  check('Vector row with a line: Edit points and Export SVG before Customize', labels().slice(-3).join() === 'Edit points,Export SVG,Customize', labels());

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
    check('Transform starts with modes and Apply/Cancel, with other controls folded', app.transforming && transformRow.join() === TRANSFORM_PRIMARY.join(), transformRow);
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
    check('Customize offers the hidden Copy in its tray, and only hidden commands', !!trayItem('select.copy') && !trayItem('select.transform'));
    tapTray('select.copy'); await settle();
    document.querySelector<HTMLButtonElement>('.bar-tray-done')!.click(); await settle();
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
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());

    // Slice 3: the frame and canvas menus hide entries by id, with Customize at the end
    const menuLabels = () => [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button[role="menuitem"]')].map((b) => (b.firstChild?.textContent ?? '').replace(/^✓ /, '').trim());
    showContextMenu(100, 100, frameMenu(app)); await settle();
    const frameBefore = menuLabels();
    check('The frame menu ends with Customize this menu…', frameBefore.at(-1) === 'Customize this menu…' && frameBefore.includes('Insert frame before'), frameBefore);
    menuItem('Customize this menu…')!.click(); await settle();
    check('Customize lists every frame menu entry', menuLabels().length === 13 && !!menuItem('✓ Insert frame before'), menuLabels());
    menuItem('✓ Insert frame before')!.click(); await settle();
    showContextMenu(100, 100, frameMenu(app)); await settle();
    check('A hidden frame entry leaves the menu, the rest stay in order', menuLabels().join() === frameBefore.filter((n) => n !== 'Insert frame before').join(), menuLabels());
    closeContextMenu();
    app.openCanvasMenu(200, 200); await settle();
    const canvasBefore = menuLabels();
    check('The canvas menu ends with Customize this menu…', canvasBefore.at(-1) === 'Customize this menu…' && canvasBefore.includes('Fit view'), canvasBefore);
    menuItem('Customize this menu…')!.click(); await settle();
    menuItem('✓ Fit view')!.click(); await settle();
    app.openCanvasMenu(200, 200); await settle();
    check('A hidden canvas entry leaves the menu', !menuLabels().includes('Fit view') && menuLabels().length === canvasBefore.length - 1, menuLabels());
    closeContextMenu();
    const settings2 = new AppSettingsUI(app, canvas, () => defaultQuickMenu(), () => {});
    settings2.show(); await settle();
    const dialog2 = [...document.querySelectorAll<HTMLDialogElement>('dialog.app-settings')].at(-1)!;
    check('App settings names hidden menu entries and their menu', dialog2.textContent!.includes('Insert frame before (frame menu)') && dialog2.textContent!.includes('Fit view (canvas menu)'));
    dialog2.querySelector<HTMLButtonElement>('button[aria-label="Show Insert frame before"]')!.click();
    dialog2.querySelector<HTMLButtonElement>('button[aria-label="Show Fit view"]')!.click();
    [...dialog2.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Apply settings')!.click(); await settle();
    showContextMenu(100, 100, frameMenu(app)); await settle();
    check('Apply puts the menu entries back', menuLabels().join() === frameBefore.join() && JSON.parse(localStorage.getItem(COMMANDS_HIDDEN_KEY) ?? '{}').hidden?.length === 0, menuLabels());
    closeContextMenu();
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());

    app.loadProject(new Project(128, 128)); app.setWorkspace('draw'); app.setTool('brush'); app.fit();
    const drawing = app.project.drawingAtFrame(0)!;
    const g = drawing.line.getContext('2d')!;
    g.fillStyle = '#ff000080'; g.fillRect(25, 25, 64, 64);
    g.fillStyle = '#0000ff'; g.fillRect(54, 54, 7, 7);
    const at = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data];
    await settle();
    const tool = (key: string) => document.querySelector<HTMLButtonElement>(`.bub-tools [data-tool-key="${key}"]`);
    if (!tool('transform')) tool('more')?.click();
    tool('transform')!.click(); await settle();
    check('Toolbar Transform opens on the ink bounds and keeps Brush as the return tool', app.transforming && app.tool === 'brush');
    chip('Transform options')!.click(); await settle();
    const edit = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.value = value; input.dispatchEvent(new Event('change'));
    };
    edit('[data-transform-dimension=width]', '80');
    check('Exact width in Uniform scales both dimensions', app.transformDimensions?.width === 80 && app.transformDimensions.height === 80);
    chip('Reset')!.click();
    chip('Freeform')!.click(); await settle();
    edit('[data-transform-dimension=height]', '72');
    edit('[data-transform-dimension=angle]', '12.5');
    check('Freeform numeric height and angle retain the width', app.transformDimensions?.width === 64 && app.transformDimensions.height === 72 && app.transformDimensions.angle === 12.5);
    chip('Reset')!.click();
    drag(89, 57, 104, 57);
    check('Freeform side handle changes width and leaves the opposite edge and height in place', (app.transformParams?.sx ?? 0) > 1.2 && (app.transformParams?.sy ?? 1) === 1 && at(25, 57)[3]! > 100 && at(100, 57)[3]! > 100);
    chip('Reset')!.click(); chip('Distort')!.click(); await settle();
    drag(25, 25, 43, 40);
    check('Distort moves the selected corner and preserves the opposite corner', at(27, 27)[3] === 0 && at(87, 87)[3] === 128);
    chip('Reset')!.click(); chip('Warp')!.click(); await settle();
    const sampling = document.querySelector<HTMLSelectElement>('.transform-sampling')!;
    sampling.value = 'nearest'; sampling.dispatchEvent(new Event('change'));
    drag(57, 57, 70, 64);
    check('Warp moves the center of the artwork with its grid point and leaves the corner in place', at(70, 64)[2] === 255 && at(70, 64)[3] === 255 && at(27, 27)[3] === 128 && app.transformInterpolation === 'nearest');
    const zoom = app.view.zoom;
    pointer('pointerdown', 15, 55, 'touch', 2);
    pointer('pointermove', 12, 55, 'touch', 2);
    pointer('pointerdown', 100, 55, 'touch', 3);
    pointer('pointermove', 120, 55, 'touch', 3);
    pointer('pointerup', 120, 55, 'touch', 3);
    pointer('pointerup', 12, 55, 'touch', 2);
    check('Two fingers zoom the canvas without changing the active Warp', app.transforming && app.view.zoom > zoom && app.transformParams?.dx === 0 && at(70, 64)[2] === 255);
    app.fit();
    chip('Cancel')!.click(); await settle();
    check('Cancel restores the original pixels, with no selection or Undo step', at(57, 57)[2] === 255 && at(70, 64)[2] === 0 && !app.spatialSelection && !app.history.canUndo);
    if (!tool('transform')) tool('more')?.click();
    tool('transform')!.click(); await settle();
    drag(57, 57, 70, 64);
    const beforeBrush = brushPanels;
    tool('brush')!.click(); await settle();
    check('Returning to Brush applies the edit without opening the library or leaving a selection', !app.transforming && app.tool === 'brush' && !app.spatialSelection && brushPanels === beforeBrush && app.history.canUndo);
    app.undo(); await settle();
    check('One Undo restores the original Warp pixels', at(57, 57)[2] === 255 && at(70, 64)[2] === 0 && !app.history.canUndo);

    app.loadProject(new Project(128, 128)); app.setWorkspace('animate'); app.setTool('pen'); app.fit(); await settle();
    pointer('pointerdown', 26, 50);
    for (let x = 30; x <= 90; x += 4) pointer('pointermove', x, 50);
    pointer('pointerup', 90, 50); await settle();
    const poseA = app.drawing, strokeA = poseA.vectors[0]!;
    const undoDepth = () => (app.history as unknown as { done: unknown[] }).done.length;
    const depthBefore = undoDepth();
    check('Animate offers one Next pose action and no tween setup toggles',
      !!chip('Next pose') && !chip('Tween vector points') && !chip('Duplicate vector pose'), labels());
    chip('Next pose')!.click(); await settle();
    const poseB = app.drawing;
    check('Next pose turns tweening on, gives the first pose room and opens Edit points on the copy in one Undo step',
      poseB.id !== poseA.id && !!(app.project.layer as { tweenVectors?: boolean }).tweenVectors && app.project.exposures[0]!.length >= 2 &&
      !!app.pointStroke && undoDepth() === depthBefore + 1 && app.history.peekUndo()?.label === 'Next pose', { a: poseA.id, b: poseB.id, holds: app.project.exposures.map(e => e.length), depth: [depthBefore, undoDepth()] });
    const first = strokeA.points[0]!;
    drag(first.x, first.y, first.x, first.y + 18); await settle();
    chip('Done')!.click(); await settle();
    const strokeB = poseB.vectors[0]!, middle = tweenStrokes(poseA.vectors, poseB.vectors, 0.5)[0]!;
    const content = frameContent(app.project.comps, app.project.comp, 2);
    check('The new pose moves its own points and the frames between interpolate without changing the first pose',
      strokeB.id === strokeA.id && strokeB.points[0]!.y > first.y + 10 &&
      poseA.vectors[0] === strokeA && middle.points[0]!.y === (first.y + strokeB.points[0]!.y) / 2 &&
      content.drawings.has(poseA.id), { a: first.y, b: strokeB.points[0]!.y, middle: middle.points[0]!.y, frame: app.frame });
  }
} catch (e) {
  check(String(e), false);
}
if (second || results.some(([, ok]) => !ok) && sessionStorage.getItem(PASS_KEY) !== '2') {
  report();
  restore();
}
