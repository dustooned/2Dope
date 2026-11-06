import { App } from '../app';
import { staticProp } from '../core/anim';
import { compLayer, drawingsLayer, newComp } from '../core/comp';
import { effectPreview, newEffect } from '../core/effects';
import { Project, planeCanvas } from '../core/project';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { importVectorDocument } from '../io/vectorimport';
import { vectorsToSvg } from '../io/svg';
import { planBlender } from '../io/blender';
import { SoundBank } from '../io/sound';
import { decodePicture, mediaPicker } from './media';
import { EffectsPanel } from './effectspanel';
import { MotionPanel } from './motion';
import { ShareView } from './share';
import { drawComp, releaseScratch } from '../view/composite';
import { setFxPreview } from '../view/effects';
import { transformVector } from '../core/vectorstyle';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage), motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!), effects = new EffectsPanel(app);
app.openEffects = (id) => effects.show(id);
const changed = app.editor.onChange; app.editor.onChange = () => { changed(); effects.follow(); };
const notices: string[] = [], errors: string[] = [];
app.onNotice = (m) => notices.push(m);
addEventListener('error', (e) => errors.push(e.message));
const wait = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));
const blank = (w = 64, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const pixel = (c: HTMLCanvasElement, x = 32, y = 32) => [...c.getContext('2d')!.getImageData(x, y, 1, 1).data];
const render = (p: Project, scale = 1, exporting = true) => { const c = blank(64 * scale), g = c.getContext('2d')!; g.scale(scale, scale); drawComp(g, p, p.comp, 0, { export: exporting, camera: false }); return c; };
const button = (text: string, root: ParentNode = document) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text); if (!b) throw new Error(`Missing ${text}`); return b; };
let passed = 0, failed = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) {
  const li = document.createElement('li');
  try { await test(); passed++; li.textContent = `PASS: ${name}`; }
  catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; }
  document.querySelector('#results')!.append(li); releaseScratch(); effectPreview.clear();
}
const expect = (ok: unknown, why: string) => { if (!ok) throw new Error(why); };
const fresh = () => { effects.close(); app.loadProject(new Project(64, 64)); app.setWorkspace('motion'); setFxPreview('full'); motion.update(); return app.project; };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(8 8)"><path d="M0 0H48V48H0ZM12 12V36H36V12Z" fill="#fa2030" fill-rule="evenodd"/><circle cx="24" cy="24" r="6" fill="#2040ff" fill-opacity=".5"/></g></svg>';
await check('SVG retains filled paths, a hole, a transformed group and transparent colour', () => {
  const p = fresh(); app.importVectors('paths.svg', importVectorDocument(svg));
  const c = render(p);
  expect(pixel(c, 10, 10)[0] === 250 && pixel(c, 10, 10)[3] === 255, 'fill or transform lost');
  expect(pixel(c, 22, 22)[3] === 0, 'evenodd hole lost');
  expect(Math.abs(pixel(c)[3]! - 128) <= 1 && pixel(c)[2]! > 245, 'translucent blue lost');
  expect(app.drawing.vectors.length === 2 && app.history.peekUndo()?.label === 'Import vectors', 'import history missing');
});
await check('Vector import is one Undo step and Redo restores its curves', async () => {
  const count = app.project.comp.layers.length, original = app.drawing.vectors[0]!.shape!.path;
  app.undo(); await wait(); expect(app.project.comp.layers.length === count - 1, 'Undo did not remove the object');
  app.redo(); await wait(); expect(app.project.comp.layers.length === count, 'Redo did not restore the layer');
  const layer = app.project.comp.layers.find((l) => l.name === 'paths')!;
  app.focusLayer(layer.id); expect(app.drawing.vectors[0]?.shape?.path === original, 'Redo changed the curves');
});
await check('Imported paths survive archive capture, reload and residency at schema 5', async () => {
  const p = app.project, before = pixel(render(p), 10, 10);
  const saved = await captureProject(p, { mode: 'archive' }).settle();
  expect(saved.file.schema === 5, 'paths were saved for an older reader');
  const restored = loadProjectFile(parseProjectFile(stringifyProjectFile(saved.file))).project;
  app.assets = async (key) => saved.assets.get(key) ?? null; app.loadProject(restored);
  await Promise.all([...restored.drawings.values()].map((d) => app.residency.pin(d)));
  expect(pixel(render(restored), 10, 10).join() === before.join(), 'reload changed the image');
  for (const d of restored.drawings.values()) app.residency.unpin(d);
});
await check('Nonuniform selection transforms preserve scalable vector paths and SVG re-export', () => {
  const doc = importVectorDocument(svg), v = doc.strokes[0]!, path = v.shape!.path;
  const moved = transformVector(v, [2, 0, 0, 1, 12, 0], 1.4);
  expect(moved.shape!.path === path && moved.shape!.matrix[0] === 2 && moved.shape!.matrix[4] === 28, 'path was rasterized or transform lost');
  const output = vectorsToSvg([moved], 160, 64);
  expect(output.includes('fill-rule="evenodd"') && output.includes('matrix(2 0 0 1 28 8)'), 'SVG export lost object paint or transform');
});
await check('Rasterize is reversible and preserves pixels', async () => {
  const p = fresh(); app.importVectors('paths.svg', importVectorDocument(svg));
  const before = pixel(render(p), 10, 10);
  expect(app.rasterizeImportedVectors() && app.drawing.vectors.length === 0, 'no conversion');
  expect(pixel(render(p), 10, 10).join() === before.join(), 'conversion changed paint');
  app.undo(); await wait(); expect(app.drawing.vectors.length === 2 && !!app.drawing.vectors[0]!.shape, 'Undo lost paths');
  app.redo(); await wait(); expect(app.drawing.vectors.length === 0 && pixel(render(p), 10, 10).join() === before.join(), 'Redo changed pixels');
});
await check('SVG inline styles, CSS classes, local use and cubic curves import without inserting source markup', () => {
  const doc = importVectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.paint {fill:rgb(0,255,0)}</style><defs><path id="p" d="M0 0C0 32 32 32 32 0Z"/></defs><use href="#p" x="16" y="16" class="paint"/></svg>');
  expect(doc.strokes.length === 1 && doc.strokes[0]!.shape!.fill === '#00ff00ff' && doc.strokes[0]!.shape!.path.includes('C'), 'CSS, use or curves were lost');
  expect(!document.querySelector('#p'), 'source markup escaped into the page');
});
await check('Unsupported SVG appearances produce a useful error instead of a damaged import', () => {
  for (const content of ['<text>Hello</text>', '<image href="https://example.invalid/pic.png"/>', '<rect width="64" height="64" fill="url(#g)"/>', '<script>alert(1)</script>']) {
    let message = ''; try { importVectorDocument(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${content}</svg>`); } catch (e) { message = String(e); }
    expect(message.includes('SVG'), `unsupported object accepted: ${content}`);
  }
});
await check('Simple EPS paths preserve colour, position and scale as vectors', () => {
  const p = fresh(), doc = importVectorDocument('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 64 64\n1 0 0 setrgbcolor\n8 8 moveto 24 8 lineto 24 24 lineto 8 24 lineto closepath fill\nshowpage', true);
  app.importVectors('shape.eps', doc);
  expect(pixel(render(p), 12, 48)[0] === 255 && pixel(render(p), 12, 48)[3] === 255 && pixel(render(p), 12, 12)[3] === 0, 'EPS y-axis or colour incorrect');
});

const png = blank(); const pg = png.getContext('2d')!;
pg.fillStyle = '#00ff00'; pg.fillRect(8, 8, 16, 16); pg.fillStyle = '#0000ff80'; pg.fillRect(32, 8, 16, 16);
const pngBlob = await new Promise<Blob>((r) => png.toBlob((b) => r(b!), 'image/png'));
await check('Actual PNG file decoding/import preserves empty and semitransparent pixels', async () => {
  const p = fresh(), picture = await decodePicture(pngBlob);
  try { app.importPicture('alpha.png', picture.source, picture.width, picture.height); } finally { picture.close(); }
  const c = render(p); expect(pixel(c, 2, 2)[3] === 0 && pixel(c, 12, 12)[1] === 255 && Math.abs(pixel(c, 36, 12)[3]! - 128) <= 1, 'alpha changed on import');
});
await check('PNG alpha survives archive save, load, residency and final composite', async () => {
  const saved = await captureProject(app.project, { mode: 'archive' }).settle();
  const p = loadProjectFile(parseProjectFile(stringifyProjectFile(saved.file))).project;
  app.assets = async (key) => saved.assets.get(key) ?? null; app.loadProject(p);
  await Promise.all([...p.drawings.values()].map((d) => app.residency.pin(d)));
  const c = render(p); expect(pixel(c, 2, 2)[3] === 0 && Math.abs(pixel(c, 36, 12)[3]! - 128) <= 1, 'saved PNG became opaque');
  for (const d of p.drawings.values()) app.residency.unpin(d);
});
await check('HTML image fallback reads PNG alpha when bitmap decoding fails', async () => {
  const bitmap = window.createImageBitmap; window.createImageBitmap = async () => { throw new Error('Test bitmap failure'); };
  try {
    const decoded = await decodePicture(pngBlob), c = blank(); c.getContext('2d')!.drawImage(decoded.source, 0, 0); decoded.close();
    expect(pixel(c, 2, 2)[3] === 0 && Math.abs(pixel(c, 36, 12)[3]! - 128) <= 1, 'fallback flattened transparency');
  } finally { window.createImageBitmap = bitmap; }
});
await check('Transparency grid changes the canvas display without changing artwork or export', async () => {
  const p = fresh(); app.fit(); await wait(); const before = pixel(render(p), 2, 2);
  app.setCanvasView({ transparency: true }); await wait(120);
  const pt = app.view.docToScreen(2, 2), dpr = canvas.width / canvas.getBoundingClientRect().width, x = Math.round(pt.x * dpr), y = Math.round(pt.y * dpr);
  expect(pixel(canvas, x, y)[0]! < 250, 'checkerboard is not displayed');
  expect(pixel(render(p), 2, 2).join() === before.join() && !app.history.canUndo, 'view change edited/exported the checkerboard');
  app.setCanvasView({ transparency: false });
});

function adjustment(opacity: number) {
  const p = new Project(64, 64), d = p.drawing(p.layer.exposures[0]!.drawing);
  d.line.getContext('2d')!.fillStyle = '#ff000080'; d.line.getContext('2d')!.fillRect(8, 8, 48, 48);
  const a = drawingsLayer('adj', 'Adjustment', [{ drawing: p.newDrawing().id, length: 1 }], 64, 64);
  a.adjust = true; a.transform.opacity = staticProp(opacity); a.effects = [{ ...newEffect('blur', 'blur', 1), amount: 0 }]; p.comp.layers.unshift(a);
  return { p, a, d };
}
await check('Adjustment opacity 0/25/50/100 never doubles translucent pixels', () => {
  for (const amount of [0, 25, 50, 100]) {
    const { p } = adjustment(amount); const px = pixel(render(p));
    expect(Math.abs(px[3]! - 128) <= 2 && px[0]! > 250, `${amount}% alpha became ${px[3]}`);
  }
});
await check('Adjustment effects targeted at Colour or Ink run once on the flattened composite', () => {
  const { p, a } = adjustment(100); a.effects![0]!.target = 'fill'; a.effects![0]!.amount = 6;
  expect(pixel(render(p), 5, 32)[3]! > 0, 'Colour-targeted adjustment did not blur');
  effectPreview.set(a.id, [{ ...a.effects![0]!, target: 'line', amount: 0 }]);
  expect(Math.abs(pixel(render(p))[3]! - 128) <= 1, 'live preview differed from commit');
});
await check('An adjustment includes the comp background exactly once', () => {
  const { p, a, d } = adjustment(100); d.line.getContext('2d')!.clearRect(0, 0, 64, 64); p.comp.background = '#808080';
  a.effects = [{ ...newEffect('threshold', 'threshold', 1), amount: 200 }];
  const px = pixel(render(p)); expect(px[0] === 0 && px[3] === 255, `background skipped adjustment: ${px}`);
});
await check('Group effects render after internal effects/adjustments, before instance transforms', () => {
  const { p } = adjustment(50), inner = p.comp; p.comps.delete(inner.id); inner.id = 'nested'; p.comps.set(inner.id, inner);
  const outer = newComp('c1', 'Shot', 64, 64, 12), group = compLayer('group', 'Grouped artwork', inner, outer);
  group.effects = [{ ...newEffect('blur', 'groupblur', 1), amount: 6 }]; outer.layers = [group]; p.comps.set(outer.id, outer); p.main = p.activeComp = outer.id;
  const c = render(p); expect(pixel(c, 5, 32)[3]! > 0 && Math.abs(pixel(c)[3]! - 128) <= 2, 'group effects missing or doubled');
  const job = planBlender(p, 'Group effects').renders.find((r) => r.image.startsWith('r:c1:group:'))!;
  const baked = blank(); drawComp(baked.getContext('2d')!, p, job.comp, job.frame, { export: true });
  expect(pixel(baked, 5, 32).join() === pixel(c, 5, 32).join(), 'Blender bake lost the group effect');
  group.transform.position = staticProp([40, 32]);
  expect(pixel(render(p), 5, 32)[3]! < pixel(c, 5, 32)[3]!, 'effect did not follow group transform');
  app.loadProject(p); app.setWorkspace('motion'); app.editor.select(group.id); motion.update();
});
await check('Motion, Share and the downloaded PNG agree on nested and adjustment effects', async () => {
  const group = app.editor.primary!;
  const nestedAdjustment = app.project.comps.get('nested')!.layers[0]!;
  nestedAdjustment.effects![0]!.amount = 4;
  group.transform.position = staticProp([32, 32]);
  app.editor.select(null);
  app.setCanvasView({ transparency: false });
  app.fit(); app.requestRender(); await wait(160);
  const motionPixels = [6, 24].map(x => {
    const pt = app.view.docToScreen(x, 30), ratio = canvas.width / canvas.getBoundingClientRect().width;
    return pixel(canvas, Math.floor(pt.x * ratio), Math.floor(pt.y * ratio));
  });
  const share = new ShareView(app, { sounds: new SoundBank(() => true), backup() {}, onOpenChange() {} });
  share.show('picture');
  try {
    const background = [...document.querySelectorAll<HTMLSelectElement>('.share-settings select')].find(s => [...s.options].some(o => o.value === 'transparent'))!;
    background.value = 'white';
    background.dispatchEvent(new Event('change'));
    await wait(200);
    const preview = document.querySelector<HTMLCanvasElement>('.share-canvas')!;
    const shares = [6, 24].map(x => pixel(preview, Math.floor(x * preview.width / 64), Math.floor(30 * preview.height / 64)));
    document.querySelector<HTMLButtonElement>('.share-go')!.click();
    let save: HTMLAnchorElement | null = null;
    for (let i = 0; i < 100 && !save; i++) { await wait(); save = document.querySelector<HTMLAnchorElement>('.share-save'); }
    expect(save, 'PNG download missing');
    const png = await createImageBitmap(await (await fetch(save!.href)).blob());
    const decoded = blank(png.width, png.height);
    decoded.getContext('2d')!.drawImage(png, 0, 0);
    png.close();
    const close = (a: number[], b: number[]) => a.every((n, i) => Math.abs(n - b[i]!) <= 10);
    for (const [i, x] of [6, 24].entries()) {
      const exported = pixel(decoded, Math.floor(x * decoded.width / 64), Math.floor(30 * decoded.height / 64));
      expect(close(exported, shares[i]!) && close(exported, motionPixels[i]!), `at ${x}: Motion ${motionPixels[i]}, Share ${shares[i]}, PNG ${exported}`);
      expect(exported[0]! >= 250 && exported[1]! < (i === 0 ? 250 : 136) && exported[1]! > (i === 0 ? 145 : 119), `unexpected effect output at ${x}: ${exported}`);
    }
  } finally {
    share.close();
    app.editor.select(group.id);
  }
});
await check('Effects card opens the selected group, filters effects and commits one group effect', () => {
  const l = app.editor.primary!; effects.show(l.id);
  const panel = document.querySelector<HTMLElement>('.fxpanel')!;
  expect(!panel.hidden && panel.textContent!.includes('Grouped artwork'), 'group card did not open');
  button('+ Add effect', panel).click();
  const search = panel.querySelector<HTMLInputElement>('.fx-search')!; search.value = 'posterize'; search.dispatchEvent(new Event('input'));
  const visible = [...panel.querySelectorAll<HTMLButtonElement>('.fx-add button')].filter((b) => !b.hidden);
  expect(visible.length === 1 && visible[0]!.textContent!.includes('Posterize'), 'effect search did not narrow choices'); visible[0]!.click();
  expect(app.editor.primary!.effects?.length === 2 && app.editor.primary!.effects![1]!.target === 'layer', 'effect targeted a different layer');
  expect(panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent === '+ Add effect' && !!panel.querySelector('.fx-add-hint'), 'Add closed or inline hints are missing');
});
await check('Group effect animation, Undo and file round-trip keep the same target', async () => {
  const l = app.editor.primary!, fx = l.effects![1]!;
  app.editor.keyEffectSetting(l.id, fx.id, 'amount', true);
  expect(app.editor.rowsOf(app.editor.layer(l.id)!).includes(`fx:${fx.id}:amount`), 'keyed group effect missing from Motion');
  app.undo(); await wait(); expect(!app.editor.layer(l.id)!.effects![1]!.keys, 'Undo did not remove effect key');
  const saved = await captureProject(app.project).settle();
  expect(parseProjectFile(stringifyProjectFile(saved.file)).comps.c1!.layers[0]!.effects?.length === 2, 'group effects lost on save');
});
await check('Motion search finds groups and Animated reveals only keyed properties', () => {
  effects.close(); const l = app.editor.primary!; app.editor.toggleKey(l.id, 'position'); motion.update();
  const search = document.querySelector<HTMLInputElement>('.motion-search')!;
  search.value = 'not-a-layer'; search.dispatchEvent(new Event('input')); expect(!document.querySelector('.mrow.layer'), 'search did not filter');
  search.value = 'grouped'; search.dispatchEvent(new Event('input')); expect(document.querySelectorAll('.mrow.layer').length === 1, 'search did not recover group');
  button('Animated').click(); expect(!!document.querySelector('[data-prop="position"]') && !document.querySelector('[data-prop="rotation"]'), 'Animated includes unkeyed properties');
  button('Motion tools').click(); expect(document.querySelector('.context-menu')?.textContent?.includes('Wiggle') || document.body.textContent?.includes('Smooth keys…'), 'motion assistants unavailable');
});
await check('Real media picker accepts an SVG file and creates vector artwork', async () => {
  fresh(); const click = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = () => {};
  try { mediaPicker(app, { import: async () => {} } as unknown as Parameters<typeof mediaPicker>[1])(); } finally { HTMLInputElement.prototype.click = click; }
  const input = [...document.querySelectorAll<HTMLInputElement>('input[type=file]')].find((e) => e.accept.includes('.eps'))!;
  const data = new DataTransfer(); data.items.add(new File([svg], 'picker.svg', { type: 'image/svg+xml' })); input.files = data.files; input.dispatchEvent(new Event('change'));
  for (let i = 0; i < 40 && !app.project.comp.layers.some((l) => l.name === 'picker'); i++) await wait();
  expect(app.drawing.vectors.length === 2 && app.project.comp.layers.some((l) => l.name === 'picker'), `picker failed: ${notices.at(-1)}`);
});
await check('Effects Add enforces the saved stack limit and routes contextual help', () => {
  const p = fresh(), id = p.layer.id;
  p.layer.effects = Array.from({ length: 16 }, (_, i) => newEffect('blur', `limit${i}`, i)); effects.show(id);
  const panel = document.querySelector<HTMLElement>('.fxpanel')!; button('+ Add effect', panel).click();
  expect([...panel.querySelectorAll<HTMLButtonElement>('.fx-add button')].every((b) => b.disabled), 'unsavable seventeenth effect allowed');
  let help = ''; app.onOpenManual = (section) => { help = section ?? ''; }; button('Effects help', panel).click(); expect(help === 'effects', 'wrong manual section');
  button('Motion help').click(); expect(help === 'motion', 'Motion help not routed');
  const box = panel.getBoundingClientRect();
  expect(box.left >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1, `panel offscreen: ${box.toJSON()}`);
  if (innerWidth <= 760) expect(Math.abs(box.bottom - innerHeight) <= 1, 'touch card is not docked at the bottom');
});
await check('No uncaught browser errors', () => expect(errors.length === 0, errors.join('; ')));
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, motion, effects };
