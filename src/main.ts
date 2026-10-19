import { setEffectCacheBudget } from './view/effects';
import { EffectsPanel } from './ui/effectspanel';
import { scrollArrows } from './ui/scrollarrows';
import { openBoardExport } from './ui/boardexport';
import './style.css';
import { AudioPlayback } from './audio';
import { AudioTracks } from './ui/audiotracks';
import { mediaPicker } from './ui/media';

// Tells the page's start-up watchdog (index.html) that the app code loaded.
(window as unknown as { __2dopeBooted?: boolean }).__2dopeBooted = true;
import { App, type Workspace } from './app';
import type { Tool } from './core/stroke';
import { saveMode, type DeviceMode } from './core/device';
import { buildPanel } from './ui/panel';
import { openStore } from './io/persist';
import { ExportUI } from './ui/exportdialog';
import { VideoExportUI } from './ui/videoexport';
import { ShareView } from './ui/share';
import { FileUI } from './ui/files';
import { Gallery } from './ui/gallery';
import { MotionPanel } from './ui/motion';
import { Splitter } from './ui/splitter';
import { NewProjectUI } from './ui/newdialog';
import { Quick } from './ui/quick';
import { LayerCards } from './ui/layercards';
import { FlipMode } from './ui/flipmode';
import { ReferenceWindow } from './ui/reference';
import { Bubbles } from './ui/bubbles';
import { TracksSheet } from './ui/sheet';
import { Strip } from './ui/strip';
import { XSheet } from './ui/xsheet';
import { applyIcons } from './ui/icons';
import { Sidebar } from './ui/sidebar';
import { drawRailState } from './ui/rails';
import { LayersPopover } from './ui/layerspop';
import { BoardPanel } from './ui/board';
import { ColorPanel } from './ui/colorpanel';
import { BrushLibrary } from './ui/brushlib';
import { showContextMenu } from './ui/contextmenu';
import { SHAPE_CHOICES } from './core/quickshape';
import { hasNewUpdates, openManual } from './ui/manual';

const $ = <T extends HTMLElement>(sel: string) => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e;
};

/** Run `extra` after an existing hook, so several parts of the UI can listen to one event. */
const chain = (prev: () => void, extra: () => void) => () => {
  prev();
  extra();
};

const app = new App($<HTMLCanvasElement>('#canvas'), $('#stage'));
// Dev-only handle for scripted checks from the console / browser tests.
if (import.meta.env.DEV) (window as unknown as { __2dope: App }).__2dope = app;

// Toolbar
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')];
// Full level's extra tools (Smudge, Select, Adjust): the same as their bubbles
const toolXButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool-x]')];
const planeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-plane]')];
const partButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-part-eye]')];
const rippleBtn = $<HTMLButtonElement>('#ripple-btn');
rippleBtn.addEventListener('click', () => app.setRipple(!app.ripple));
const syncTools = () => {
  rippleBtn.setAttribute('aria-pressed', String(app.ripple));
  for (const b of partButtons) b.setAttribute('aria-pressed', String(app.partVisible(b.dataset.partEye === 'fill' ? 'fill' : 'line')));
  const selectOn = app.tool === 'fill' && app.fillMode === 'lasso';
  for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === app.tool && !(b.dataset.tool === 'brush' && app.smudging) && !(b.dataset.tool === 'fill' && selectOn) && !app.adjusting));
  for (const b of toolXButtons) {
    const k = b.dataset.toolX;
    b.setAttribute('aria-pressed', String(k === 'smudge' ? app.smudging && app.tool === 'brush' : k === 'select' ? selectOn : !!app.adjusting));
  }
  for (const b of planeButtons) b.setAttribute('aria-pressed', String(b.dataset.plane === app.plane));
  const layer = app.project.layer;
  const plane = app.tool === 'fill' ? 'fill' : app.tool === 'pen' ? 'line' : app.plane;
  const selection = app.tool === 'fill' && app.fillMode === 'lasso';
  const path = app.editor.crumbs().map((c) => c.comp.name).join(' › ');
  const drawing = app.blankPage ? 'Blank page' : `Drawing ${app.drawing.num}`;
  const target = app.editingMask ? 'Mask' : selection ? 'Area selection' : plane === 'fill' ? 'Fill' : 'Line';
  const warning = layer.locked ? ' · Locked' : !layer.visible || !app.partVisible(plane) ? ' · Hidden' : '';
  // the simple screen says only where you paint (the comp path only inside a group)
  const simple = !document.body.classList.contains('ui-full');
  const inGroup = app.editor.crumbs().length > 1;
  paintTarget.textContent = app.project.isPlaceholder
    ? simple ? `New layer · ${target}` : `${path} › New layer on paint · ${target}`
    : simple ? `${inGroup ? `${path} › ` : ''}${layer.name} · ${target}${warning}` : `${path} › ${layer.name} · ${drawing} · ${target}${warning}`;
  paintTarget.title = `${paintTarget.textContent}. Open Layers to choose where you draw.`;
  paintTarget.setAttribute('aria-label', `Paint target: ${paintTarget.textContent}`);
  paintTarget.classList.toggle('fill-target', !selection && plane === 'fill' && !app.editingMask);
  paintTarget.classList.toggle('mask-target', app.editingMask);
};
const paintTarget = document.createElement('button');
paintTarget.type = 'button';
paintTarget.className = 'paint-target';
paintTarget.addEventListener('click', () => layerCards.toggle(paintTarget));
document.querySelector('#stage')?.append(paintTarget);

