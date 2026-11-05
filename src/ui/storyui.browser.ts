import { App } from '../app';
import { Project } from '../core/project';
import { cloneBrush, PRESETS } from '../core/brush';
import { BoardPanel } from './board';
import { Bubbles } from './bubbles';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage); app.loadProject(new Project(320, 180)); app.setWorkspace('board');
const errors: string[] = []; addEventListener('error', (e) => errors.push(e.message));
let shared = 0, presented = 0, help = '';
app.onOpenManual = (section) => { help = section ?? ''; };
const board = new BoardPanel(app, document.querySelector<HTMLElement>('#board')!, () => shared++, () => presented++);
const bubbles = new Bubbles(app, stage, { fit: () => app.refit(), brushLibrary: () => {}, colorPanel: () => {}, layers: () => {}, story: { view: () => board.currentView, setView: (v) => board.setView(v), images: () => board.pickImages(), exportBoard: () => shared++, controlsInPanel: true } });
bubbles.setLevel('simple', false);
const refresh = () => { document.body.classList.remove('ws-board', 'ws-draw', 'ws-animate', 'ws-time', 'ws-motion'); document.body.classList.add(`ws-${app.workspace}`); board.update(); bubbles.update(); };
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.onThumbs = refresh; app.history.onChange = refresh; board.onView = () => bubbles.update(); refresh();
const wait = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms));
const button = (label: string, scope: ParentNode = document) => { const b = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label); if (!b) throw new Error(`Missing ${label}`); return b; };
const expect = (ok: unknown, why: string) => { if (!ok) throw new Error(why); };
let passed = 0, failed = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; } document.querySelector('#results')!.append(li); }
const bar = () => document.querySelector<HTMLElement>('.board-bar')!;
const card = (i: number) => document.querySelector<HTMLElement>(`.bcard[data-i="${i}"]`)!;
const menu = () => document.querySelector<HTMLElement>('.ctxmenu')!;
const snapshot = () => JSON.stringify(app.board?.exposures);
await wait(180);
await check('Simple Story has one visible control header and no duplicated floating view row', () => {
  expect(bar().offsetHeight > 0 && document.querySelector<HTMLElement>('.bub-ctx')!.hidden, 'header hidden or duplicate view row');
  expect(button('Share storyboard').disabled && button('Play', bar()).disabled, 'empty Story actions enabled');
});
await check('New panel starts Story with one Undo and Undo restores its empty state', async () => {
  button('New panel', bar()).click(); await wait(); expect(app.board?.exposures.length === 1 && app.history.peekUndo()?.label === 'Start storyboard', 'start command missing');
  app.undo(); await wait(); expect(!app.board && button('Share storyboard').disabled, 'empty-state recovery failed');
  app.redo(); await wait(); expect(app.board?.exposures.length === 1 && app.project.activeLayer === app.board.id, 'Redo did not restore board editing focus');
});
await check('Story sketch bar selects Brush/Eraser and strokes edit only the board, with Undo', async () => {
  const eraser = document.querySelector<HTMLButtonElement>('.bub-tools [data-tool-key=eraser]')!, brush = document.querySelector<HTMLButtonElement>('.bub-tools [data-tool-key=brush]')!;
  expect(!!eraser && !!brush && !document.querySelector('.bub-tools [data-tool-key=panel]'), 'Story default duplicates panel actions instead of sketch tools');
  eraser.click(); expect(app.tool === 'eraser', 'Eraser not selected'); brush.click();
  app.setBrush({ ...cloneBrush(PRESETS[0]!), size: 10, opacity: 1, smoothing: 0, postSmooth: 0 }, false); app.quickShape = false;
  app.fit(); await wait(); const d = app.drawing, before = app.history.peekUndo();
  const send = (type: string, x: number) => { const p = app.view.docToScreen(x, 40), r = canvas.getBoundingClientRect(); canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'pen', button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: .7, clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, cancelable: true })); };
  send('pointerdown', 25); send('pointermove', 45); send('pointermove', 70); send('pointerup', 75); await wait();
  const painted = () => d.line.getContext('2d')!.getImageData(0, 0, d.line.width, d.line.height).data.some((v, i) => i % 4 === 3 && v > 0);
  expect(d.id === app.board!.exposures[0]!.drawing && painted() && app.history.peekUndo() !== before, 'stroke missed the storyboard');
  const real = app.project.comp.layers.find((l) => l.kind === 'drawings' && !l.guide)!;
  expect(real.kind === 'drawings' && real.exposures.length === 1, 'Story sketch changed the animation track');
  app.undo(); await wait(); expect(!painted() && app.project.activeLayer === app.board!.id, 'Undo lost Story ownership or pixels');
});
await check('Panel cards keep Dialogue and Action visible; camera, shot and notes are in Details', () => {
  const c = card(0), details = c.querySelector<HTMLDetailsElement>('.story-panel-details')!;
  expect(!details.open && !c.querySelector('[data-field=action]')!.closest('details') && !c.querySelector('.bdialogue')!.closest('details'), 'essential writing folded');
  for (const field of ['shot', 'camera', 'slug', 'note']) expect(details.contains(c.querySelector(`[data-field=${field}]`)), `${field} not in Details`);
  expect(!!c.querySelector('button.story-panel-picture') && !!c.querySelector('.story-panel-more'), 'picture or panel actions lack a keyboard entry');
});
await check('Story tools includes Script, Present and Animate at Simple level', async () => {
  button('Story tools', bar()).click();
  expect(!!button('Paste a script…', menu()) && !!button('Present storyboard', menu()) && !!button('Animate this shot', menu()), 'missing Story actions');
  button('Present storyboard', menu()).click(); expect(presented === 1, 'Present not routed');
  const before = snapshot(); button('Story tools', bar()).click(); button('Paste a script…', menu()).click(); await wait();
  const dialog = document.querySelector('dialog[open]')!; expect(!!dialog, 'Script dialog did not open'); button('Cancel', dialog).click(); await wait(); expect(snapshot() === before, 'Cancel changed panels');
});
await check('Grid, Panels, Timeline and Split are the same non-document choices at every UI level', async () => {
  const before = snapshot(), command = app.history.peekUndo();
  for (const level of ['simple', 'full'] as const) {
    bubbles.setLevel(level, false); await wait(); expect(bar().offsetHeight > 0, `${level} hid Story controls`);
    for (const [label, view] of [['Grid', 'grid'], ['Panels', 'panels'], ['Timeline', 'timeline'], ['Split', 'split']] as const) {
      button(label, bar()).click(); await wait(25); expect(board.currentView === view && button(label, bar()).getAttribute('aria-pressed') === 'true', `${label} not selected`);
    }
  }
  bubbles.setLevel('simple', false); board.setView('panels');
  expect(snapshot() === before && app.history.peekUndo() === command, 'view changes edited the document');
});
await check('Details and typed metadata survive card rebuilds without changing dialogue or timing', async () => {
  const details = card(0).querySelector<HTMLDetailsElement>('details')!; details.open = true; await wait(30);
  const camera = card(0).querySelector<HTMLInputElement>('[data-field=camera]')!; camera.focus(); camera.value = 'Wide, pan left'; camera.dispatchEvent(new Event('change')); camera.blur(); await wait();
  expect(app.board!.exposures[0]!.camera === 'Wide, pan left' && card(0).querySelector<HTMLDetailsElement>('details')!.open, 'metadata or open state lost');
  expect(app.history.peekUndo()?.label === 'Edit caption', 'caption edit lost its undo boundary');
});
await check('Header navigation and Play/Pause use the existing shared clock', async () => {
  button('New panel', bar()).click(); await wait(); app.goPanel(0); await wait();
  button('Next panel', bar()).click(); await wait(); expect(app.selection.includes(1), 'Next did not select panel 2');
  button('Previous panel', bar()).click(); await wait(); expect(app.selection.includes(0), 'Previous did not select panel 1');
  button('Play', bar()).click(); expect(app.playing && button('Pause', bar()).getAttribute('aria-pressed') === 'true', 'Play not synchronized');
  button('Pause', bar()).click(); expect(!app.playing, 'Pause not synchronized');
});
await check('Panel menu duplicates through one existing command and Undo restores the board', async () => {
  const count = app.board!.exposures.length; button('Panel 1 actions').click(); button('Duplicate panels', menu()).click(); await wait();
  expect(app.board!.exposures.length === count + 1, 'Duplicate did not add a panel'); app.undo(); await wait(); expect(app.board!.exposures.length === count, 'Undo did not restore panels');
});
await check('Share and Story help have consistent header entry points', () => {
  button('Share storyboard').click(); expect(shared === 1, 'Share not routed'); button('Story help').click(); expect(help === 'board', 'wrong manual anchor');
});
await check('Mode navigation and Story header stay inside the viewport with 44px touch actions', async () => {
  await wait();
  for (const selector of ['.bub-modes', '.bub-tools', '.board-bar']) {
    const r = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect(); expect(r.left >= -1 && r.right <= innerWidth + 1, `${selector} outside viewport: ${r.left}–${r.right}`);
  }
  expect(document.documentElement.scrollWidth <= innerWidth, 'body scrolls sideways');
  const visible = [...bar().querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.offsetParent);
  expect(visible.every((b) => b.getBoundingClientRect().height >= 43.9), 'header touch target smaller than 44px');
  expect(stage.clientHeight >= 60 && document.querySelector<HTMLElement>('.board-cards')!.clientHeight > 50, 'canvas or card area collapsed');
});
await check('Loading a project while Story is open restores storyboard editing ownership', async () => {
  const project = app.project, id = app.board!.id;
  project.activeLayer = project.comp.layers.find((l) => l.kind === 'drawings' && !l.guide)!.id;
  app.loadProject(project); await wait(); expect(project.activeLayer === id && app.drawing.id === app.board!.exposures[0]!.drawing, 'loaded project stayed on its animation drawing');
});
await check('Story exposes the selected panel count and restores its saved view', () => {
  board.update(); expect(document.querySelector('.board-info')!.getAttribute('aria-label')?.includes('selected'), 'Story selection context missing');
  board.setView('grid'); const host = document.createElement('div'); document.body.append(host); const reopened = new BoardPanel(app, host); expect(reopened.currentView === 'grid', 'Story did not restore its saved view'); host.remove(); board.setView('panels');
});

