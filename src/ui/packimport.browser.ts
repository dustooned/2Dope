/** My Assets → Import images…, against a disposable IndexedDB library and an in-memory project. */
import { App } from '../app';
import { MemoryStore } from '../io/persist';
import { DeviceArtworkStore, type ArtworkStore } from '../io/artworkstore';
import { readArtwork, packArtwork, artworkFromImage } from '../io/artwork';
import { epsTextFromBytes } from '../io/eps';
import { importVectorDocument } from '../io/vectorimport';
import { ArtworkAssetsUI } from './artworkassets';
import { FileUI } from './files';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { mediaPicker, AI_NOTICE } from './media';
import type { AudioTracks } from './audiotracks';

const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), flip = new FlipMode(app, stage);
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh());
const dbName = `2dope-packimport-check-${crypto.randomUUID()}`, device = new DeviceArtworkStore(dbName);
let failSave = false, onPut: (() => void) | null = null;
const store: ArtworkStore = { list: () => device.list(), get: id => device.get(id), move: (id, c) => device.move(id, c), replace: (id, e) => device.replace(id, e),
  rename: (id, n) => device.rename(id, n), remove: id => device.remove(id),
  put: async e => { if (failSave) throw new DOMException('Test quota', 'QuotaExceededError'); await device.put(e); onPut?.(); } };
const assets = new ArtworkAssetsUI(app, document.querySelector<HTMLElement>('.painting-header')!, store);
const projects = new MemoryStore(), files = new FileUI(app, projects, false);
const notices: string[] = []; app.onNotice = m => { notices.push(m); };
function refresh() { painting.update(); assets.update(); }
app.onFrameChange = () => { flip.update(); refresh(); }; app.onCompChange = refresh; app.onWorkspaceChange = () => { flip.update(); refresh(); }; app.editor.onChange = refresh; app.history.onChange = refresh; flip.onChange = refresh;
const keys = ['2dope.painting.layout.draw', '2dope.painting.layout.animate', '2dope.draw.view', '2dope.animate.view', '2dope.flip.mini'];
const saved = keys.map(k => localStorage.getItem(k));
const nextFrame = () => new Promise<boolean>(r => { const t = setTimeout(() => r(false), 500); requestAnimationFrame(() => { clearTimeout(t); r(true); }); });
const settle = async () => { await new Promise<void>(r => setTimeout(r, 50)); await nextFrame(); };
async function until(predicate: () => boolean) { const end = performance.now() + 15000; while (!predicate()) { if (performance.now() > end) throw new Error('Timed out waiting for UI'); await settle(); } }
const button = (name: string, scope: ParentNode = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document) => { const b = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.offsetParent && [b.getAttribute('aria-label'), b.textContent?.trim()].includes(name)); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string) => { const b = button(name); if (b.disabled) throw new Error(`Disabled ${name}`); b.click(); };
const hit = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9 && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); };
const status = () => document.querySelector('.artwork-library-status')?.textContent ?? '';
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }

async function png(name: string, w: number, h: number, colour: string): Promise<File> {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = colour; g.fillRect(0, 0, w, h);
  const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png')); return new File([blob], name, { type: 'image/png' });
}
async function pixels(bytes: Uint8Array) {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' })), c = document.createElement('canvas');
  c.width = bitmap.width; c.height = bitmap.height; const g = c.getContext('2d')!; g.drawImage(bitmap, 0, 0); bitmap.close();
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data[(y * c.width + x) * 4 + 3]! > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { width: c.width, height: c.height, box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, at: (x: number, y: number) => [...data.subarray((y * c.width + x) * 4, (y * c.width + x) * 4 + 4)] };
}
const fillOf = async (archive: Uint8Array) => {
  const bundle = await readArtwork(archive), drawings = Object.values(bundle.file.drawings), path = drawings[0]?.fill;
  return { bundle, drawings, bytes: path ? bundle.assets.get(path) ?? null : null };
};
function dosEps(ps: string): Uint8Array {
  const body = new TextEncoder().encode(ps), preview = new Uint8Array([0xff, 0xd8, 0x80, 0xe9]), out = new Uint8Array(30 + preview.length + body.length), v = new DataView(out.buffer);
  out.set([0xc5, 0xd0, 0xd3, 0xc6]); v.setUint32(4, 30 + preview.length, true); v.setUint32(8, body.length, true); out.set(preview, 30); out.set(body, 30 + preview.length); return out;
}
const eps = (body: string) => `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 64 64\n%%EndComments\n${body}\nshowpage`;