// QuickShape: after a snap, an Edit shape button (Procreate style) to switch the shape or keep the stroke
const shapeBtn = document.createElement('button');
shapeBtn.type = 'button';
shapeBtn.className = 'shape-pop';
shapeBtn.hidden = true;
shapeBtn.title = 'Edit shape: change what the stroke snapped to, or keep your own stroke';
document.querySelector('#stage')?.append(shapeBtn);
let shapeTimer = 0;
const syncShape = () => {
  const s = app.lastShape;
  const ok = !!s && app.shapeEditable;
  shapeBtn.hidden = !ok;
  clearTimeout(shapeTimer);
  if (!ok || !s) return;
  const label = s.choice === 'stroke' ? '✎ Your stroke' : (SHAPE_CHOICES.find((c) => c.id === (s.choice as string))?.label ?? s.choice);
  shapeBtn.textContent = `${label}  ·  Edit shape ▾`;
  // it waits a while, then gets out of the way
  shapeTimer = window.setTimeout(() => (shapeBtn.hidden = true), 8000);
};
app.onShapeChange = syncShape;
const openShapeMenu = (anchor: HTMLElement) => {
  if (!app.shapeEditable) return syncShape();
  clearTimeout(shapeTimer);
  const r = anchor.getBoundingClientRect();
  const cur = app.lastShape?.choice;
  showContextMenu(r.left, r.bottom + 4, [
    ...SHAPE_CHOICES.map((c) => ({ label: c.label, checked: cur === c.id, run: () => app.swapShape(c.id) })),
    { sep: true },
    { label: '✎ Keep my stroke', checked: cur === 'stroke', run: () => app.swapShape('stroke') },
    ...(app.lastShape?.rec.tool === 'pen' ? [{ sep: true } as const, { label: '◇ Edit points', run: () => { const id = app.lastShape?.rec.id; app.enterPointEdit(id); } }, { label: 'Points after hold', checked: app.pointsAfterHold, run: () => app.setPointsAfterHold(!app.pointsAfterHold) }, { label: 'New points straight', checked: app.straightDefault, run: () => app.setStraightDefault(!app.straightDefault) }] : []),
  ]);
};
shapeBtn.addEventListener('click', () => openShapeMenu(shapeBtn));
for (const b of partButtons) b.addEventListener('click', () => app.togglePart(b.dataset.partEye === 'fill' ? 'fill' : 'line'));
for (const b of planeButtons) b.addEventListener('click', () => app.setPlane(b.dataset.plane === 'fill' ? 'fill' : 'line'));
// tapping the tool you already use opens the brush library (Procreate style)
for (const b of toolButtons)
  b.addEventListener('click', () => {
    const t = b.dataset.tool as Tool;
    if (app.transforming) app.cancelTransform();
    if (t === 'brush' && app.smudging) app.setSmudging(false);
    else if (t === 'fill' && app.tool === 'fill' && app.fillMode === 'lasso') { app.selectMoves = false; app.setFillMode('tap'); }
    else if (t === app.tool && t !== 'fill') brushLib.toggle(b);
    else app.setTool(t);
  });
for (const b of toolXButtons)
  b.addEventListener('click', () => {
    if (b.dataset.toolX === 'smudge') app.setSmudging(true);
    else if (b.dataset.toolX === 'select') {
      app.setTool('fill');
      app.setFillMode('lasso');
      app.selectMoves = true;
      app.onToolChange();
    } else if (!app.adjusting) app.beginAdjust('hsb');
  });
app.onToolChange = syncTools;
syncTools();

const actions: Record<string, () => void> = {
  undo: () => app.undo(),
  redo: () => app.redo(),
  clear: () => app.clearFrame(),
  fit: () => app.fit(),
  actual: () => app.actualSize(),
  flip: () => app.flipView(),
  rotate0: () => app.resetRotation(),
  export: () => app.exportPNG(),
  hide: () => app.toggleUI(),
};
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  b.addEventListener('click', () => actions[b.dataset.action ?? '']?.());
}

const undoBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-action="undo"]')];
const redoBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-action="redo"]')];
app.history.onChange = () => {
  for (const b of undoBtns) b.disabled = !app.history.canUndo;
  for (const b of redoBtns) b.disabled = !app.history.canRedo;
};
app.history.onChange();
// an undo or another edit ends the Edit shape window
app.history.onChange = chain(app.history.onChange, () => {
  if (!shapeBtn.hidden && !app.shapeEditable) shapeBtn.hidden = true;
});

// Icons on every button that asks for one, the brush sidebar, and the colour circle
applyIcons();
const sidebar = new Sidebar(app, $('#sidebar'));
const eyedropBtn = $<HTMLButtonElement>('#eyedrop');
eyedropBtn.addEventListener('click', () => app.armEyedropper());
app.onEyedrop = () => {
  eyedropBtn.setAttribute('aria-pressed', String(app.eyedropArmed));
  document.body.classList.toggle('eyedropping', app.eyedropArmed);
};
app.onBrushChange = chain(app.onBrushChange, () => sidebar.update());
const colorChip = $<HTMLInputElement>('#color-chip');
const syncColor = () => {
  colorChip.value = app.color;
  colorChip.parentElement!.style.setProperty('--chip', app.color);
  // the FILL button's drop shows the colour you paint with
  document.documentElement.style.setProperty('--chip-fill', app.color);
};
colorChip.addEventListener('input', () => app.setColor(colorChip.value));
// the colour circle opens the colour panel (the system picker is one button inside it)
const colorPanel = new ColorPanel(app, colorChip);
colorChip.parentElement!.addEventListener('click', (e) => {
  e.preventDefault();
  colorPanel.toggle(colorChip.parentElement!);
});
app.onColorChange = chain(app.onColorChange, () => {
  syncColor();
  colorPanel.sync();
});
{
  // the same message at most once every few seconds, so a gesture can never flood the screen
  let last = '';
  let lastAt = 0;
  app.onNotice = (m) => {
    const now = Date.now();
    if (m === last && now - lastAt < 4000) return;
    last = m;
    lastAt = now;
    files?.toast(m, [], 4000);
  };
}
const layersPop = new LayersPopover(app);
const layersBtn = $<HTMLButtonElement>('#layers-btn');
layersBtn.addEventListener('click', () => layerCards.toggle(layersBtn));
app.openLayers = (anchor) => layerCards.toggle(anchor);
app.onToolChange = chain(app.onToolChange, () => layersPop.update());
syncColor();

const finger = $<HTMLInputElement>('#finger');
finger.addEventListener('change', () => (app.fingerPaint = finger.checked));

// Live input readout: useful while tuning pen feel on real devices.
const statsEl = $('#stats');
const viewEl = $('#viewinfo');
app.onStats = () => {
  const s = app.stats;
  statsEl.textContent = `${s.pointerType} · pressure ${s.pressure.toFixed(2)} · tilt ${s.tilt}° · ${s.hz} Hz · ×${s.coalesced.toFixed(1)} coalesced`;
};
setInterval(() => {
  viewEl.textContent = `${Math.round(app.view.zoom * 100)}% · ${Math.round(app.view.rot)}°${app.view.flipped ? ' · flipped' : ''}`;
}, 150);

// Side panel: Brush and X-sheet tabs (Shift+X switches)
buildPanel(app, $('#tab-brush'));

// Brush sections fold away. Tip and Paint start open; the choice is remembered.
{
  const KEY = '2dope.m1.fold';
  let saved: Record<string, boolean> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    // default folding
  }
  $('#tab-brush')
    .querySelectorAll('fieldset')
    .forEach((fs, i) => {
      const legend = fs.querySelector('legend');
      if (!legend) return;
      const title = legend.textContent ?? String(i);
      fs.classList.toggle('collapsed', saved[title] ?? !/^(tip|paint)/i.test(title));
      legend.addEventListener('click', () => {
        fs.classList.toggle('collapsed');
        saved[title] = fs.classList.contains('collapsed');
        try {
          localStorage.setItem(KEY, JSON.stringify(saved));
        } catch {
          // not persisted: fine
        }
      });
    });
}
const xsheet = new XSheet(app, $('#tab-xsheet'));
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];
const showTab = (name: 'brush' | 'xsheet') => {
  for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  $('#tab-brush').hidden = name !== 'brush';
  $('#tab-xsheet').hidden = name !== 'xsheet';
  xsheet.show(name === 'xsheet');
  try {
    localStorage.setItem('2dope.m1.tab', name);
  } catch {
    // not persisted: fine
  }
};
for (const t of tabs) t.addEventListener('click', () => showTab(t.dataset.tab === 'xsheet' ? 'xsheet' : 'brush'));
app.onToggleXSheet = () => {
  if (document.body.classList.contains('quick')) return;
  showTab($('#tab-xsheet').hidden ? 'xsheet' : 'brush');
  document.body.classList.add('panel-open');
};
try {
  if (localStorage.getItem('2dope.m1.tab') === 'xsheet') showTab('xsheet');
} catch {
  // default tab
}

