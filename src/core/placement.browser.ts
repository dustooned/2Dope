/** App pointer routing/cancellation checks, using real Canvas and dispatched input events. */
import { App } from '../app';
import { ArtworkAssets } from './assets';
import { Project } from './project';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(128,128)); app.setWorkspace('animate');
const assets = new ArtworkAssets(app), id = assets.create('Prop')!;
const art = app.drawing, g = art.line.getContext('2d')!;
g.fillStyle = '#164cba'; g.fillRect(30,40,50,30); art.rev++;
assets.place(id);
const source = () => app.project.comps.get(id)!;
const instance = () => app.project.comp.layers.find(l => l.kind === 'comp')!;
const pos = () => JSON.stringify(instance().transform.position);
let passed = 0, failed = 0;
function check(name: string, ok: boolean) {
  const row = document.createElement('li'); row.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`;
  document.querySelector('#results')!.append(row); if (ok) passed++; else failed++;
}
function event(type: string, point: [number,number], pointerType = 'mouse', pointerId = 1, target: EventTarget = canvas) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(...point);
  target.dispatchEvent(new PointerEvent(type, {bubbles:true, cancelable:true, pointerType, pointerId,
    clientX:r.left+p.x, clientY:r.top+p.y, button:0, buttons:type === 'pointerup' || type === 'pointercancel' ? 0 : 1, pressure:.5}));
}
try {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  check('New placement enters arrangement with its linked instance selected', app.arrangingAssets && app.placedAsset?.comp === id);
  app.history.clear(); const before = pos();
  event('pointerdown',[50,55]); event('pointerup',[50,55]);
  check('A canvas tap selects without drawing or an undo entry', app.placedAsset?.comp === id && !app.history.canUndo && art.rev === 1);
  event('pointerdown',[50,55]); event('pointermove',[65,65]); event('pointerup',[65,65], 'mouse',1,window);
  check('Mouse release outside the canvas commits one move and releases busy state', pos() !== before && app.history.canUndo && !app.strokeActive);
  app.history.undo(); check('One undo restores the entire movement', pos() === before && !app.history.canUndo);
  event('pointerdown',[50,55], 'pen',2); event('pointermove',[70,70], 'pen',2); event('pointercancel',[70,70], 'pen',2);
  check('Pen cancellation restores placement and releases busy state', pos() === before && !app.strokeActive && !app.history.canUndo);
  app.history.push({label:'Earlier edit',do() {},undo() {}});
  event('pointerdown',[50,55], 'touch',3); event('pointermove',[70,65], 'touch',3);
  event('pointerdown',[90,90], 'touch',4);
  check('A second finger cancels asset movement before pinch navigation', pos() === before && !app.strokeActive);
  event('pointerup',[70,65], 'touch',3); event('pointerup',[90,90], 'touch',4);
  await Promise.resolve();
  check('Switching a moved finger to pinch does not undo an earlier edit', app.history.canUndo);
  app.history.clear();
  app.setArrangeAssets(false);
  check('Done leaves the source pixels, linked instance and lock intact', !app.arrangingAssets && instance().locked && source().layers.length === 1 && art.rev === 1);
  app.setArrangeAssets(true,instance().id); const corner = app.editor.corners(instance())[0]!;
  event('pointerdown',corner); event('pointermove',[corner[0]-12,corner[1]-12]); event('pointerup',[corner[0]-12,corner[1]-12]);
  check('Resident artwork resizes with a content pivot and one history step', instance().transform.scale.value[0] !== 100 && app.history.canUndo);
  const transform = JSON.stringify(instance().transform);
  const captured = await captureProject(app.project,{mode:'archive'}).settle();
  const reopened = loadProjectFile(parseProjectFile(stringifyProjectFile(captured.file))).project;
  check('Transforms and shared source references survive validated capture/reload', JSON.stringify(reopened.comp.layers.find(l => l.kind === 'comp')!.transform) === transform && reopened.comps.get(id)?.asset === true);
  app.flipbook = true; app.nextFrame();
  check('Stepping past the shot in arrangement does not create a blank drawing page', !app.blankPage && app.arrangingAssets);
  app.setWorkspace('draw'); check('Changing workspace leaves arrangement mode and the canvas idle', !app.arrangingAssets && !app.strokeActive);
  app.setWorkspace('animate'); app.setArrangeAssets(true); app.loadProject(new Project(128,128));
  check('Opening another project clears arrangement selection and state', !app.arrangingAssets && !app.placedAsset && !app.editor.selected.length);
} catch (e) { check(String(e),false); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
