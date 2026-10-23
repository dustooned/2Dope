/** Real App, painting layout and input; no project library/autosave. Preferences are restored. */
import { App } from '../app';
import { Project, planeCanvas } from '../core/project';
import { PRESETS } from '../core/brush';
import { QUICK_MENU_KEY, defaultQuickMenu, readQuickMenu } from '../core/quickmenu';
import { QuickMenu } from './quickmenu';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { Sidebar } from './sidebar';
import { Bubbles } from './bubbles';
import { ColorPanel } from './colorpanel';

const keys = ['2dope.student.ui', '2dope.student.profiles', '2dope.student.fingerPaint', '2dope.quickshape', QUICK_MENU_KEY, '2dope.inkpaint', '2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view', '2dope.flip.mini', '2dope.m0.brush', '2dope.m0.color', '2dope.ui.level', '2dope.color.recent', '2dope.color.mode', '2dope.color.palette', '2dope.color.palettes', '2dope.color.paletteAt', '2dope.color.harmony'];
const saved = keys.map(k => localStorage.getItem(k)); for (const k of keys) localStorage.removeItem(k);
localStorage.setItem(QUICK_MENU_KEY, '{broken json');
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage); app.loadProject(new Project(128, 128)); app.project.layer.exposures[0]!.length = 4; app.project.comp.duration = 24;
const flip = new FlipMode(app, stage), painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh(), () => {});
const sidebar = new Sidebar(app, document.querySelector<HTMLElement>('#sidebar')!);
const chip = document.createElement('input'); chip.type = 'color'; chip.hidden = true; document.body.append(chip);
const colours = new ColorPanel(app, chip);
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel: a => colours.toggle(a), layers() {}, fit: () => app.fit() }); bubbles.setLevel('simple', false);
function refresh() { flip.update(); painting.update(); sidebar.update(); bubbles.update(); }
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.onToolChange = refresh; app.onBrushChange = refresh;
app.onColorChange = () => { colours.sync(); refresh(); }; app.history.onChange = refresh; flip.onChange = refresh;
let assetsOpened = 0, brushesOpened = 0, layersOpened = 0;
const quick = new QuickMenu(app, stage, canvas, { beforeOpen: () => colours.close(), colour: a => colours.toggle(a), assets: () => assetsOpened++, brushes: () => brushesOpened++, layers: () => layersOpened++ });
const changeFlip = flip.onChange; flip.onChange = () => { changeFlip(); quick.update(); };
const settle = () => new Promise<void>(r => setTimeout(r, 120));
function key(target: HTMLElement, code: string, value = code, options: KeyboardEventInit = {}) { target.dispatchEvent(new KeyboardEvent('keydown', { code, key: value, bubbles: true, cancelable: true, ...options })); }
const popup = () => document.querySelector<HTMLElement>('.quick-menu-popup');
const settings = () => document.querySelector<HTMLDialogElement>('.app-settings[open]')!;
const button = (name: string, scope: ParentNode = settings() ?? popup() ?? document) => {
  const b = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name);
  if (!b) throw new Error(`Missing ${name}`); return b;
};
const click = (name: string, scope?: ParentNode) => { const b = button(name, scope); if (b.disabled) throw new Error(`Disabled ${name}`); b.click(); };
const slot = (i: number) => settings().querySelector<HTMLSelectElement>(`[aria-label="QuickMenu action ${i}"]`)!;
function customize(actions: string[], edge = 'right', show = true) {
  quick.settings.show(quick.trigger); actions.forEach((id, i) => { slot(i + 1).value = id; });
  settings().querySelector<HTMLSelectElement>('[aria-label="QuickMenu button edge"]')!.value = edge;
  settings().querySelector<HTMLInputElement>('[aria-label="Show QuickMenu button"]')!.checked = show;
  click('Apply settings');
}
const state = () => JSON.stringify({ view: app.view, frame: app.frame, comp: app.project.activeComp, layer: app.project.activeLayer, plane: app.plane, tool: app.tool });
const hit = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9 && e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); };
function pointer(type: string, x: number, y: number) {
  const r = canvas.getBoundingClientRect(), s = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'pen', button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, pressure: 1, clientX: r.left + s.x, clientY: r.top + s.y }));
}
const ink = () => planeCanvas(app.drawing, 'line').getContext('2d')!.getImageData(64, 64, 1, 1).data[3]!;
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
try {
  await settle(); app.fit(); app.setFrame(1); const initial = state();
  check('Malformed saved preferences recover to a reachable 44px QuickMenu button', hit(quick.trigger) && quick.trigger.dataset.edge === 'right' && !app.history.canUndo);
  quick.trigger.click(); await settle();
  check('The default six actions form a fully reachable ring without changing canvas or document state', [...popup()!.querySelectorAll<HTMLButtonElement>('[data-quick-action]')].every(b => hit(b)) && popup()!.querySelectorAll('[data-quick-action]').length === 6 && button('Undo').disabled && button('Redo').disabled && state() === initial && !app.history.canUndo);
  key(document.activeElement as HTMLElement, 'Escape', 'Escape');
  check('Escape closes only QuickMenu and restores canvas focus with the view intact', !popup() && document.activeElement === canvas && state() === initial);
  key(canvas, 'KeyQ', 'q'); key(document.activeElement as HTMLElement, 'KeyQ', 'q', { repeat: true });
  check('Q opens QuickMenu once and ignores key-repeat', !!popup());
  click('Customize QuickMenu'); await settle();
  check('Customize opens App settings with all six action slots and fixed touch-sized Apply and Cancel', !!settings() && settings().querySelectorAll('.app-settings-slots select').length === 6 && hit(button('Apply settings')) && hit(button('Cancel')) && !popup());
  slot(1).value = 'colour'; key(slot(1), 'KeyQ', 'q');
  check('Settings fields own their keys and do not open QuickMenu or change the drawing', !popup() && !app.history.canUndo);
  click('Cancel');
  check('Cancelling customization leaves device preferences and project history unchanged', localStorage.getItem(QUICK_MENU_KEY) === '{broken json' && state() === initial && !app.history.canUndo);
  const custom = ['undo', 'redo', 'brush', 'colour', 'newFrame', 'assets']; customize(custom, 'left'); await settle();
  check('Apply saves six ordered choices and edge position without changing the document', JSON.stringify(readQuickMenu(JSON.parse(localStorage.getItem(QUICK_MENU_KEY)!)).actions) === JSON.stringify(custom) && quick.trigger.dataset.edge === 'left' && state() === initial && !app.history.canUndo);
  check('The left edge button clears existing painting controls', hit(quick.trigger));
  key(canvas, 'KeyQ', 'q'); await settle();
  check('The customized ring follows saved slot order with all actions at least 44px', [...popup()!.querySelectorAll<HTMLButtonElement>('[data-quick-action]')].map(b => b.dataset.quickAction).join(',') === custom.join(',') && [...popup()!.querySelectorAll<HTMLButtonElement>('button')].every(hit));
  key(document.activeElement as HTMLElement, 'ArrowRight', 'ArrowRight'); const moved = document.activeElement;
  key(document.activeElement as HTMLElement, 'End', 'End'); key(document.activeElement as HTMLElement, 'Tab', 'Tab');
  check('Arrow navigation and Tab stay in QuickMenu without moving the playhead', !!moved && popup()!.contains(moved) && document.activeElement === button('Close QuickMenu') && app.frame === 1);
  click('Brush'); app.setBrush({ ...PRESETS[0]!, size: 12, opacity: 1, smoothing: 0, taperStart: 0, taperEnd: 0 }); app.setColor('#ff0000'); app.setPlane('line');
  pointer('pointerdown', 24, 64); pointer('pointermove', 64, 64); pointer('pointermove', 104, 64); pointer('pointerup', 104, 64); await settle();
  check('Choosing Brush returns to real painting using the shared Line plane and history', ink() > 0 && app.history.canUndo && document.activeElement === canvas && !popup());
  key(canvas, 'KeyQ', 'q'); click('Undo'); await settle(); const erased = ink() === 0;
  key(canvas, 'KeyQ', 'q'); click('Redo'); await settle();
  check('QuickMenu Undo and Redo restore actual painted pixels through existing document history', erased && ink() > 0);
  const edit = app.history.peekUndo(); key(canvas, 'KeyQ', 'q'); click('Colour'); await settle();
  check('A configured Colour action delegates to the actual panel after closing QuickMenu', colours.open && !popup() && app.history.peekUndo() === edit);
  key(button('Done choosing colour', document), 'KeyQ', 'q'); await settle();
  check('Keyboard opening closes the existing colour panel before showing QuickMenu', !!popup() && !colours.open && app.history.peekUndo() === edit);
  click('Close QuickMenu'); await settle();
  key(canvas, 'KeyQ', 'q'); click('New frame'); await settle();
  check('New frame adds after the complete hold and uses one existing timeline Undo', app.project.exposures.length === 2 && app.project.exposures[0]!.length === 4 && app.frame === 4 && app.history.peekUndo()?.label === 'Add frame');
  app.undo(); await settle(); const beforeDismiss = state(), command = app.history.peekUndo();
  key(canvas, 'KeyQ', 'q'); const backdrop = document.querySelector<HTMLElement>('.quick-menu-backdrop')!;
  const outside = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 10 }); backdrop.dispatchEvent(outside);
  check('An outside tap is consumed and dismisses without painting or changing the view', outside.defaultPrevented && !popup() && state() === beforeDismiss && app.history.peekUndo() === command && document.activeElement === canvas);
  app.project.layer.locked = true; key(canvas, 'KeyQ', 'q');
  check('A locked layer disables New frame instead of allocating a drawing', button('New frame').disabled); quick.close(); app.project.layer.locked = false;
  key(canvas, 'KeyQ', 'q'); click('My Assets'); check('My Assets invokes the supplied library action exactly once', assetsOpened === 1 && !popup());
  customize(['brushes', 'layers', 'fill', 'pen', 'smudge', 'plane']); key(canvas, 'KeyQ', 'q'); click('Brushes'); key(canvas, 'KeyQ', 'q'); click('Layers');
  check('Configured Brushes and Layers use their existing UI callbacks', brushesOpened === 1 && layersOpened === 1 && !popup());
  app.setFillMode('lasso'); app.selectMoves = true; key(canvas, 'KeyQ', 'q'); click('Bucket fill');
  check('Bucket fill exits area selection and selects the normal Fill plane', app.tool === 'fill' && app.fillMode === 'tap' && !app.selectMoves && app.plane === 'fill');
  key(canvas, 'KeyQ', 'q'); click('Vector'); key(canvas, 'KeyQ', 'q'); click('Line / Fill');
  check('Vector and Line/Fill keep existing plane/tool compatibility', app.plane === 'fill' && app.tool === 'brush');
  key(canvas, 'KeyQ', 'q'); click('Smudge'); check('Smudge uses the shared brush state', app.smudging && app.tool === 'brush'); app.setSmudging(false);
  pointer('pointerdown', 24, 84); key(canvas, 'KeyQ', 'q');
  check('Q cannot interrupt an active pen stroke', app.strokeActive && !popup()); pointer('pointercancel', 24, 84); await settle();
  customize(['play', 'onion', 'fitView', 'resetRotation', 'previous', 'next']); key(canvas, 'KeyQ', 'q'); click('Play / pause'); await settle();
  key(canvas, 'KeyQ', 'q');
  check('QuickMenu remains usable to pause playback while editing/navigation actions are disabled', app.playing && !button('Play / pause').disabled && button('Next frame').disabled);
  click('Play / pause'); check('Pause delegates to the shared playback clock', !app.playing && !popup());
  app.setWorkspace('animate'); flip.set(true); await settle(); quick.update();
  check('Animate shares the customized menu and keeps its opener clear of the Flipbook', hit(quick.trigger));
  key(canvas, 'KeyQ', 'q'); const owner = app.project; app.setWorkspace('motion');
  check('Leaving painting modes closes QuickMenu and hides its button without copying the project', !popup() && quick.trigger.hidden && app.project === owner);
  app.setWorkspace('draw'); await settle(); customize(['none', 'none', 'none', 'none', 'none', 'none'], 'right', false); await settle();
  key(canvas, 'KeyQ', 'q');
  check('Hidden-button and all-empty settings retain Q access and focus Customize for recovery', quick.trigger.hidden && !!popup() && document.activeElement === button('Customize QuickMenu'));
  key(document.activeElement as HTMLElement, 'Escape', 'Escape'); quick.settings.show(); click('Restore QuickMenu defaults'); click('Cancel');
  check('Restoring defaults remains a draft until Apply is chosen', readQuickMenu(JSON.parse(localStorage.getItem(QUICK_MENU_KEY)!)).showButton === false);
  quick.settings.show(); click('Restore QuickMenu defaults'); click('Apply settings'); await settle();
  check('Apply defaults restores the original six actions and reachable right-edge button', JSON.stringify(readQuickMenu(JSON.parse(localStorage.getItem(QUICK_MENU_KEY)!))) === JSON.stringify(defaultQuickMenu()) && !quick.trigger.hidden && hit(quick.trigger));
  key(canvas, 'KeyQ', 'q'); app.setFrame(3); check('Changing the selected frame closes an obsolete menu', !popup());
  key(canvas, 'KeyQ', 'q'); app.loadProject(new Project(128, 128));
  check('Loading a project closes old menu actions while retaining device customization', !popup() && !app.history.canUndo && !quick.trigger.hidden && localStorage.getItem(QUICK_MENU_KEY) !== null);
  customize(['inkPaint','none','none','none','none','none']);key(canvas,'KeyQ','q');click('Ink & Paint');const enabled=app.inkPaint.enabled&&app.plane==='line';key(canvas,'KeyQ','q');click('Ink & Paint');
  check('A customized Ink & Paint action toggles the combined workflow without drawing history',enabled&&!app.inkPaint.enabled&&!app.history.canUndo);
} catch (e) { check(String(e), false); }
finally {
  quick.close(false); if (app.playing) app.togglePlay(); colours.close();
  settings()?.close(); settings()?.remove();
  keys.forEach((k, i) => { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); });
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