// Narrow screens: the side panel is an overlay opened from the Panel button; tapping the canvas closes it.
const setPanel = (open: boolean) => {
  if (document.body.classList.contains('panel-open') === open) return;
  document.body.classList.toggle('panel-open', open);
  $('#panel-toggle').setAttribute('aria-expanded', String(open));
  setTimeout(() => app.refit(), 60);
};
const brushLib = new BrushLibrary(app, () => {
  setPanel(true);
  showTab('brush');
});
$('#panel-toggle').addEventListener('click', () => setPanel(!document.body.classList.contains('panel-open')));
$('#stage').addEventListener('pointerdown', () => app.workspace !== 'time' && setPanel(false), { capture: true });

const strip = new Strip(app, $('#strip'));
// Draw and Time: a touch-first handle bar on the timeline (closed / half / full, drag or swipe).
const sheet = new TracksSheet(app, $('.stage-col'), $('#strip'), () => setTimeout(() => app.refit(), 60));
drawRailState.onChange = () => { layersPop.update(); strip.update(); };
// Timing tools (holds, marks, onion settings, layer toggles) belong to the Time workspace
$('#tab-xsheet').prepend(strip.timingBar);
const motion = new MotionPanel(app, $('#motion'));
const board = new BoardPanel(app, $('#board'));
const audioPlayback = new AudioPlayback(app);
const audioTracks = new AudioTracks(app, audioPlayback, $('.stage-col'));
// In the tracks sheet, sounds are rows under the layers; their settings open in a floating card.
strip.audio = { active: () => sheet.active, sig: () => audioTracks.railSig(), rows: (t, x, c, w) => audioTracks.railRows(t, x, c, w) };
// Motion lists sounds as rows too (drag to move or trim), so the old audio lane is Board's only
motion.audio = { sig: () => audioTracks.railSig(), rows: (c, end) => audioTracks.motionRows(c, end) };
// Simple screen: the frame buttons join the tracks bar, so the timeline has one row of controls
{
  const placeNav = () => {
    const simple = !document.body.classList.contains('ui-full');
    const want = simple && sheet.active ? sheet.bar : strip.stripBar;
    if (strip.navRow.parentElement === want) return;
    if (want === sheet.bar) sheet.bar.insertBefore(strip.navRow, sheet.bar.querySelector('.spacer'));
    else strip.stripBar.prepend(strip.navRow);
  };
  new MutationObserver(placeNav).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  placeNav();
}
// Effects card (line boil...): from Motion's fx bubble and layer menu, and the layer cards
const effectsPanel = new EffectsPanel(app);
if (app.device.lite) setEffectCacheBudget(32 * 1024 * 1024);
app.openEffects = (id) => effectsPanel.show(id);
// Media (Procreate Dreams style): pictures, movies and sounds each become a track from frame 1
app.pickMedia = mediaPicker(app, audioTracks);
{
  const addMedia = document.createElement('button');
  addMedia.type = 'button';
  addMedia.className = 'tracks-add';
  addMedia.textContent = '+ Media';
  addMedia.title = 'Bring in a picture, movie or sound: each becomes its own track from frame 1';
  addMedia.addEventListener('pointerdown', (e) => e.stopPropagation());
  addMedia.addEventListener('click', (e) => { e.stopPropagation(); app.pickMedia?.(); });
  sheet.bar.insertBefore(addMedia, sheet.bar.querySelector('.spacer'));
}
board.setAudio(audioPlayback);
// the panel's dialogue as a subtitle under the picture (Board, and while playing with a board)
const subtitle = $('#subtitle');
const showSubtitle = () => {
  const b = app.board;
  let text = '';
  if (b && (app.workspace === 'board' || app.playing)) {
    const f = app.frame - b.start;
    let at = 0;
    for (const e of b.exposures) {
      if (f >= at && f < at + e.length) {
        text = e.dialogue ?? '';
        break;
      }
      at += e.length;
    }
  }
  subtitle.hidden = !text;
  subtitle.textContent = text;
};

// The handle between the canvas and the timeline; each workspace remembers its own height.
const splitter = new Splitter($('#splitter'), $('.stage-col'), () =>
  app.workspace === 'motion' ? { name: '--motion-h', min: 120, def: 230 } : app.workspace === 'board' ? { name: '--board-h', min: 160, def: 300 } : { name: '--track-h', min: 60, def: 112 },
);

