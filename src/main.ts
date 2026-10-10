import './style.css';
import { App } from './app';
import type { Tool } from './core/stroke';
import { buildPanel } from './ui/panel';
import { Strip } from './ui/strip';

const $ = <T extends HTMLElement>(sel: string) => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e;
};

const app = new App($<HTMLCanvasElement>('#canvas'), $('#stage'));
// Dev-only handle for scripted checks from the console / browser tests.
if (import.meta.env.DEV) (window as unknown as { __2dope: App }).__2dope = app;

// Toolbar
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')];
const planeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-plane]')];
const syncTools = () => {
  for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === app.tool));
  for (const b of planeButtons) b.setAttribute('aria-pressed', String(b.dataset.plane === app.plane));
};
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

buildPanel(app, $('#panel'));

const strip = new Strip(app, $('#strip'));
app.onFrameChange = () => strip.update();
// The strip takes height from the stage, so fit again now that the layout is final.
app.fit();
