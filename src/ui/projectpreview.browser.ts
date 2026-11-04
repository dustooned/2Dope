import { App } from '../app';
import { Project } from '../core/project';
import { cameraLayer, compLayer, drawingsLayer, newComp } from '../core/comp';
import { staticProp } from '../core/anim';
import { MemoryStore } from '../io/persist';
import { FileUI } from './files';
import { Gallery } from './gallery';
import { NewProjectUI } from './newdialog';
import { projectPreview } from '../view/projectpreview';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const store = new MemoryStore(), files = new FileUI(app, store, false), gallery = new Gallery(files, new NewProjectUI(), document.querySelector<HTMLElement>('#gallery')!);
const wait = () => new Promise<void>(r => setTimeout(r, 80));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const paint = (c: HTMLCanvasElement, color: string, width = 64) => { const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, width, 64); };
const pixel = async (png: Uint8Array, x = 96, y = 54) => {
  const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  try { const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; c.getContext('2d')!.drawImage(bitmap, 0, 0); return [...c.getContext('2d')!.getImageData(x, y, 1, 1).data]; } finally { bitmap.close(); }
};
const near = (color: number[], rgb: number[]) => rgb.every((v, i) => Math.abs(color[i]! - v) < 4) && color[3] === 255;
let passed = 0, failed = 0, beforeChanges = 0, modified = 0, head = '';
const errors: string[] = []; addEventListener('error', e => errors.push(e.message));
async function check(name: string, test: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; } document.querySelector('#results')!.append(li); }
await check('Autosaved project pictures compose all layers at the current frame', async () => {
  await files.newProject({ name: 'Last viewed shot', width: 64, height: 64, frames: 12 }); app.setWorkspace('motion');
  const p = app.project, red = p.drawing(p.layer.exposures[0]!.drawing), green = p.newDrawing(), blue = p.newDrawing();
  paint(red.line, '#ff0000', 32); paint(green.line, '#00ff00', 32); paint(blue.line, '#0000ff'); for (const d of [red, green, blue]) d.rev++;
  p.layer.exposures = [{ drawing: red.id, length: 6 }, { drawing: green.id, length: 6 }];
  const bg = drawingsLayer(p.newId('L'), 'Blue background', [{ drawing: blue.id, length: 1 }], 64, 64); bg.still = true; bg.play = 'loop'; p.comp.layers.push(bg);
  app.setFrame(0); app.onDocChanged(); await files.autosaver.flush();
  const thumb = files.current!.thumb!;
  expect(near(await pixel(thumb, 69), [255, 0, 0]) && near(await pixel(thumb, 123), [0, 0, 255]), 'thumbnail lost foreground or background');
  beforeChanges = files.autosaver.changes; modified = files.current!.modified; head = (await store.getHead(files.current!.id))!.json;
});
await check('Opening Projects refreshes the last previewed frame without a document edit or modified-date change', async () => {
  app.setFrame(7); await gallery.open();
  const record = (await store.getProject(files.current!.id))!, thumb = record.thumb!;
  const left = await pixel(thumb, 69), right = await pixel(thumb, 123);
  expect(near(left, [0, 255, 0]) && near(right, [0, 0, 255]), `gallery kept the wrong frame: ${JSON.stringify({ left, right, frame: app.frame, end: app.compEnd })}`);
  expect(files.autosaver.changes === beforeChanges && record.modified === modified && (await store.getHead(record.id))!.json === head && !(await store.listVersions(record.id)).length, 'preview navigation edited the project or made a restore point');
  const image = document.querySelector<HTMLImageElement>(`.gcard[data-id="${record.id}"] img`)!; await image.decode(); expect(image.naturalWidth === 192 && image.naturalHeight === 108, 'project card does not show the saved thumbnail'); gallery.close();
});
await check('Motion thumbnails respect the camera-view choice without editor overlays', async () => {
  const p = app.project, camera = cameraLayer(p.newId('L'), p.comp); camera.zoom = staticProp(200); camera.transform.position = staticProp([16, 32]);
  app.editor.edit('Add preview camera', c => c.layers.unshift(camera)); app.editor.throughCamera = false;
  await files.savePreview(); expect(near(await pixel(files.current!.thumb!, 123), [0, 0, 255]), 'whole-shot view unexpectedly used camera');
  app.editor.throughCamera = true; await gallery.open(); expect(near(await pixel(files.current!.thumb!, 123), [0, 255, 0]), 'camera view was ignored'); gallery.close(); app.editor.throughCamera = false;
});
await check('A nested shot preview becomes the gallery picture instead of the main comp or active drawing', async () => {
  const p = app.project, comp = newComp(p.newId('c'), 'Detail shot', 64, 64, 12), yellow = p.newDrawing(); paint(yellow.line, '#ffcc00'); yellow.rev++;
  comp.layers.push(drawingsLayer(p.newId('L'), 'Yellow', [{ drawing: yellow.id, length: 12 }], 64, 64));
  const layer = compLayer(p.newId('L'), comp.name, comp, p.comp);
  app.editor.editProject('Add detail shot', () => { p.comps.set(comp.id, comp); p.comp.layers.push(layer); });
  app.editor.enter(layer.id); app.setFrame(4); await files.autosaver.flush();
  await gallery.open(); expect(near(await pixel(files.current!.thumb!), [255, 204, 0]), 'nested comp was not captured'); gallery.close();
});
await check('Story project cards include the storyboard being previewed', async () => {
  app.setWorkspace('board'); app.createBoard(); const board = app.board!, d = app.project.drawing(board.exposures[0]!.drawing); paint(d.line, '#9900cc'); d.rev++;
  app.onDocChanged(); await files.autosaver.flush(); await gallery.open();
  expect(near(await pixel(files.current!.thumb!), [153, 0, 204]), 'Story guide was omitted or composited over the wrong shot'); gallery.close();
});
await check('Closing Projects during thumbnail work cannot reopen the gallery afterwards', async () => {
  const save = files.savePreview.bind(files); let resume: () => void = () => {};
  files.savePreview = () => new Promise<void>(resolve => { resume = resolve; });
  try { const opening = gallery.open(); gallery.close(); resume(); await opening; expect(!gallery.visible && document.querySelector<HTMLElement>('#gallery')!.hidden, 'gallery reopened after cancellation'); }
  finally { files.savePreview = save; }
});
await check('A stale preview cannot overwrite a different project card', async () => {
  const p = app.project, before = files.current!.thumb;
  const pending = projectPreview(app); app.loadProject(new Project(32, 32));
  expect(await pending === null && files.current!.thumb === before && app.project !== p, 'stale preview succeeded after navigation');
  expect(!errors.length, errors.join('; '));
});
files.autosaver.stop();
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, files, gallery, store };
