/** Layers in Move assets: the chosen artwork's own layers first, the shot's tracks one tap away. Real App, Assets and Layers. */
import { App } from '../app';
import { Project } from '../core/project';
import { ArtworkAssetsUI } from './artworkassets';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { LayerCards } from './layercards';

const keys = ['2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view'];
const saved = keys.map((k) => localStorage.getItem(k));
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage); app.loadProject(new Project(128, 128)); app.setWorkspace('draw');
const flip = new FlipMode(app, stage);
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh());
const ui = new ArtworkAssetsUI(app, document.querySelector<HTMLElement>('.painting-header')!);
const cards = new LayerCards(app);
app.editAssetSource = (comp, layer) => ui.openSource(comp, layer);
function refresh() { painting.update(); ui.update(); cards.update(); }
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.editor.onChange = refresh; app.history.onChange = refresh;
const settle = () => new Promise<void>((r) => setTimeout(r, 120));
const panel = () => document.querySelector<HTMLElement>('.layercards')!;
const names = () => [...panel().querySelectorAll('.lc-card .lc-name')].map((n) => n.textContent);
const backButton = () => panel().querySelector<HTMLButtonElement>('.lc-back');
let passed = 0, failed = 0;
function check(name: string, ok: boolean, info?: unknown) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}${ok || info === undefined ? '' : ' ' + JSON.stringify(info)}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
try {
  // an artwork with two layers, placed in the shot
  const shot = app.project.activeComp;
  const id = ui.assets.create('Tree')!;
  app.addDrawLayer(); await settle();
  const source = app.project.comp, sourceLayers = source.layers.filter((l) => l.kind === 'drawings').map((l) => l.name);
  ui.assets.done(); await settle();
  ui.assets.place(id); await settle();
  check('Placing the artwork selects it in Move assets', app.arrangingAssets && app.placedAsset?.comp === id && app.project.activeComp === shot);
  cards.toggle(canvas); await settle();
  check('Layers shows the artwork’s own layers, not the shot’s tracks', names().join() === [...sourceLayers].reverse().join() || names().join() === sourceLayers.join(), { cards: names(), source: sourceLayers });
  check('Layers names the artwork and offers the shot tracks', panel().getAttribute('aria-label') === 'Layers' && !!backButton()?.textContent?.includes('Shot tracks') && !!panel().querySelector('[aria-label="Layers of Tree"]'));
  check('Nothing to add or merge to the shot from the artwork view', !panel().querySelector('[aria-label="New layer"]'));
  backButton()!.click(); await settle();
  check('Shot tracks shows the shot’s layers with the artwork as one group', names().includes('Tree') && !names().includes(sourceLayers[0]!), names());
  check('A button goes back to the artwork’s layers', !!backButton()?.textContent?.includes('Layers of Tree'));
  backButton()!.click(); await settle();
  const target = [...panel().querySelectorAll<HTMLElement>('.lc-card')].find((c) => c.querySelector('.lc-name')?.textContent === sourceLayers[0])!;
  const targetId = target.dataset.id;
  target.click(); await settle();
  check('Tapping a layer draws on it inside the artwork source', ui.assets.editing && app.project.activeComp === id && app.project.activeLayer === targetId && app.workspace === 'draw' && panel().hidden);
  ui.assets.done(); await settle();
  check('Done returns to the shot', app.project.activeComp === shot && !ui.assets.editing);
  app.setArrangeAssets(false); await settle();
  if (panel().hidden) cards.toggle(canvas); await settle();
  check('Outside Move assets Layers shows the shot as before', names().includes('Tree') && !backButton(), names());
} catch (e) { check(String(e), false); }
keys.forEach((k, i) => saved[i] === null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[i]!));
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
