import './style.css';

// Tells the page's start-up watchdog (index.html) that the app code loaded.
(window as unknown as { __2dopeBooted?: boolean }).__2dopeBooted = true;
import { App } from './app';
import type { Tool } from './core/stroke';
import { saveMode, type DeviceMode } from './core/device';
import { buildPanel } from './ui/panel';
import { openStore } from './io/persist';
import { ExportUI } from './ui/exportdialog';
import { FileUI } from './ui/files';
import { Gallery } from './ui/gallery';
import { MotionPanel } from './ui/motion';
import { Splitter } from './ui/splitter';
import { NewProjectUI } from './ui/newdialog';
import { Quick } from './ui/quick';
import { Strip } from './ui/strip';
import { XSheet } from './ui/xsheet';

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
const planeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-plane]')];
const partButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-part-eye]')];
const syncTools = () => {
  for (const b of partButtons) b.setAttribute('aria-pressed', String(app.partVisible(b.dataset.partEye === 'fill' ? 'fill' : 'line')));
  for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === app.tool));
  for (const b of planeButtons) b.setAttribute('aria-pressed', String(b.dataset.plane === app.plane));
};
for (const b of partButtons) b.addEventListener('click', () => app.togglePart(b.dataset.partEye === 'fill' ? 'fill' : 'line'));
for (const b of planeButtons) b.addEventListener('click', () => app.setPlane(b.dataset.plane === 'fill' ? 'fill' : 'line'));
for (const b of toolButtons) b.addEventListener('click', () => app.setTool(b.dataset.tool as Tool));
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

const undoBtn = $<HTMLButtonElement>('[data-action="undo"]');
const redoBtn = $<HTMLButtonElement>('[data-action="redo"]');
app.history.onChange = () => {
  undoBtn.disabled = !app.history.canUndo;
  redoBtn.disabled = !app.history.canRedo;
};
app.history.onChange();

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
const setPanel = (open: boolean) => document.body.classList.toggle('panel-open', open);
$('#panel-toggle').addEventListener('click', () => setPanel(!document.body.classList.contains('panel-open')));
$('#stage').addEventListener('pointerdown', () => app.workspace !== 'time' && setPanel(false), { capture: true });

const strip = new Strip(app, $('#strip'));
const motion = new MotionPanel(app, $('#motion'));

// The handle between the canvas and the timeline; each workspace remembers its own height.
const splitter = new Splitter($('#splitter'), $('.stage-col'), () => (app.workspace === 'motion' ? { name: '--motion-h', min: 120, def: 230 } : { name: '--track-h', min: 60, def: 96 }));

// Workspaces: Draw, Time, Motion. The same project, arranged differently.
const wsButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-ws]')];
const WS_KEY = '2dope.m3.ws';
let lastTab: 'brush' | 'xsheet' = 'brush';
let prevWs: 'draw' | 'time' | 'motion' = 'draw';
const applyWorkspace = () => {
  const w = app.workspace;
  document.body.classList.remove('ws-draw', 'ws-time', 'ws-motion');
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
  prevWs = w;
  splitter.restore();
  motion.update();
  strip.update();
  try {
    localStorage.setItem(WS_KEY, w);
  } catch {
    // not remembered
  }
  setTimeout(() => app.fit(), 60);
};
app.onWorkspaceChange = applyWorkspace;
for (const b of wsButtons)
  b.addEventListener('click', () => {
    // Quick Animate is a Draw view: picking another workspace leaves it
    if (document.body.classList.contains('quick') && b.dataset.ws !== 'draw') quick.set(false);
    app.setWorkspace(b.dataset.ws as 'draw' | 'time' | 'motion');
  });
document.body.classList.add('ws-draw');
for (const b of wsButtons) b.setAttribute('aria-pressed', String(b.dataset.ws === 'draw'));

// Quick Animate (a lighter view of the same project)
let files: FileUI | null = null;
let exporter: ExportUI | null = null;
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
  try {
    localStorage.setItem(BAR_KEY, collapsed ? '1' : '0');
  } catch {
    // not persisted: fine
  }
  setTimeout(() => app.fit(), 80);
};
const toggleBar = () => setBar(!document.body.classList.contains('bar-collapsed'));
$('#bar-collapse').addEventListener('click', toggleBar);
try {
  if (localStorage.getItem(BAR_KEY) === '1') document.body.classList.add('bar-collapsed');
} catch {
  // default: toolbar shown
}
const menuActions: Record<string, () => void> = {
  quick: () => quick.toggle(),
  panel: () => setPanel(!document.body.classList.contains('panel-open')),
  bar: toggleBar,
  'export-seq': () => exporter?.open(),
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

app.onFrameChange = () => {
  syncTools();
  strip.update();
  xsheet.update();
  quick.update();
  if (app.workspace === 'motion') motion.update();
};
app.onToolChange = chain(app.onToolChange, () => quick.update());
app.onBrushChange = chain(app.onBrushChange, () => quick.update());
app.history.onChange = chain(app.history.onChange, () => quick.update());
app.onThumbs = () => strip.update();
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
files = new FileUI(app, store, persistent);
if (import.meta.env.DEV) (window as unknown as { __files: FileUI }).__files = files;
exporter = new ExportUI(app, $<HTMLDialogElement>('#export'), (msg) => files?.toast(msg));
const newUI = new NewProjectUI(app.device.lite ? app.device.limits : null);
const gallery = new Gallery(files, newUI, $('#gallery'));
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
$('#export-seq').addEventListener('click', () => exporter?.open());
if (import.meta.env.DEV) (window as unknown as { __export: ExportUI }).__export = exporter;
await files.start();
if (!persistent) files.toast('Browser storage is unavailable here (private window?), so your work will not survive closing this tab. Export a .2dope file to keep it.');