// Workspaces: Draw, Time, Motion. The same project, arranged differently.
const wsButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-ws]')];
const WS_KEY = '2dope.m3.ws';
let lastTab: 'brush' | 'xsheet' = 'brush';
let prevWs: Workspace = 'draw';
// View-only preferences: no document changes, history entries or timing edits.
function syncFocus(): void {
  let prefs: { tools?: boolean; timeline?: boolean } = {};
  try { prefs = JSON.parse(localStorage.getItem(`2dope.focus.${app.workspace}`) ?? '{}') ?? {}; } catch { /* defaults */ }
  document.body.classList.toggle('tools-folded', prefs.tools === false);
  document.body.classList.toggle('timeline-folded', prefs.timeline === false && !TracksSheet.WORKSPACES.has(app.workspace));
  $('#focus-tools').setAttribute('aria-expanded', String(prefs.tools !== false && !document.body.classList.contains('bar-collapsed')));
  $('#focus-timeline').setAttribute('aria-expanded', String(prefs.timeline !== false));
  $('#focus-context').textContent = { draw: 'Draw · make your art', time: 'Time · adjust exposure', motion: 'Motion · composite and animate', board: 'Board · plan the story' }[app.workspace];
}
for (const part of ['tools', 'timeline'] as const) {
  $(`#focus-${part}`).addEventListener('click', () => {
    if (part === 'timeline' && sheet.active) {
      sheet.toggle();
      $('#focus-timeline').setAttribute('aria-expanded', String(sheet.current !== 'peek'));
      return;
    }
    // Tools: one button for both ways the tools can be put away (folded, or the whole bar hidden)
    if (part === 'tools' && document.body.classList.contains('bar-collapsed')) {
      setBar(false);
      document.body.classList.remove('tools-folded');
    } else document.body.classList.toggle(`${part}-folded`);
    const folded = document.body.classList.contains(`${part}-folded`);
    $(`#focus-${part}`).setAttribute('aria-expanded', String(!folded));
    if (part === 'tools' && folded) setPanel(false);
    try { localStorage.setItem(`2dope.focus.${app.workspace}`, JSON.stringify({ tools: !document.body.classList.contains('tools-folded'), timeline: !document.body.classList.contains('timeline-folded') })); } catch { /* optional */ }
    app.onToolChange(); // the bubbles stand in for folded tools at Full: measure them
    setTimeout(() => app.refit(), 60);
  });
}
syncFocus();
// set once the layer cards exist (applyWorkspace also runs at start-up, before them)
let closePopovers = (): void => {};
const applyWorkspace = () => {
  closePopovers();
  const w = app.workspace;
  document.body.classList.remove('ws-board', 'ws-draw', 'ws-time', 'ws-motion');
  document.body.classList.add(`ws-${w}`);
  for (const b of wsButtons) b.setAttribute('aria-pressed', String(b.dataset.ws === w));
  if (w === 'time') {
    if (prevWs !== 'time') lastTab = $('#tab-xsheet').hidden ? 'brush' : 'xsheet';
    showTab('xsheet');
    setPanel(true);
  } else if (w === 'draw') {
    if (prevWs === 'time') showTab(lastTab);
    setPanel(false);
  } else {
    setPanel(false);
  }
  syncFocus();
  prevWs = w;
  splitter.restore();
  document.body.classList.toggle('sheet-ws', sheet.active);
  sheet.restore();
  sheet.update();
  if (sheet.active) $('#focus-timeline').setAttribute('aria-expanded', String(sheet.current !== 'peek'));
  motion.update();
  strip.update();
  board.update();
  try {
    localStorage.setItem(WS_KEY, w);
  } catch {
    // not remembered
  }
  setTimeout(() => app.refit(), 60);
};
app.onWorkspaceChange = applyWorkspace;
for (const b of wsButtons)
  b.addEventListener('click', () => {
    // Quick Animate is a Draw view: picking another workspace leaves it
    if (document.body.classList.contains('quick') && b.dataset.ws !== 'draw') quick.set(false);
    app.setWorkspace(b.dataset.ws as Workspace);
  });
document.body.classList.add('ws-draw');
for (const b of wsButtons) b.setAttribute('aria-pressed', String(b.dataset.ws === 'draw'));
document.body.classList.toggle('sheet-ws', sheet.active);
sheet.restore();
sheet.update();