try {
  if (!await nextFrame()) check('Animation frames run (this tab is hidden or in the background: show it and reload)', false);
  await files.newProject({ name: 'Pack target', width: 64, height: 48, fps: 12, frames: 12 }); app.setWorkspace('draw'); await settle();
  app.history.clear(); const shot = app.project.main, layers = app.project.comp.layers.length;
  click('Assets (0)'); click('My Assets'); await until(() => !!document.querySelector('.artwork-library-count')?.textContent?.includes('saved asset'));
  check('My Assets offers Import images… as a reachable 44px button', hit(button('Import images into My Assets')));

  const sawProgress = { status: false, busy: false, cancel: false };
  const watch = new MutationObserver(() => {
    const row = document.querySelector('.artwork-import-progress');
    if (row?.querySelector('[role="status"]')?.textContent?.startsWith('Adding image')) sawProgress.status = true;
    if (document.querySelector('dialog.artwork-library')?.getAttribute('aria-busy') === 'true') sawProgress.busy = true;
    if (row?.querySelector('[aria-label="Cancel image import"]')) sawProgress.cancel = true;
  });
  watch.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const red = await png('Red.png', 20, 10, '#ff0000'), green = await png('Green.png', 10, 30, '#00ff00'), big = await png('Wide.png', 128, 16, '#0000ff');
  const notes = new File(['hello'], 'readme.txt', { type: 'text/plain' });
  await assets.library.importImages([red, green, big, notes], 'Science Retro Set'); await until(() => !assets.library.busy);
  watch.disconnect();
  let cards = await device.list();
  check('Three images become three cards in the named collection; the text file is skipped',
    cards.length === 3 && cards.every(c => c.collection === 'Science Retro Set') && ['Red', 'Green', 'Wide'].every(n => cards.some(c => c.name === n)));
  check('The run shows progress with role=status, aria-busy and a Cancel button', sawProgress.status && sawProgress.busy && sawProgress.cancel);
  check('The summary counts what was added and skipped', status() === 'Added 3 of 4 images to Science Retro Set. Skipped 1 file that is not PNG, JPG or WebP.' && notices.at(-1) === status());
  check('Importing leaves the open shot and its history alone', !app.history.canUndo && app.project.main === shot && app.project.comp.layers.length === layers && assets.assets.list().length === 0);
  check('Cards are one-frame, one-layer drawings at the project canvas size with a bitmap thumbnail',
    cards.every(c => c.width === 64 && c.height === 48 && c.frames === 1 && c.layers === 1 && c.kind === 'drawing' && c.fps === 12 && !!c.thumb?.length));
  const wide = cards.find(c => c.name === 'Wide')!, wideThumb = await pixels(wide.thumb!);
  check('The thumbnail comes from the source picture, not the canvas', wideThumb.width === 128 && wideThumb.height === 16);
  const redEntry = (await device.get(cards.find(c => c.name === 'Red')!.id))!, redFill = await fillOf(redEntry.archive);
  const redPx = redFill.bytes ? await pixels(redFill.bytes) : null;
  check('The stored package round-trips with its Colour image centred at native size', !!redPx && redPx.width === 64 && redPx.height === 48 &&
    JSON.stringify(redPx.box) === JSON.stringify({ x: 22, y: 19, w: 20, h: 10 }) && redPx.at(32, 24).join() === '255,0,0,255' && redPx.at(0, 0)[3] === 0 &&
    redFill.bundle.file.comps[redFill.bundle.file.main]!.asset === true && redFill.drawings.length === 1);
  const wideFill = await fillOf((await device.get(wide.id))!.archive), widePx = wideFill.bytes ? await pixels(wideFill.bytes) : null;
  check('A picture wider than the canvas is scaled down to fit', JSON.stringify(widePx?.box) === JSON.stringify({ x: 0, y: 20, w: 64, h: 8 }));
  check('A packed card re-reads as a normal artwork file', (await readArtwork(packArtwork(redFill.bundle))).file.comps[redFill.bundle.file.main]!.layers.length === 1);
  check('Same-size cards can be added to the shot as copies', !button('Add copy of Red').disabled);

  await assets.library.importImages([red, await png('Blue.png', 8, 8, '#0000ff')], 'Science Retro Set'); await until(() => !assets.library.busy);
  cards = await device.list();
  check('A second batch into the same collection suffixes repeated names', cards.length === 5 && cards.some(c => c.name === 'Red (2)') && cards.some(c => c.name === 'Blue'));

  onPut = () => { onPut = null; button('Cancel image import').click(); };
  await assets.library.importImages([await png('One.png', 4, 4, '#111'), await png('Two.png', 4, 4, '#222'), await png('Three.png', 4, 4, '#333')], 'Cancelled set');
  await until(() => !assets.library.busy);
  cards = await device.list();
  check('Cancel stops before the next image and keeps the card already stored', cards.filter(c => c.collection === 'Cancelled set').length === 1 &&
    status().startsWith('Added 1 of 3 images to Cancelled set.') && status().includes('cancelled'));

  const many = Array.from({ length: 51 }, (_, i) => new File([new Uint8Array(4)], `tile ${i}.png`, { type: 'image/png' }));
  await assets.library.importImages(many, 'Too many'); await until(() => !assets.library.busy);
  check('A batch over 50 images is refused before any card is written', (await device.list()).length === cards.length && status().includes('up to 50 images'));

  await assets.library.importImages([new File([new Uint8Array([1, 2, 3])], 'broken.png', { type: 'image/png' }), await png('Fine.png', 6, 6, '#abc')], 'Mixed');
  await until(() => !assets.library.busy);
  check('An unreadable image is skipped and counted', status() === 'Added 1 of 2 images to Mixed. Skipped 1 unreadable image.');

  failSave = true; await assets.library.importImages([await png('Full.png', 4, 4, '#f0f')], 'Quota'); await until(() => !assets.library.busy); failSave = false;
  check('A storage failure stops with a Storage is full message', status().includes('Storage is full after 0 cards.') && !(await device.list()).some(c => c.collection === 'Quota'));

  const tall = document.createElement('canvas'); tall.width = 90; tall.height = 157; tall.getContext('2d')!.fillStyle = '#00ff00'; tall.getContext('2d')!.fillRect(0, 0, 90, 157);
  const hd = await fillOf(packArtwork(await artworkFromImage('Tall', { source: tall, width: tall.width, height: tall.height }, 1920, 1080))), hdPx = hd.bytes ? await pixels(hd.bytes) : null;
  check('A 90×157 picture on a 1920×1080 canvas is centred at native size with transparent surroundings',
    !!hdPx && hdPx.width === 1920 && JSON.stringify(hdPx.box) === JSON.stringify({ x: 915, y: 462, w: 90, h: 157 }) && hdPx.at(10, 10)[3] === 0 && hd.bundle.file.comps[hd.bundle.file.main]!.name === 'Tall');

  click('Close My Assets'); app.setWorkspace('motion'); await settle();
  const picker = mediaPicker(app, null as unknown as AudioTracks);
  await picker.importAssets([new File(['%PDF-1.4'], 'Rocket.ai', { type: 'application/postscript' })], 0);
  check('An .ai file gets the Illustrator PDF notice', notices.at(-1) === `Rocket.ai: ${AI_NOTICE}`);
  await picker.importAssets([new File([dosEps(eps('Adobe_AGM_Utils begin 0 0 m 10 10 l S')) as BlobPart], 'Car.eps', { type: 'application/postscript' })], 0);
  check('A DOS EPS binary from Illustrator is read past its header and named', /^Car\.eps: This EPS was saved by Adobe Illustrator/.test(notices.at(-1) ?? ''));
  const plain = importVectorDocument(epsTextFromBytes(dosEps(eps('1 0 0 setrgbcolor 8 8 m 24 8 l 24 24 l h f'))), true);
  check('A DOS EPS binary around a plain body imports its paths', plain.strokes.length === 1 && plain.width === 64);
} catch (e) { check(String(e), false); }
finally {
  assets.library.close(); await files.autosaver.flush(); files.autosaver.stop();
  keys.forEach((k, i) => { if (saved[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[i]!); });
  // Only this fixture's uniquely named disposable artwork database is removed.
  await new Promise<void>(resolve => { const r = indexedDB.deleteDatabase(dbName); r.onsuccess = r.onerror = () => resolve(); r.onblocked = () => resolve(); });
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
