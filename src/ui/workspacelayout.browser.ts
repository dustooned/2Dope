import { App } from '../app';
import { Project } from '../core/project';
import { WORKSPACE_LAYOUT_KEY, defaultWorkspaceLayout } from '../core/workspacelayout';
import { STUDENT_PROFILES_KEY } from '../core/studentprefs';
import { captureProject } from '../io/projectio';
import { Bubbles } from './bubbles';
import { FlipMode } from './flipmode';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { ArtworkAssetsUI } from './artworkassets';
import { QuickMenu } from './quickmenu';
import { Sidebar } from './sidebar';

const keys = [WORKSPACE_LAYOUT_KEY, STUDENT_PROFILES_KEY, '2dope.student.ui', '2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view', '2dope.flip.mini', '2dope.ui.level', '2dope.quickmenu'];
const saved = keys.map(k => localStorage.getItem(k)); for (const k of keys) localStorage.removeItem(k);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage); app.loadProject(new Project(128, 128)); app.project.comp.duration = 12; app.setWorkspace('draw');
const flip = new FlipMode(app, stage), painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh());
const artwork = new ArtworkAssetsUI(app, document.querySelector('.painting-header')!);
let quick: QuickMenu;
const bubbles = new Bubbles(app, stage, { brushLibrary() {}, colorPanel() {}, layers() {}, fit: () => app.refit(), flip: { on: () => flip.on, set: on => flip.set(on) }, editWorkspace: anchor => quick.settings.show(anchor, 'workspace') });
const sidebar = new Sidebar(app, document.querySelector('#sidebar')!);
function refresh() { painting.update(); flip.update(); bubbles.update(); artwork.update(); sidebar.update(); }
app.onFrameChange = refresh; app.onToolChange = refresh; app.onWorkspaceChange = refresh; app.editor.onChange = refresh; flip.onChange = refresh;
quick = new QuickMenu(app, stage, canvas, { colour() {}, brushes() {}, layers() {}, assets() {} });
painting.editWorkspace = anchor => quick.settings.show(anchor, 'workspace');
const settle = () => new Promise<void>(r => setTimeout(r, 120));
const find = (label: string, scope: ParentNode = document) => { const b = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getBoundingClientRect().width > 0 && (b.getAttribute('aria-label') === label || b.textContent?.trim() === label)); if (!b) throw new Error(`Missing ${label}`); return b; };
const click = (label: string, scope?: ParentNode) => find(label, scope).click();
const tool = (id: string) => document.querySelector<HTMLButtonElement>(`.bub-tools [data-tool-key="${id}"]`);
const dialog = () => document.querySelector<HTMLDialogElement>('.app-settings')!;
const select = (label: string, value: string) => { const e = dialog().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })); };
const toggle = (label: string) => dialog().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!.click();
const hit = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9 && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); };
const overlap = (a: HTMLElement, b: HTMLElement) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top; };
let passed = 0, failed = 0, docs = 0;
app.onDocChanged = () => docs++;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); ok ? passed++ : failed++; }
try {
  refresh(); await settle();
  const project = app.project, frame = app.frame, history = app.history.peekUndo();
  check('Draw starts with compact painting tools and recoverable extras', !!tool('brush') && !!tool('smudge') && !!tool('transform') && !tool('pen') && !!tool('more'));
  check('Painting controls and source tools fit without crossing navigation', !overlap(document.querySelector('.bub-modes')!, document.querySelector('.bub-tools')!) && !overlap(document.querySelector('.painting-header')!, document.querySelector('.bub-tools')!));
  check('Settings and mode actions have reachable touch targets', hit(find('Edit workspace')) && hit(find('Toggle tool settings')) && hit(find('Animate', document.querySelector('.bub-modes')!)));
  check('More remains reachable when pinned tools exceed a narrow row', hit(tool('more')!));
  click('More tools'); await settle(); const drawer = document.querySelector<HTMLElement>('.bub-tool-drawer')!;
  check('More opens a separate tool drawer without growing the pinned row', !drawer.hidden && !!drawer.querySelector('[data-extra-tool="pen"]') && document.querySelectorAll('.bub-tools button').length === 8);
  click('Vector', drawer); await settle(); check('Picking an extra tool keeps it visible while active and closes the drawer', app.tool === 'pen' && !!tool('pen') && drawer.hidden);
  click('Brush', document.querySelector('.bub-tools')!); check('An unpinned tool steps aside when no longer active', !tool('pen'));
  click('Edit workspace'); toggle('Pin Vector'); click('Move Vector up'); select('Tool dock', 'left'); select('Brush controls edge', 'right'); click('Cancel');
  check('Cancel discards layout changes and leaves saved preferences alone', app.workspaceLayouts.draw.toolDock === 'top' && !app.workspaceLayouts.draw.tools.includes('pen') && localStorage.getItem(WORKSPACE_LAYOUT_KEY) === null);
  click('Edit workspace'); toggle('Pin Vector'); click('Move Vector up'); select('Tool dock', 'left'); select('Brush controls edge', 'right'); click('Apply settings'); await settle();
  check('Apply saves tool order and opposing docks only in Draw', app.workspaceLayouts.draw.tools.at(-2) === 'pen' && app.workspaceLayouts.draw.toolDock === 'left' && app.workspaceLayouts.draw.brushEdge === 'right' && app.workspaceLayouts.animate.toolDock === 'top');
  check('Side tools and brush rail remain separate with footer recovery reachable', !overlap(document.querySelector('.sidebar')!, document.querySelector('.bub-tools')!) && hit(find('Edit workspace')) && hit(tool('brush')!));
  const reloaded = new App(document.createElement('canvas'), document.createElement('div'));
  check('A fresh App reads the saved mode arrangement', JSON.stringify(reloaded.workspaceLayouts) === JSON.stringify(app.workspaceLayouts));
  app.setWorkspace('animate'); await settle(); check('Animate keeps its own tools and Flipbook', flip.on && stage.dataset.toolDock === 'top' && !tool('pen') && !!tool('assets'));
  const flipRect = flip.row.getBoundingClientRect(), stageRect = stage.getBoundingClientRect();
  const freeHeight = flipRect.top - stageRect.top - parseFloat(stage.style.getPropertyValue('--fit-top'));
  check(`Flipbook leaves a usable stage below navigation and tools (${Math.round(freeHeight)}px)`, freeHeight >= 70);
  const before = app.frame; click('Clips'); await settle(); check('Clips and Flipbook switch without changing artwork or frame', !flip.on && app.project === project && app.frame === before); click('Flipbook'); await settle();
  app.setWorkspace('draw'); await settle(); check('Returning restores Draw docks and pinned tools', stage.dataset.toolDock === 'left' && !!tool('pen') && document.body.classList.contains('workspace-brush-right'));
  click('Edit workspace'); select('Tool dock', 'right'); select('Brush controls edge', 'right'); toggle('Show tool labels'); click('Apply settings'); await settle();
  check('Tools and brush controls on the same edge dock beside each other', !overlap(document.querySelector('.sidebar')!, document.querySelector('.bub-tools')!));
  click('Edit workspace'); click('Restore Draw class defaults'); click('Apply settings'); await settle();
  check('Restore recovers Draw defaults without changing Animate', JSON.stringify(app.workspaceLayouts.draw) === JSON.stringify(defaultWorkspaceLayout('draw')) && app.workspaceLayouts.animate.toolDock === 'top');
  click('Edit workspace'); toggle('Pin Vector'); const name = dialog().querySelector<HTMLInputElement>('[aria-label="Profile name"]')!; name.value = 'Workspace test'; click('Save as new profile'); click('Apply settings');
  const profiles = JSON.parse(localStorage.getItem(STUDENT_PROFILES_KEY)!);
  check('Named profiles capture independent per-mode workspace arrangements', profiles.profiles[0].setup.workspaces.draw.tools.includes('pen') && !profiles.profiles[0].setup.workspaces.animate.tools.includes('pen'));
  click('Edit workspace'); toggle('Pin Reference');
  const originalSet = Storage.prototype.setItem; try { Storage.prototype.setItem = function(k, v) { if (k === WORKSPACE_LAYOUT_KEY) throw new DOMException('Full', 'QuotaExceededError'); return originalSet.call(this, k, v); }; click('Apply settings'); } finally { Storage.prototype.setItem = originalSet; }
  check('Storage failure leaves the draft open and live/profile preferences unchanged', !!dialog() && !app.workspaceLayouts.draw.tools.includes('reference') && !JSON.parse(localStorage.getItem(STUDENT_PROFILES_KEY)!).profiles[0].setup.workspaces.draw.tools.includes('reference')); click('Cancel');
  const portable = await captureProject(app.project).settle();
  check('Workspace changes preserve artwork, History and portable project content', app.project === project && app.frame === frame && app.history.peekUndo() === history && docs === 0 && !JSON.stringify(portable.file).includes('Workspace test') && !('workspaces' in portable.file));
} catch (e) { check(e instanceof Error ? e.stack ?? e.message : String(e), false); }
finally { quick.close(false); dialog()?.close(); dialog()?.remove(); keys.forEach((k, i) => { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); }); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · mode-first workspaces · ${innerWidth}×${innerHeight}`;