// Quick Animate (a lighter view of the same project)
let files: FileUI | null = null;
let exporter: ExportUI | null = null;
const videoExporter = new VideoExportUI(app, (message) => files?.toast(message), audioPlayback.bank);
// Share: the last mode (preview the movie, check it, make it, save or send it)
let onShareChange = (): void => {};
const share = new ShareView(app, {
  sounds: audioPlayback.bank,
  board: () => openBoardExport(app, (m) => files?.toast(m)),
  blender: () => void exportForBlender(),
  backup: () => void files?.exportProject(),
  onOpenChange: () => onShareChange(),
});
const quick = new Quick(app, $('#quickbar'), {
  exportPng: () => void app.exportPNG(),
  saveFile: () => void files?.exportProject(),
  exportSeq: () => exporter?.open(),
});
app.onToggleQuick = () => quick.toggle();
$('#enter-quick').addEventListener('click', () => quick.toggle());

// The ☰ button is always on screen (even in Quick Animate and with the interface hidden),
// so there is always a way back to every control.
const dock = $('#dock');
const menu = $('#menu');
const setMenu = (open: boolean) => {
  menu.hidden = !open;
  dock.setAttribute('aria-expanded', String(open));
};
dock.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !dock.contains(e.target as Node)) setMenu(false);
  },
  true,
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) setMenu(false);
});
menu.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b) setMenu(false);
});
const BAR_KEY = '2dope.m1.bar';
const setBar = (collapsed: boolean) => {
  document.body.classList.toggle('bar-collapsed', collapsed);
  $('#focus-tools').setAttribute('aria-expanded', String(!collapsed && !document.body.classList.contains('tools-folded')));
  app.onToolChange();
  try {
    localStorage.setItem(BAR_KEY, collapsed ? '1' : '0');
  } catch {
    // not persisted: fine
  }
  setTimeout(() => app.refit(), 80);
};
const toggleBar = () => setBar(!document.body.classList.contains('bar-collapsed'));
$('#bar-collapse').addEventListener('click', toggleBar);
try {
  if (localStorage.getItem(BAR_KEY) === '1') document.body.classList.add('bar-collapsed');
} catch {
  // default: toolbar shown
}
/** The manual and What's new; a dot on the menu button until new update notes are opened. */
function syncNews(): void {
  const news = hasNewUpdates();
  dock.classList.toggle('has-news', news);
  menu.querySelector('.news-btn')?.classList.toggle('has-news', news);
}
function showManual(at = 'overview'): void {
  setMenu(false);
  openManual(at, syncNews);
}
app.onOpenManual = () => showManual();
syncNews();
try {
  // first time on this device: point at the manual once
  if (!localStorage.getItem('2dope.manual.hinted')) {
    localStorage.setItem('2dope.manual.hinted', '1');
    setTimeout(() => files?.toast('New to 2Dope? The manual explains everything.', [{ label: 'Open manual', run: () => showManual() }], 9000), 1200);
  }
} catch {
  // no storage: no hint
}
const menuActions: Record<string, () => void> = {
  manual: () => showManual(),
  updates: () => showManual('updates'),
  quick: () => quick.toggle(),
  reference: () => reference.toggle(),
  panel: () => setPanel(!document.body.classList.contains('panel-open')),
  bar: toggleBar,
  // one place to make files: Share (the menu item and the Share mode open the same screen)
  'export-hub': () => share.show(),
  'export-seq': () => exporter?.open(),
  'export-video': () => videoExporter.open(),
  blender: () => void exportForBlender(),
};