await check('Panels has a navigator and exactly one focused writing editor without horizontal form scrolling', async () => {
  board.setView('panels'); app.goPanel(0); await wait(); const editor = document.querySelector<HTMLElement>('.board-cards')!;
  expect(document.querySelectorAll('.story-panel-nav button').length === app.board!.exposures.length && document.querySelectorAll('.bcard:not([hidden])').length === 1, 'not one focused editor');
  expect(editor.scrollWidth <= editor.clientWidth + 1 && !card(0).hidden, 'editor scrolls sideways');
  const command = app.history.peekUndo(); button('Select story panel 2').click(); await wait();
  expect(card(0).hidden && !card(1).hidden && button('Select story panel 2').getAttribute('aria-current') === 'true' && app.history.peekUndo() === command, 'panel navigation edited the document or wrong editor');
});
await check('Navigator arrow keys change the shared panel clock and keep keyboard focus', async () => {
  app.goPanel(0); button('Select story panel 1').focus(); const command = app.history.peekUndo();
  button('Select story panel 1').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true})); await wait();
  expect(app.frame === app.board!.exposures[0]!.length && document.activeElement === button('Select story panel 2') && !card(1).hidden && app.history.peekUndo() === command, 'keyboard navigation escaped to frame stepping');
});
await check('Return in Action commits once and reveals/focuses the next panel without losing caption Undo', async () => {
  app.goPanel(0); const old = app.board!.exposures[0]!.action ?? ''; const field = card(0).querySelector<HTMLTextAreaElement>('[data-field=action]')!; field.focus(); field.value = 'Crosses the courtyard';
  field.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',bubbles:true,cancelable:true})); await wait();
  expect(app.board!.exposures[0]!.action === 'Crosses the courtyard' && !card(1).hidden && document.activeElement === card(1).querySelector('[data-field=action]'), 'Return lost caption or next-panel focus');
  (document.activeElement as HTMLElement).blur(); app.undo(); await wait(); expect((app.board!.exposures[0]!.action ?? '') === old, 'caption Undo failed');
});
await check('Selecting a panel resets the editor scroll and keeps its duration header reachable', async () => {
  const editor = document.querySelector<HTMLElement>('.board-cards')!; app.goPanel(1); editor.scrollTop = 300; button('Select story panel 1').focus(); button('Select story panel 1').click(); await wait();
  const header = card(0).querySelector('.bhead')!.getBoundingClientRect(), box = editor.getBoundingClientRect();
  expect(editor.scrollTop === 0 && header.top >= box.top - 1 && header.bottom <= box.bottom + 1, 'panel opens below its header '+JSON.stringify({scroll:editor.scrollTop,top:header.top,bottom:header.bottom,boxTop:box.top,boxBottom:box.bottom}));
});
await check('Navigator previews preserve portrait art proportions instead of stretching it', async () => {
  const d = app.project.drawing(app.board!.exposures[0]!.drawing), old = d.thumb, rev = d.thumbRev, preview = document.createElement('canvas'); preview.width = 80; preview.height = 160; const g = preview.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0,0,80,160); d.thumb = preview; d.thumbRev++; board.update(); await wait(180);
  const c = button('Select story panel 1').querySelector('canvas')!, ctx = c.getContext('2d')!, edge = ctx.getImageData(2,32,1,1).data, center = ctx.getImageData(48,32,1,1).data;
  expect(c.width === 96 && edge[0] === 255 && center[0] === 0, 'portrait art was stretched or preview missing'); d.thumb = old; d.thumbRev = rev + 2; board.update();
});
await check('The compact view picker switches the same views without editing Story data', () => {
  const select = document.querySelector<HTMLSelectElement>('.story-view-select')!, before = snapshot(), command = app.history.peekUndo();
  for (const view of ['grid','timeline','split','panels']) { select.value = view; select.dispatchEvent(new Event('change')); expect(board.currentView === view, 'compact picker diverged'); }
  expect(snapshot() === before && app.history.peekUndo() === command, 'compact picker edited document');
});
await check('A long panel list allocates thumbnails only around the viewport', async () => {
  const b = app.board!, saved = b.exposures; b.exposures = Array.from({length:80}, (_, i) => ({...saved[i % saved.length]!})); board.update(); await wait(200);
  const thumbnails = [...document.querySelectorAll<HTMLCanvasElement>('.story-panel-nav canvas')]; expect(thumbnails.length === 80 && thumbnails.filter(c => c.width > 0).length < 20, 'offscreen thumbnail pixels retained');
  b.exposures = saved; board.update(); app.goPanel(0); await wait();
});
await check('No uncaught browser errors', () => expect(!errors.length, errors.join('; ')));
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, board, bubbles };
