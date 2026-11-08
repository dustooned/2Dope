import { App } from '../app';
import { Project, paintDrawing } from '../core/project';
import { LINEAR, valueAt, type Prop, type Vec2 } from '../core/anim';
import { apply, cameraLayer, nullLayer, worldMatrix } from '../core/comp';
import { captureProject, loadProjectFile } from '../io/projectio';
import { minimumDrawingSchema, validateProjectFile } from '../io/schema';
import { importVectorDocument } from '../io/vectorimport';
import { vectorsToSvg } from '../io/svg';
import { captureArtwork, packArtwork, readArtwork } from '../io/artwork';
import { channels } from '../io/blender';
import { LayoutUI } from './layout';
import { GraphUI } from './graph';
import { VectorObjectsUI } from './vectorobjects';
import { MotionPanel } from './motion';
import { closeContextMenu } from './contextmenu';
const closeMenus = () => closeContextMenu();
export const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
export const layout = new LayoutUI(app), graph = new GraphUI(app), objects = new VectorObjectsUI(app), motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
app.openLayout = () => layout.show(); app.openVectorObjects = id => void objects.show(id); motion.openGraph = () => graph.show();
const notices: string[] = []; const errors: string[] = []; app.onNotice = m => { notices.push(m); }; addEventListener('error', e => errors.push(e.message)); addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const refresh = () => { document.body.className = `ui-simple ws-${app.workspace}`; motion.update(); }; app.editor.onChange = refresh; app.onWorkspaceChange = refresh; app.onFrameChange = refresh; app.history.onChange = refresh;
app.loadProject(new Project(320, 180)); app.project.comp.duration = 30; app.setWorkspace('motion'); app.editor.select(app.project.layer.id); refresh();
const wait = (ms = 65) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const button = (name: string) => { const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name); if (!b) throw new Error(`Missing ${name}`); return b; };
const field = <T extends HTMLElement>(name: string) => { const f = document.querySelector<T>(`[aria-label="${name}"]`); if (!f) throw new Error(`Missing ${name}`); return f; };
const change = (name: string, value: string) => { const input = field<HTMLInputElement | HTMLSelectElement>(name); input.value = value; input.dispatchEvent(new Event('change')); };
const fits = () => { const d = document.querySelector('dialog[open]') as HTMLDialogElement; expect(!!d && d.getBoundingClientRect().left >= -1 && d.getBoundingClientRect().right <= innerWidth + 1 && d.scrollWidth <= d.clientWidth + 1, 'editor overflows horizontally'); const footer = d.querySelector('footer')!; footer.scrollIntoView({ block: 'end' }); const b = footer.getBoundingClientRect(); expect(b.bottom <= innerHeight + 1 && b.top >= 0, 'footer unreachable'); };
let passed = 0, failed = 0; const check = async (name: string, fn: () => void | Promise<void>) => { const li = document.createElement('li'); try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message} ${(e as Error).stack}`; objects.close(); graph.close(); layout.close(); } document.querySelector('#results')!.append(li); };
const artwork = importVectorDocument('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><g><path d="M20 20 C20 60 60 60 60 20 L60 70 L20 70 Z" fill="#ff0000"/><rect x="80" y="20" width="30" height="50" fill="#00ff00"/></g></svg>');
app.drawing.vectors = artwork.strokes; app.drawing.rev++; const originalId = app.project.layer.id;
const curve = (): Prop<Vec2> => ({ value: [160, 90], keys: [{ f: 0, v: [160, 90], in: LINEAR, out: LINEAR, spatial: { in: [0, 0], out: [0, 90] } }, { f: 20, v: [260, 90], in: LINEAR, out: LINEAR, spatial: { in: [0, 90], out: [0, 0] } }] });
await check('Layout uses actual artwork bounds, commits one Undo and keeps footer reachable', async () => { app.history.clear(); const before = app.editor.layoutBox(app.editor.primary!).x; layout.show(); fits(); button('Align left').click(); await wait(150); expect(Math.abs(app.editor.layoutBox(app.editor.primary!).x) < .01 && app.history.peekUndo()?.label === 'Align layers', 'alignment failed ' + JSON.stringify({box:app.editor.layoutBox(app.editor.primary!),history:app.history.peekUndo()?.label,notice:notices.at(-1),status:document.querySelector('dialog [role=status]')?.textContent})); layout.close(); app.undo(); await wait(140); expect(Math.abs(app.editor.layoutBox(app.editor.primary!).x - before) < .01 && !app.history.canUndo, 'alignment Undo failed'); });
await check('Anchor centering preserves the current image under rotation and scale', () => { const l = app.editor.primary!; l.transform.scale.value = [140, 80]; l.transform.rotation.value = 20; const before = apply(worldMatrix(app.project.comp, l, 0), [20, 20]); expect(app.editor.centerAnchor(), 'no anchor edit'); const after = apply(worldMatrix(app.project.comp, app.editor.primary!, 0), [20, 20]); expect(Math.hypot(after[0] - before[0], after[1] - before[1]) < 1e-7, 'anchor moved artwork'); app.history.clear(); });
await check('Graph preview stays detached; Cancel discards numeric edits', () => { app.editor.primary!.transform.position = curve(); const before = JSON.stringify(app.project.comp.layers); graph.show(); fits(); change('End X', '280'); change('Timing preset', 'inOut'); expect(JSON.stringify(app.project.comp.layers) === before && !app.history.canUndo, 'preview changed project'); button('Cancel').click(); expect(JSON.stringify(app.project.comp.layers) === before, 'cancel changed keys'); });
await check('Graph applies values and timing once and Undo restores spatial handles', async () => { graph.show(); change('End X', '280'); change('Outgoing time %', '25'); change('Outgoing progress', '0'); button('Apply graph').click(); expect(app.editor.primary!.transform.position.keys[1]!.v[0] === 280 && app.history.peekUndo()?.label === 'Edit motion graph', 'graph Apply failed'); app.undo(); await wait(140); expect(app.editor.primary!.transform.position.keys[1]!.v[0] === 260 && !!app.editor.primary!.transform.position.keys[0]!.spatial && !app.history.canUndo, 'graph Undo failed'); });
await check('Graph refuses stale properties and unordered frames without overwriting the shot', () => { graph.show(); change('End frame', '1'); expect(field<HTMLInputElement>('End frame').value === '21', 'duplicate frame accepted'); app.editor.primary!.transform.position.keys[1]!.v = [270, 90]; button('Apply graph').click(); expect(!!document.querySelector('dialog[open]') && app.editor.primary!.transform.position.keys[1]!.v[0] === 270, 'stale Apply overwrote keys'); graph.close(); app.editor.primary!.transform.position = curve(); });
await check('Path handles change trajectory with one Undo and camera editing restores the prior view', async () => { const l = app.editor.primary!, before = JSON.stringify(l.transform.position); app.editor.setPathEditing(true); const h = apply(app.editor.pathMatrix(l), [160, 180]); expect(app.editor.gestureStart(h, 1), 'handle not picked'); app.editor.gestureMove([h[0] + 30, h[1] + 10]); app.editor.gestureEnd(); expect(JSON.stringify(app.editor.primary!.transform.position) !== before && app.history.peekUndo()?.label === 'Curve motion path', 'handle failed'); app.undo(); await wait(140); expect(JSON.stringify(app.editor.primary!.transform.position) === before && !app.history.canUndo, 'path Undo failed'); app.editor.setPathEditing(false); const cam = cameraLayer('cam', app.project.comp); cam.transform.position = curve(); app.project.comp.layers.push(cam); app.editor.select(cam.id); app.editor.throughCamera = true; app.editor.setPathEditing(true); expect(!app.editor.throughCamera, 'camera self view not disabled'); app.editor.setPathEditing(false); expect(app.editor.throughCamera, 'view not restored'); app.project.comp.layers = app.project.comp.layers.filter(x => x.id !== cam.id); app.editor.select(originalId); });
await check('Leaving Motion ends path editing without a stray transform in Draw or Story', () => { app.editor.setPathEditing(true); app.setWorkspace('board'); expect(!app.editor.pathEditing && !app.editor.dragging, 'path mode leaked into Story'); app.setWorkspace('draw'); expect(!app.editor.pathEditing, 'path mode leaked into Draw'); app.setWorkspace('motion'); app.editor.select(originalId); });
await check('Curved archives use reader 7; normal archives keep their older minimum', async () => { const saved = await captureProject(app.project, { mode: 'archive' }).settle(); expect(saved.file.schema === 7, 'missing curve version gate'); const p = loadProjectFile(validateProjectFile(saved.file)).project, restored = p.comp.layers.find(x => x.id === originalId)!; expect(valueAt(restored.transform.position, 10)[1] === 157.5, 'saved curve changed'); const copy = structuredClone(saved.file.comps); for (const c of Object.values(copy)) for (const l of c.layers) for (const k of l.transform.position.keys ?? []) delete k.spatial; expect(minimumDrawingSchema(saved.file.drawings, copy) === 5, 'ordinary vector project version changed'); const bad = structuredClone(saved.file); const layer = bad.comps[bad.main]!.layers.find(l => l.id === originalId)!; layer.transform.rotation.keys = [{ f: 0, v: 0, in: { interp: 'linear' }, out: { interp: 'linear' }, spatial: { in: [0, 0], out: [0, 1] } }]; expect((() => { try { validateProjectFile(bad); return false; } catch { return true; } })(), 'scalar spatial data accepted'); });
await check('Portable artwork retains curves and Blender channels match the shared clock', async () => { app.project.comp.asset = true; const source = await captureArtwork(app.project, app.project.comp.id, async () => null); delete app.project.comp.asset; const reopened = await readArtwork(packArtwork(source)); const keys = reopened.file.comps[reopened.file.main]!.layers.find(x => x.id === originalId)?.transform.position.keys ?? []; expect(keys.length === 2 && keys.some(k => !!k.spatial), 'asset dropped curves'); expect(minimumDrawingSchema(reopened.file.drawings, reopened.file.comps) === 7, `asset needs reader ${minimumDrawingSchema(reopened.file.drawings, reopened.file.comps)}, not 7`); const channelsOut = channels(app.editor.primary!.transform.position, ['position.x', 'position.y'], 3, 30); expect(channelsOut['position.y']!.keys![13]!.value === 157.5, 'Blender clock differs'); });
await check('Imported groups and exact curve geometry survive SVG export and reimport', () => { const r = importVectorDocument(vectorsToSvg(app.drawing.vectors, 320, 180)); expect(r.strokes.length === 2 && !!r.strokes[0]!.shape!.group && r.strokes[0]!.shape!.group === r.strokes[1]!.shape!.group && r.strokes[0]!.shape!.path.includes('C'), 'SVG lost grouping or curves'); });
await check('Vector preview edits nodes, fill and opacity without changing the document; Cancel discards them', async () => { app.setWorkspace('draw'); app.editor.select(originalId); app.history.clear(); const before = JSON.stringify(app.drawing.vectors); await objects.show(); fits(); change('Vector fill', '#0000ff80'); change('Object opacity %', '50'); change('Node X', '25'); expect(JSON.stringify(app.drawing.vectors) === before && !app.history.canUndo, 'vector preview changed source'); button('Cancel').click(); expect(JSON.stringify(app.drawing.vectors) === before, 'vector Cancel failed'); });
await check('Vector Apply retains alpha and curves, recomputes bounds and reverses once', async () => { const before = JSON.stringify(app.drawing.vectors); await objects.show(); change('Vector fill', '#0000ff80'); change('Object opacity %', '50'); change('Node X', '25'); button('Apply vectors').click(); expect(!document.querySelector('dialog[open]') && app.drawing.vectors[0]!.shape!.path.startsWith('M25') && app.drawing.vectors[0]!.shape!.fill === '#0000ff80', 'vector Apply failed'); const out = document.createElement('canvas'); out.width = 320; out.height = 180; paintDrawing(out.getContext('2d')!, app.drawing); const pixel = out.getContext('2d')!.getImageData(40, 60, 1, 1).data; expect(pixel[2]! > 200 && pixel[3]! >= 62 && pixel[3]! <= 65, 'vector alpha flattened'); app.undo(); await wait(140); expect(JSON.stringify(app.drawing.vectors) === before && !app.history.canUndo, 'vector Undo failed'); app.redo(); await wait(140); expect(app.drawing.vectors[0]!.shape!.fill === '#0000ff80', 'vector Redo failed'); });
await check('Grouped selection paints both paths; ungrouping is explicit', async () => { app.history.clear(); await objects.show(); const list = field<HTMLSelectElement>('Vector path list'); list.options[0]!.selected = true; list.options[1]!.selected = false; list.dispatchEvent(new Event('change')); expect(field<HTMLSelectElement>('Vector path list').selectedOptions.length === 2, 'group pick did not select both'); button('Ungroup selected paths').click(); change('Vector stroke', '#ffffff'); change('Stroke width', '2'); button('Apply vectors').click(); expect(app.drawing.vectors.every(v => !v.shape?.group && v.shape?.stroke === '#ffffff'), 'group paint or ungroup failed'); });
await check('Vector stale edits are refused and originals remain recoverable', async () => { await objects.show(); change('Vector fill', '#ffff00'); app.drawing.rev++; button('Apply vectors').click(); expect(!!document.querySelector('dialog[open]') && app.drawing.vectors[0]!.shape!.fill !== '#ffff00', 'stale vectors overwrote art'); objects.close(); });
await check('New precision editors share large touch controls and reachable footers', async () => { for (const show of [() => layout.show(), () => graph.show(), () => objects.show()]) { app.setWorkspace('motion'); app.editor.select(originalId); await show(); fits(); const d = document.querySelector('dialog[open]')!; expect([...d.querySelectorAll('footer button')].every(b => b.getBoundingClientRect().height >= 43), 'small footer targets'); objects.close(); graph.close(); layout.close(); } });
await check('Large composition save/reload and Undo preserve 250 layers, 500 keys and 200 paths', async () => { const p = new Project(320, 180); p.comp.duration = 500; p.drawing(p.layer.exposures[0]!.drawing!).vectors = Array.from({ length: 200 }, (_, i) => ({ ...structuredClone(artwork.strokes[i % 2]!), id: `v${i}` })); for (let i = 0; i < 249; i++) { const n = nullLayer(`null${i}`, `Anchor ${i}`, p.comp); p.comp.layers.push(n); } p.layer.transform.position = { value: [0, 0], keys: Array.from({ length: 500 }, (_, f) => ({ f, v: [f % 320, f % 180] as Vec2, in: LINEAR, out: LINEAR })) }; app.loadProject(p); app.setWorkspace('motion'); app.editor.select(p.layer.id); const start = performance.now(); app.editor.changePath(true); const saved = await captureProject(p, { mode: 'archive' }).settle(), restored = loadProjectFile(validateProjectFile(saved.file)).project; expect(restored.comp.layers.length === 250 && restored.layer.transform.position.keys.length === 500 && restored.drawing(restored.layer.exposures[0]!.drawing!).vectors.length === 200, 'large scene lost data'); app.undo(); await wait(140); expect(p.layer.transform.position.keys.every(k => !k.spatial), 'large scene Undo lost keys'); const elapsed = performance.now() - start; expect(elapsed < 10000, `large scene capture took ${elapsed.toFixed()}ms`); document.body.dataset.largeSceneMs = elapsed.toFixed(); app.loadProject(restored); app.setWorkspace('motion'); app.editor.select(restored.layer.id); app.editor.setPathEditing(true); app.requestRender(); await wait(); app.editor.setPathEditing(false); });
await check('Animate along a path: draw on the canvas, choose the time, one Undo, steady speed and turning that save', async () => {
  app.loadProject(new Project(320, 180)); app.project.comp.duration = 60; app.setWorkspace('motion'); refresh();
  const ed = app.editor, id = app.project.layer.id; ed.select(id); app.setFrame(6); app.history.clear(); refresh();
  const items = (motion as unknown as { animationItems(): { label?: string; run?: () => void; checked?: boolean }[] }).animationItems();
  const draw = items.find(i => i.label === 'Animate along a path…');
  expect(draw?.run, 'no Animate along a path item'); draw!.run!();
  expect(ed.drawingPath && /Draw a path/.test(document.querySelector('.motion-selection')?.textContent ?? ''), 'path drawing did not start');
  const m = ed.pathMatrix(ed.primary!), at = (x: number, y: number) => apply(m, [x, y]) as Vec2;
  expect(ed.gestureStart(at(20, 150), 1), 'canvas did not take the path');
  for (let x = 20; x <= 300; x += 10) ed.gestureMove(at(x, 150 - Math.sin((x - 20) / 45) * 60));
  ed.gestureEnd(); await wait(80);
  expect(!ed.drawingPath && !!document.querySelector('dialog[open]'), 'no options dialog after drawing');
  change('Travel time', '1.5');
  (document.querySelector<HTMLInputElement>('dialog[open] input[aria-label="Turn to face the way it travels"]')!).click();
  button('Animate').click(); await wait(120);
  const pos = ed.primary!.transform.position, fps = app.project.comp.fps;
  expect(pos.keys[0]!.f === 6 && pos.keys.at(-1)!.f === 6 + Math.round(1.5 * fps) && pos.even === true && ed.primary!.transform.orient === true, 'path keys wrong ' + JSON.stringify({ first: pos.keys[0]?.f, last: pos.keys.at(-1)?.f, even: pos.even, orient: ed.primary!.transform.orient }));
  const end = pos.keys.at(-1)!.v; expect(Math.hypot(end[0] - 300, end[1] - (150 - Math.sin(280 / 45) * 60)) < 2, 'path does not end where it was drawn');
  expect(app.history.peekUndo()?.label === 'Animate along path', 'not one Undo step: ' + app.history.peekUndo()?.label);
  const step: number[] = []; for (let f = 7; f <= pos.keys.at(-1)!.f; f++) { const a = valueAt(pos, f - 1), b = valueAt(pos, f); step.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
  expect(Math.max(...step) / Math.min(...step) < 1.1, 'speed is not steady');
  const turn = (f: number) => { const w = worldMatrix(app.project.comp, ed.primary!, f); return Math.atan2(w[1], w[0]) * 180 / Math.PI; };
  expect(Math.abs(turn(8)) > 20 && Math.abs(turn(8) - turn(20)) > 20, 'layer does not turn along the path');
  const saved = await captureProject(app.project, { mode: 'archive' }).settle(); expect(saved.file.schema === 9, 'path project does not need reader 9');
  const back = loadProjectFile(validateProjectFile(saved.file)).project.comp.layers.find(x => x.id === id)!;
  expect(back.transform.orient && back.transform.position.even && JSON.stringify(valueAt(back.transform.position, 15)) === JSON.stringify(valueAt(pos, 15)), 'reopened path differs');
  const bake = channels(pos, ['position.x', 'position.y'], 0); const baked = bake['position.x']!.keys!.find(k => k.frame === 15); expect(!!baked && Math.abs(baked.value - valueAt(pos, 15)[0]) < 1e-9, 'Blender bake ignores even speed');
  app.undo(); await wait(140);
  expect(!ed.primary!.transform.position.keys.length && !ed.primary!.transform.orient, 'Undo did not restore the layer');
  ed.setDrawingPath(true); expect(ed.drawingPath, 'second start');
  (document.querySelector<HTMLElement>('#canvas') ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(!ed.drawingPath && !ed.pathStroke, 'Escape did not cancel drawing the path');
});
await check('Animate along a path: a tap on a line drawn with Vector on another layer becomes the route', async () => {
  app.loadProject(new Project(320, 180)); app.project.comp.duration = 60; app.setWorkspace('motion'); refresh();
  const p = app.project, guideId = p.layer.id;
  // the route: a pen line on the first layer's drawing
  const pts = Array.from({ length: 30 }, (_, i) => ({ x: 30 + i * 9, y: 140 - i * 3, pressure: 1, tiltX: 0, tiltY: 0, t: i * 10 }));
  p.drawing(p.layer.exposures[0]!.drawing!).vectors = [{ id: 'route', tool: 'pen', brush: structuredClone(app.brush), color: '#000000', seed: 1, points: pts }];
  app.editor.addLayer('drawings'); refresh();
  const ed = app.editor, mover = ed.primary!; expect(mover.id !== guideId, 'no second layer');
  app.setFrame(0); app.history.clear();
  ed.setDrawingPath(true);
  const route = apply(ed.view(), apply(worldMatrix(p.comp, p.comp.layers.find(l => l.id === guideId)!, 0), [pts[10]!.x, pts[10]!.y])) as Vec2;
  expect(ed.gestureStart([route[0] + 3, route[1] + 2], 1), 'tap not taken'); ed.gestureEnd(); await wait(80);
  expect(!!document.querySelector('dialog[open]'), 'tapping the line did not open the path options');
  button('Animate').click(); await wait(120);
  const pos = ed.layer(mover.id)!.transform.position, inv = ed.pathMatrix(ed.layer(mover.id)!);
  const end = apply(inv, pos.keys.at(-1)!.v), want = apply(ed.view(), apply(worldMatrix(p.comp, p.comp.layers.find(l => l.id === guideId)!, 0), [pts.at(-1)!.x, pts.at(-1)!.y]));
  expect(pos.keys.length >= 2 && Math.hypot(end[0] - want[0], end[1] - want[1]) < 1.5, 'route does not follow the tapped line ' + JSON.stringify({ end, want }));
  ed.setDrawingPath(true); ed.gestureStart([5, 5], 1); ed.gestureEnd(); await wait(40);
  expect(ed.drawingPath && notices.at(-1)?.includes('No vector line there'), 'an empty tap did not explain itself');
  ed.setDrawingPath(false);
});
await check('Pick whip: drag to a layer row or its artwork to parent, to a line to follow it; loops, same-layer lines, Esc and empty drops change nothing', async () => {
  app.loadProject(new Project(320, 180)); app.project.comp.duration = 60; app.setWorkspace('motion'); refresh();
  const p = app.project, ed = app.editor, bId = p.layer.id;
  p.layer.name = 'Road';
  const pts = Array.from({ length: 25 }, (_, i) => ({ x: 40 + i * 10, y: 120 - i * 2, pressure: 1, tiltX: 0, tiltY: 0, t: i * 10 }));
  p.drawing(p.layer.exposures[0]!.drawing!).vectors = [{ id: 'road', tool: 'pen', brush: structuredClone(app.brush), color: '#000000', seed: 1, points: pts }];
  ed.addLayer('drawings'); const aId = ed.primary!.id; ed.layer(aId)!.name = 'Car'; app.setFrame(0); app.history.clear(); refresh(); await wait(60);
  const whip = (id: string) => document.querySelector<HTMLButtonElement>(`#motion .mrow.layer[data-layer="${id}"] .lwhip`)!;
  // the first of these drawing points that is really on screen over the canvas (small screens hide some under panels)
  const shownOnCanvas = (layerId: string, list: { x: number; y: number }[], avoidLine = false) => {
    for (const pt of list) { const c = onCanvas(layerId, pt.x, pt.y); if (document.elementFromPoint(c[0], c[1]) === app.canvasElement && (!avoidLine || !ed.lineAt(app.stageAt(c[0], c[1]), 18 / app.view.zoom))) return c; }
    return null;
  };
  // a layer's row when it is on screen, otherwise its artwork on the canvas (what a student would drag to)
  const layerDrop = (id: string) => { const r = rowPoint(id), u = document.elementFromPoint(r[0], r[1]); if (u?.closest(`[data-layer="${id}"]`)) return r; const grid = []; for (let y = 60; y < 140; y += 4) for (let x = 30; x < 300; x += 6) grid.push({ x, y }); for (const g of grid) { const c = onCanvas(id, g.x, g.y); if (document.elementFromPoint(c[0], c[1]) === app.canvasElement && ed.hitLayer(app.stageAt(c[0], c[1]), { allowLocked: true, accept: l => l.id === id }) && !ed.lineAt(app.stageAt(c[0], c[1]), 18 / app.view.zoom)) return c; } return r; };
  const onCanvas = (layerId: string, x: number, y: number) => { const s = apply(ed.view(), apply(worldMatrix(p.comp, ed.layer(layerId)!, 0), [x, y])); const q = app.view.docToScreen(s[0], s[1]), r = app.canvasElement.getBoundingClientRect(); return [r.left + q.x, r.top + q.y] as Vec2; };
  // a point on a layer's row that is on screen together with the dragged handle
  const rowPoint = (id: string) => { const n = document.querySelector<HTMLElement>(`#motion .mrow.layer[data-layer="${id}"] .lname`)!; const r = n.getBoundingClientRect(); return [r.left + Math.min(20, r.width / 2), r.top + r.height / 2] as Vec2; };
  const label = () => document.querySelector('.whip-label')?.textContent ?? '';
  const drag = async (id: string, target: Vec2 | (() => Vec2), opts: { escape?: boolean } = {}) => {
    // like a student: both rows folded and on screen before dragging between them
    ed.select(id); ed.open.clear(); refresh(); await wait(30);
    document.querySelector(`#motion .mrow.layer[data-layer="${bId}"]`)?.scrollIntoView({ block: 'center' });
    const h = whip(id); expect(h, `no whip on ${id}`); h.scrollIntoView({ block: 'nearest' });
    // measure the drop point after scrolling (the list may move); the handle last, so it is current
    const to = typeof target === 'function' ? target() : target; const r = h.getBoundingClientRect(); const from: Vec2 = [r.left + r.width / 2, r.top + r.height / 2]; let seen = '';
    const ev = (type: string, at: Vec2) => h.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: at[0], clientY: at[1] }));
    ev('pointerdown', from); ev('pointermove', [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]); ev('pointermove', to); seen = label();
    if (opts.escape) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ev('pointerup', to); await wait(60); return seen;
  };
  // parent by dropping on the other layer's row
  let seen = await drag(aId, () => layerDrop(bId));
  expect(seen === 'Parent to Road' && ed.layer(aId)!.parent === bId && app.history.peekUndo()?.label === 'Parent layer', 'row drop: ' + JSON.stringify({ v: [innerWidth, innerHeight], c: (() => { const r = app.canvasElement.getBoundingClientRect(); return [r.top|0, r.height|0]; })(), m: (() => { const r = document.querySelector('#motion')!.getBoundingClientRect(); return [r.top|0, r.height|0]; })(), u: (() => { const c = onCanvas(bId, 160, 90); const e = document.elementFromPoint(c[0], c[1]); return [c[1]|0, e ? e.tagName + '.' + e.className : null]; })() }) + JSON.stringify({ seen, parent: ed.layer(aId)!.parent, at: rowPoint(bId), under: (() => { const [x, y] = rowPoint(bId); const u = document.elementFromPoint(x, y); return u ? `${u.tagName}.${u.className}` : null; })(), view: [innerWidth, innerHeight], canvas: (() => { const r = app.canvasElement.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })(), motion: (() => { const r = document.querySelector('#motion')!.getBoundingClientRect(); return [r.top, r.height]; })(), page: onCanvas(bId, 160, 90), at160: (() => { const c = onCanvas(bId, 160, 90); const u = document.elementFromPoint(c[0], c[1]); return u ? `${u.tagName}.${u.className}` : null; })() }));
  expect(!document.querySelector('.whip-line') && !document.querySelector('.whip-label'), 'whip line left on screen');
  app.undo(); await wait(120); expect(!ed.layer(aId)!.parent, 'Undo did not unparent'); refresh(); await wait(40);
  // a loop is refused: Road parented to Car, then Car whipped onto Road
  ed.setParentOf(bId, aId); refresh(); await wait(40);
  await drag(aId, () => layerDrop(bId));
  expect(!ed.layer(aId)!.parent && notices.at(-1)?.includes('loop'), 'a parent loop was not refused');
  ed.setParentOf(bId, null); refresh(); await wait(40);
  // Esc during the drag and an empty drop change nothing
  const before = JSON.stringify(p.comp.layers);
  await drag(aId, () => layerDrop(bId), { escape: true });
  await drag(aId, [4, innerHeight - 4]);
  expect(JSON.stringify(p.comp.layers) === before && !document.querySelector('.whip-line'), 'Esc or an empty drop changed the shot');
  // drop on the road line: follow it
  seen = await drag(aId, () => shownOnCanvas(bId, [pts[12]!, ...pts]) ?? onCanvas(bId, pts[12]!.x, pts[12]!.y));
  expect(seen === 'Follow this line' && !!document.querySelector('dialog[open]'), 'line drop did not offer to follow: ' + seen);
  button('Animate').click(); await wait(120);
  const pos = ed.layer(aId)!.transform.position; expect(pos.keys.length >= 2 && Math.abs(apply(ed.pathMatrix(ed.layer(aId)!), pos.keys.at(-1)!.v)[0] - apply(ed.view(), apply(worldMatrix(p.comp, ed.layer(bId)!, 0), [pts.at(-1)!.x, pts.at(-1)!.y]))[0]) < 1.5, 'Car does not follow the road');
  // a line inside the dragged layer itself is explained, not used
  p.drawing(ed.layer(aId)!.kind === 'drawings' ? (ed.layer(aId) as { exposures: { drawing: string }[] }).exposures[0]!.drawing : '').vectors = [{ id: 'own', tool: 'pen', brush: structuredClone(app.brush), color: '#000000', seed: 1, points: pts.map(q => ({ ...q, y: q.y + 40 })) }];
  ed.layer(bId)!.visible = false; refresh(); app.setFrame(0); await wait(40);
  const own = valueAt(ed.layer(aId)!.transform.position, 0);
  const ownLine = pts.map(q => ({ x: q.x, y: q.y + 40 }));
  seen = await drag(aId, () => shownOnCanvas(aId, [ownLine[5]!, ...ownLine]) ?? onCanvas(aId, ownLine[5]!.x, ownLine[5]!.y));
  expect(seen === 'This line is part of the same layer' && notices.at(-1)?.includes('Cut to layer') && JSON.stringify(valueAt(ed.layer(aId)!.transform.position, 0)) === JSON.stringify(own), 'same-layer line was not explained: ' + seen);
  ed.layer(bId)!.visible = true; refresh(); await wait(40);
  // a tap opens the same choices as a menu
  ed.select(aId); refresh(); await wait(450); whip(aId).click(); await wait(40);
  const menu = [...document.querySelectorAll('.ctx-menu button, .ctxmenu button, [role=menu] button')].map(b => b.textContent ?? '');
  expect(menu.some(t => t.includes('Parent to')) && menu.some(t => t.includes('Animate along a path')), 'tap menu missing: ' + JSON.stringify(menu));
  closeMenus();
  expect(getComputedStyle(whip(aId)).touchAction === 'none' && whip(aId).getBoundingClientRect().width >= 26 && !whip(bId), 'whip is not touch ready, or shows on an unselected layer');
});
await check('No uncaught browser errors', () => expect(!errors.length, errors.join('; ')));
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