/** Download a package Blender imports with the 2Dope add-on (it is inside the package). */
async function exportForBlender(): Promise<void> {
  const t = files?.toast('Preparing the Blender package…');
  try {
    const { exportBlender } = await import('./io/blenderpack');
    const r = await exportBlender(app.project, app.residency, (p) => {
      const s = t?.querySelector('span');
      if (s) s.textContent = `Preparing the Blender package… ${p.done} of ${p.total}`;
    });
    t?.remove();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.zip as BlobPart], { type: 'application/zip' }));
    const base =
      app.project.name
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'shot';
    a.download = `${base}-blender.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    files?.toast(`Saved ${a.download} (${r.images} images). In Blender: install 2dope_import.py from the zip once, then File > Import > 2Dope scene.`, [], 9000);
    for (const n of r.notes.slice(0, 3)) files?.toast(n);
  } catch (e) {
    t?.remove();
    files?.toast(`Could not make the Blender package: ${e instanceof Error ? e.message : String(e)}`);
  }
}
menu.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach((b) => b.addEventListener('click', () => menuActions[b.dataset.menu ?? '']?.()));

app.onFrameChange = chain(app.onFrameChange, () => {
  sheet.update();
  audioPlayback.sync();
  audioTracks.update();
  syncTools();
  board.update();
  showSubtitle();
  layersPop.update();
  strip.update();
  xsheet.update();
  quick.update();
  if (app.workspace === 'motion') motion.update();
});
app.onToolChange = chain(app.onToolChange, () => quick.update());
// The app zooms its own canvas; if Safari ever zooms the whole page (a double-tap that slipped
// through), snap it back: re-applying the viewport tag resets the page scale on iOS.
{
  const vv = window.visualViewport;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (vv && meta) {
    const base = meta.content;
    let timer = 0;
    vv.addEventListener('resize', () => {
      if (vv.scale <= 1.01) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        meta.content = `${base}, minimum-scale=1`;
        setTimeout(() => (meta.content = base), 60);
      }, 120);
    });
  }
}
// Draw's flipbook (Procreate Dreams style): frames as pages on tracks under the canvas; Draw's default view.
const flipMode = new FlipMode(app, $('#stage'));
// Reference (Procreate style): a floating window of pictures to draw from, or the whole canvas
const reference = new ReferenceWindow(app);
app.onFrameChange = chain(app.onFrameChange, () => reference.refresh());
// Bubbles: mode and tool bubbles plus a context bar; the level button steps clean / simple / full.
const layerCards = new LayerCards(app);
closePopovers = () => layerCards.close();
const bubbles = new Bubbles(app, $('#stage'), {
  layerCards: (anchor) => layerCards.toggle(anchor),
  story: {
    view: () => board.currentView,
    setView: (v) => board.setView(v),
    images: () => { if (!app.board) app.createBoard(); board.pickImages(); },
    exportBoard: () => openBoardExport(app, (m) => app.onNotice?.(m)),
  },
  motion: { group: () => motion.group(), split: () => motion.split() },
  editShape: (anchor) => openShapeMenu(anchor),
  flip: { on: () => flipMode.on, set: (on) => flipMode.set(on) },
  share: { open: () => share.open, show: () => share.show() },
  resetUi: () => resetUi(),
  brushLibrary: (anchor) => brushLib.toggle(anchor),
  reference: () => reference.toggle(),
  colorPanel: (anchor) => colorPanel.toggle(anchor),
  layers: (anchor) => layersPop.toggle(anchor),
  fit: () => app.refit(),
});
app.onToolChange = chain(app.onToolChange, () => bubbles.update());
app.onShapeChange = chain(app.onShapeChange, () => bubbles.update());
app.onFrameChange = chain(app.onFrameChange, () => { bubbles.update(); flipMode.update(); layerCards.update(); });
app.history.onChange = chain(app.history.onChange, () => layerCards.update());
flipMode.onChange = () => { layerCards.close(); bubbles.update(); strip.update(); setTimeout(() => app.refit(), 60); };
app.onToolChange = chain(app.onToolChange, () => flipMode.update());
// Motion (and anywhere else): open a drawing layer frame by frame in Draw's flipbook
app.onFlipKey = (e) => flipMode.onKey(e);
app.openFlipbook = (id) => {
  if (app.workspace !== 'draw') app.setWorkspace('draw');
  if (id) app.pickLayer(id);
  flipMode.set(true);
};
onShareChange = () => { layerCards.close(); bubbles.update(); };
// key selection in Motion changes what the context bar offers
{
  const edChange = app.editor.onChange;
  app.editor.onChange = () => { edChange(); bubbles.update(); };
}
app.onColorChange = chain(app.onColorChange, () => bubbles.update());
app.onWorkspaceChange = chain(app.onWorkspaceChange, () => { bubbles.update(); flipMode.update(); });
app.onBrushChange = chain(app.onBrushChange, () => quick.update());
app.history.onChange = chain(app.history.onChange, () => quick.update());
app.onThumbs = () => { strip.update(); flipMode.update(); layerCards.update(); };
// Inside a precomp: the toolbar shows where you are, and ☰ has a way back out.
const crumbBtn = $<HTMLButtonElement>('#crumb');
const backOut = $<HTMLButtonElement>('[data-menu="backout"]');
const showCrumb = () => {
  const crumbs = app.editor.crumbs();
  const inside = crumbs.length > 1;
  crumbBtn.hidden = !inside;
  backOut.hidden = !inside;
  if (inside)
    crumbBtn.textContent = `⤴ ${crumbs
      .map((c) => c.comp.name)
      .slice(1)
      .join(' › ')}`;
};
crumbBtn.addEventListener('click', () => app.editor.exit());
backOut.addEventListener('click', () => app.editor.exit());
app.onCompChanged = () => {
  board.update();
  strip.reset();
  xsheet.reset();
  motion.update();
  showCrumb();
};
app.onProjectLoaded = () => {
  warnIfTooBig();
  showCrumb();
  motion.update();
  strip.reset();
  xsheet.reset();
  quick.update();
};
// ---------------------------------------------------------------------------------------------
// Device profile: Lite (phones, older tablets) or Full. See core/device.ts.

const device = app.device;
document.body.classList.toggle('lite', device.lite);
document.body.classList.add(`form-${device.form}`);
const deviceInfo = $<HTMLElement>('#device-info');
const MB = 1024 * 1024;
deviceInfo.textContent =
  `${device.lite ? 'Lite' : 'Full'}: ${device.reasons.join('; ')}. ` +
  `Pages up to ${device.limits.maxShort}p, ${Math.round(device.limits.budget / MB)} MB for drawings, ${device.limits.onionMax} onion skins each side, ${device.limits.undoDepth} undo steps.`;
menu.querySelectorAll<HTMLButtonElement>('[data-device]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.device === device.mode));
  b.addEventListener('click', () => {
    const m = b.dataset.device as DeviceMode;
    saveMode(m);
    menu.querySelectorAll<HTMLButtonElement>('[data-device]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (m === device.mode) return;
    files?.toast('The device setting applies when 2Dope opens again.', [{ label: 'Reload now', run: () => location.reload() }], 8000);
  });
});

/** In Lite, a project bigger than this device's pages still opens, with a word of warning. */
function warnIfTooBig(): void {
  const p = app.project;
  if (!device.lite || p.width * p.height <= device.limits.maxPixels) return;
  files?.toast(`This project is ${p.width}×${p.height}, larger than Lite mode makes on this device. It may be slow or run out of memory; keep onion skins low.`, [], 9000);
}

// The strip takes height from the stage, so fit again now that the layout is final.
app.fit();

// Local autosave, versions, recovery. If browser storage is unavailable we still run (memory only).
const { store, persistent } = await openStore();
audioPlayback.bank.source = (path) => store.getAsset(path);
files = new FileUI(app, store, persistent);
app.onDocChanged = chain(app.onDocChanged, () => audioPlayback.invalidate());
app.onDocChanged = chain(app.onDocChanged, () => reference.refresh());
if (import.meta.env.DEV) (window as unknown as { __files: FileUI }).__files = files;
exporter = new ExportUI(app, $<HTMLDialogElement>('#export'), (msg) => files?.toast(msg));
const newUI = new NewProjectUI(app.device.lite ? app.device.limits : null);
const gallery = new Gallery(files, newUI, $('#gallery'));
// every new project starts with its setup (size, frame rate, name), the first one too
files.askNew = () => newUI.open(null);
const showGallery = () => void gallery.open();
$('#open-gallery').addEventListener('click', showGallery);
document.querySelectorAll('[data-file="projects"]').forEach((b) => b.addEventListener('click', showGallery));
document.querySelectorAll('[data-file="new"]').forEach((b) =>
  b.addEventListener('click', async () => {
    const opts = await newUI.open(null);
    if (opts) await files?.newProject(opts);
  }),
);
if (import.meta.env.DEV) (window as unknown as { __gallery: Gallery }).__gallery = gallery;
$('#export-seq').addEventListener('click', () => share.show());
$('#focus-export').addEventListener('click', () => share.show());
if (import.meta.env.DEV) (window as unknown as { __export: ExportUI }).__export = exporter;
await files.start();
if (!persistent) files.toast('Browser storage is unavailable here (private window?), so your work will not survive closing this tab. Export a .2dope file to keep it.');

/**
 * Hold the interface button: everything back to the starting layout (Simple), whatever got
 * folded, opened or switched on. The drawing, the project and undo are untouched.
 */
// bars that scroll sideways get arrows at their ends (tap to move along, hold to keep going)
for (const bar of document.querySelectorAll<HTMLElement>('.bub-ctx, .nav-row, .topbar, .focusbar, .layer-toggles, .xs-acts')) scrollArrows(bar);

function resetUi(): void {
  if (app.strokeActive) return;
  if (app.playing) app.togglePlay();
  share.close();
  quick.set(false);
  flipMode.set(true);
  layerCards.close();
  layersPop.close?.();
  colorPanel.close();
  brushLib.close();
  app.setMaskEditing(false);
  if (app.transforming) app.cancelTransform();
  app.setGuideEdit(false);
  setPanel(false);
  try {
    for (const ws of ['draw', 'time', 'motion', 'board']) localStorage.removeItem(`2dope.focus.${ws}`);
    localStorage.removeItem('2dope.focus');
  } catch { /* optional */ }
  document.body.classList.remove('tools-folded', 'timeline-folded', 'bar-collapsed', 'ui-hidden');
  if (sheet.active) sheet.set('half');
  syncFocus();
  setTimeout(() => app.fit(), 120);
  files?.toast('Screen reset to the starting layout. Your work is unchanged.');
}

