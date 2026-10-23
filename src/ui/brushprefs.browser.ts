/** Isolated device-preference workflow using the actual App, library, sliders and dialogs. */
import { App } from '../app';
import { Project } from '../core/project';
import { PRESETS } from '../core/brush';
import { BRUSH_PREFS_KEY } from '../core/brushprefs';
import { loadBrushes, saveBrushes } from '../io/brushstore';
import { BrushLibrary } from './brushlib';
import { Sidebar } from './sidebar';

const keys = [BRUSH_PREFS_KEY, '2dope.m0.brush', '2dope.m0.color', '2dope.brushes.category', '2dope.brushes.sets', '2dope.brushes.mine'];
const saved = keys.map(k => localStorage.getItem(k));
const savedMine = await loadBrushes();
localStorage.removeItem(BRUSH_PREFS_KEY);
localStorage.removeItem('2dope.m0.brush');
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage); app.loadProject(new Project(128, 128)); app.setWorkspace('draw'); app.setPlane('fill'); app.color = '#264653';
const sidebar = new Sidebar(app, document.querySelector<HTMLElement>('#sidebar')!);
app.onBrushChange = () => sidebar.update();
let notices = 0; app.onDocChanged = () => notices++;
let studio = 0;
const library = new BrushLibrary(app, () => studio++);
const opener = document.querySelector<HTMLButtonElement>('#brushes')!; opener.onclick = () => library.toggle(opener);
const panel = () => document.querySelector<HTMLElement>('.brushlib')!;
const button = (label: string, root: ParentNode = panel()) => {
  const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  if (!b) throw new Error(`Missing button ${label}`); return b;
};
const category = (id: string) => panel().querySelector<HTMLButtonElement>(`[data-cat="${id}"]`)!.click();
const card = (name: string) => [...panel().querySelectorAll<HTMLButtonElement>('.bl-card')].find(b => b.dataset.name === name)!;
const shown = () => [...panel().querySelectorAll<HTMLElement>('.bl-card')].map(b => b.dataset.name!);
const done = () => button('Done choosing brush').click();
function choose(cat: string, name: string) { if (!library.open) opener.click(); category(cat); card(name).click(); done(); }
function key(target: HTMLElement, key: string) { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }
const settle = () => new Promise<void>(r => setTimeout(r, 160));
function context(name: string) { const c = card(name), r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 })); }
async function answer(label: string, name?: string) {
  const d = document.querySelector<HTMLDialogElement>('dialog[open]')!;
  if (name !== undefined) d.querySelector<HTMLInputElement>('input')!.value = name;
  button(label, d).click(); await settle();
}
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
try {
  await settle(); app.history.clear(); opener.click(); category('$favorites');
  check('Favorites starts with an explanation and no duplicate brush definitions', shown().length === 0 && panel().querySelector('.bl-empty')!.textContent!.includes('Favorite'));
  choose('ink', 'Ink');
  const size = document.querySelector<HTMLElement>('[data-slider="size"]')!, opacity = document.querySelector<HTMLElement>('[data-slider="opacity"]')!;
  size.focus(); key(size, 'Home'); for (let i = 0; i < 8; i++) key(size, 'ArrowUp');
  opacity.focus(); key(opacity, 'Home'); for (let i = 0; i < 4; i++) opacity.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
  check('Existing sliders tune Ink to 9px and 40%', app.brush.size === 9 && app.brush.opacity === .4);
  opener.click(); button('Favorite current brush').click();
  check('Favorite has a pressed state and a 44px touch target', button('Favorite current brush').getAttribute('aria-pressed') === 'true' && button('Favorite current brush').getBoundingClientRect().height >= 43.9);
  category('$favorites'); check('Favorites reuses the original selectable Ink card', shown().join() === 'Ink' && card('Ink').getAttribute('aria-selected') === 'true'); done();
  choose('paint', 'Marker'); app.brush.size = 73; app.brush.opacity = .65; app.brushChanged();
  choose('$favorites', 'Ink');
  check('Returning through Favorites recalls Ink size and opacity in both sliders', app.brush.size === 9 && app.brush.opacity === .4 && size.getAttribute('aria-valuenow') === '9' && opacity.getAttribute('aria-valuenow') === '40');
  check('Recall keeps the current tool, Fill plane and colour', app.tool === 'brush' && app.plane === 'fill' && app.color === '#264653');
  choose('paint', 'Marker'); check('Marker keeps its separate working size and opacity', app.brush.size === 73 && app.brush.opacity === .65);
  for (const [cat, name] of [['sketch','Pencil'],['sketch','Charcoal'],['ink','Fine Liner'],['paint','Soft Airbrush'],['ink','Ink']] as const) choose(cat, name);
  opener.click(); category('$recent');
  check('Recent shows exactly five unique choices in latest-first order', shown().join('|') === 'Ink|Soft Airbrush|Fine Liner|Charcoal|Pencil');
  card('Fine Liner').focus(); card('Fine Liner').click();
  check('Picking Recent updates order and preserves keyboard focus on the chosen brush', shown()[0] === 'Fine Liner' && (document.activeElement as HTMLElement).dataset.name === 'Fine Liner'); done();
  app.setTool('eraser'); choose('$favorites', 'Ink'); check('Eraser can use Favorites while keeping its tool and Fill target', app.tool === 'eraser' && app.plane === 'fill' && app.brush.size === 9);
  app.setWorkspace('animate'); choose('paint', 'Marker'); check('Animate shares the same brush memory', app.workspace === 'animate' && app.brush.size === 73 && app.brush.opacity === .65);
  app.setTool('brush'); app.setWorkspace('draw');
  // A saved personal brush, then rename/delete through the actual library controls.
  opener.click(); button('Save brush').click(); await answer('Save', 'Workflow test brush');
  app.brush.size = 31; app.brush.opacity = .25; app.brushChanged();
  button('Favorite current brush').click(); done(); choose('ink', 'Ink'); choose('$favorites', 'Workflow test brush');
  check('Saved personal brushes recall their own working settings', app.brush.size === 31 && app.brush.opacity === .25);
  opener.click(); context('Workflow test brush'); button('Rename…', document.querySelector('.ctxmenu')!).click(); await answer('Rename', 'Renamed workflow brush');
  check('Rename carries the current brush, memory, favorite and recent identity', app.brush.name === 'Renamed workflow brush' && app.brushPreferences.favorites.includes(app.brush.name) && app.brushPreferences.recent.includes(app.brush.name) && !app.brushPreferences.memory.some(m => m.name === 'Workflow test brush'));
  category('$favorites'); context('Renamed workflow brush'); button('Remove from Favorites', document.querySelector('.ctxmenu')!).click();
  check('Removing a favorite hides only its shortcut and returns focus to the category', !shown().includes('Renamed workflow brush') && library.all().some(b => b.name === 'Renamed workflow brush') && (document.activeElement as HTMLElement).dataset.cat === '$favorites');
  category('mine'); card('Renamed workflow brush').click(); done(); opener.click();
  // Saving over the same definition must not restore an older size/opacity.
  app.brush.size = 44; app.brush.opacity = .8; app.brushChanged(); button('Save brush').click(); await answer('Save', 'Renamed workflow brush');
  check('Saving over a personal brush keeps the newly tuned values', app.brush.size === 44 && app.brush.opacity === .8 && library.all().find(b => b.name === app.brush.name)!.size === 44);
  category('mine'); context('Renamed workflow brush'); button('Delete', document.querySelector('.ctxmenu')!).click(); await answer('Delete');
  check('Deleting the active personal brush removes all shortcuts and safely chooses Pencil', app.brush.name === 'Pencil' && !library.all().some(b => b.name === 'Renamed workflow brush') && !app.brushPreferences.memory.some(m => m.name === 'Renamed workflow brush') && !app.brushPreferences.recent.includes('Renamed workflow brush')); done();
  choose('$favorites', 'Ink');
  const reloadCanvas = document.createElement('canvas'), reloadStage = document.createElement('div'); reloadStage.append(reloadCanvas); document.body.append(reloadStage);
  const fresh = new App(reloadCanvas, reloadStage); fresh.setBrush(PRESETS.find(b => b.name === 'Marker')!);
  check('A new App instance restores favorites, recent choices and independent brush memory', fresh.brushPreferences.favorites.includes('Ink') && fresh.brush.size === 73 && fresh.brush.opacity === .65 && fresh.brushPreferences.recent[0] === 'Marker'); reloadStage.remove();
  check('Brush choices and management add no drawing Undo or document notifications', !app.history.canUndo && notices === 0 && studio === 0);
  opener.click(); category('$favorites'); button('Favorite current brush').click();
  check('Removing the last favorite retains an empty collection and useful recovery', shown().length === 0 && !!panel().querySelector('.bl-empty') && !panel().hidden);
  const r = panel().getBoundingClientRect();
  check('Panel, Favorite and Done remain inside the viewport', r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && button('Done choosing brush').getBoundingClientRect().bottom <= innerHeight);
  done(); check('Done returns focus to the drawing canvas', document.activeElement === canvas);
} catch (e) { check(String(e), false); }
finally {
  library.close(); await saveBrushes(savedMine ?? []);
  keys.forEach((k, i) => { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); });
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
