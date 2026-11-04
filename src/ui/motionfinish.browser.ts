import { hashBytes } from '../io/hash';
import { ShareView } from './share';
import { SoundBank } from '../io/sound';
import { App } from '../app';
import { Project } from '../core/project';
import { cameraLayer, compLayer, drawingsLayer, newComp, type CameraLayer, type CompLayer } from '../core/comp';
import { LINEAR, staticProp } from '../core/anim';
import { newEffect } from '../core/effects';
import { BUILTIN_PRESETS, presetLayer } from '../core/presets';
import { ArtworkAssets } from '../core/assets';
import { captureProject } from '../io/projectio';
import { validateProjectFile } from '../io/schema';
import { BundleQueue, planBundle, prepareBundle, type BundleOptions, type BundleSession } from '../io/bundle';
import { readZip } from '../io/zip';
import { decodeGif } from '../io/gifdecode';
import { planVideo } from '../io/videoplan';
import { videoSupport } from '../io/exportvideo';
import { CameraMoveUI } from './cameramove';
import { EffectsPanel } from './effectspanel';
import { SymbolUI } from './symbols';
import { BundleUI } from './bundle';
import { MotionPanel } from './motion';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!), camera = new CameraMoveUI(app), effects = new EffectsPanel(app), assets = new ArtworkAssets(app), symbols = new SymbolUI(app, assets, id => assets.open(id)), bundle = new BundleUI(app, () => {});
motion.openCameraMove = () => camera.show(); motion.openSymbol = id => symbols.show(id); app.openSymbol = id => symbols.show(id);
const refresh = () => { document.body.className = `ui-simple ws-${app.workspace}`; motion.update(); }; app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.editor.onChange = refresh; app.history.onChange = refresh;
app.loadProject(new Project(320, 180)); app.project.comp.duration = 72; app.setWorkspace('motion'); app.editor.select(app.project.layer.id);
const wait = (ms = 70) => new Promise<void>(r => setTimeout(r, ms));
const until = async (test: () => boolean) => { const end = performance.now() + 12000; while (!test()) { if (performance.now() > end) throw new Error('Timed out'); await wait(); } };
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const button = (name: string, root: ParentNode = document) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name); if (!b) throw new Error(`Missing ${name}`); return b; };
const click = (name: string, root: ParentNode = document) => { const b = button(name, root); expect(!b.disabled, `Disabled ${name}`); b.click(); };
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => document.querySelector<T>(`[aria-label="${name}"]`)!;
const input = (name: string, value: string) => { const n = field<HTMLInputElement | HTMLSelectElement>(name); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); };
const undo = async () => { app.undo(); await wait(130); }, redo = async () => { app.redo(); await wait(130); };
const paint = (canvas: HTMLCanvasElement, color: string) => { const g = canvas.getContext('2d')!; g.clearRect(0, 0, canvas.width, canvas.height); g.fillStyle = color; g.fillRect(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2); };
let passed = 0, failed = 0, cameraId = '', placementId = '', oldSource = '', replacementSource = '', session: BundleSession | null = null, actualZip: Map<string, Uint8Array> | null = null;
const errors: string[] = []; addEventListener('error', e => errors.push(e.message));
async function check(name: string, test: () => unknown | Promise<unknown>) { const li = document.createElement('li'); try { await test(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; camera.close(); symbols.close(); bundle.close(); effects.close(); } document.querySelector('#results')!.append(li); }
await wait(180); paint(app.drawing.line, '#0055ff'); app.drawing.rev++;
await check('Camera preview plays and scrubs on a separate clock; Cancel changes nothing', async () => {
  app.history.clear(); const before = JSON.stringify([...app.project.comps]), frame = app.frame; camera.show(); await until(() => !button('Apply camera move').disabled); click('Play preview'); await wait(160); click('Pause preview'); input('Camera preview frame', '10'); await wait(); click('Cancel', document.querySelector('.camera-move')!);
  expect(JSON.stringify([...app.project.comps]) === before && app.frame === frame && !app.history.canUndo && !app.playing, 'camera preview edited the project');
});
await check('New camera and its baked move are one undoable command', async () => {
  camera.show(); input('Start frame', '6'); input('End frame', '21'); await until(() => !button('Apply camera move').disabled); click('Apply camera move'); cameraId = app.editor.primary!.id; const cam = app.editor.primary as CameraLayer;
  expect(cam.kind === 'camera' && cam.zoom.keys[0]?.f === 5 && Math.abs(Number(cam.zoom.keys[1]?.v) - 115) < .001, 'camera endpoints wrong'); const snapshot = JSON.stringify(cam); await undo(); expect(!app.history.canUndo && !app.project.comp.layers.some(l => l.id === cameraId), 'camera creation took multiple Undo'); await redo(); expect(JSON.stringify(app.project.comp.layers.find(l => l.id === cameraId)) === snapshot, 'redo changed move'); app.editor.select(cameraId);
});
await check('Existing camera keys require explicit replacement and outside keys remain', async () => {
  const cam = app.editor.primary as CameraLayer; cam.zoom.keys.unshift({ f: 0, v: 100, in: LINEAR, out: LINEAR }); cam.zoom.keys.push({ f: 60, v: 100, in: LINEAR, out: LINEAR }); app.history.clear();
  camera.show(); input('Start frame', '6'); input('End frame', '21'); input('Move', 'pull'); await wait(); expect(button('Apply camera move').disabled && document.querySelector('.camera-move [role=status]')!.textContent!.includes('Replace keys'), 'keys overwritten without choice'); const replace = field<HTMLInputElement>('Replace keys in this range'); replace.checked = true; replace.dispatchEvent(new Event('change', { bubbles: true })); await until(() => !button('Apply camera move').disabled); click('Apply camera move');
  const next = app.editor.primary as CameraLayer; expect(next.zoom.keys.map(k => k.f).join(',') === '0,5,20,60' && Math.abs(Number(next.zoom.keys[2]?.v) - 100 / 1.15) < .001, 'pull lost external keys'); await undo(); expect(!app.history.canUndo, 'existing camera edit took multiple Undo');
});
await check('Locked cameras and stale targets cannot receive a move', async () => {
  app.editor.select(cameraId); app.editor.setFlag(cameraId, 'locked', true); camera.show(); await wait(); expect(button('Apply camera move').disabled && document.querySelector('.camera-move [role=status]')!.textContent!.includes('Unlock'), 'locked camera accepted move'); camera.close(); app.editor.setFlag(cameraId, 'locked', false);
  camera.show(); input('Start frame', '30'); input('End frame', '40'); await until(() => !button('Apply camera move').disabled); app.editor.rename(cameraId, 'Renamed camera'); click('Apply camera move'); expect(document.querySelector('.camera-move [role=status]')!.textContent!.includes('changed'), 'stale camera applied'); camera.close();
});
await check('Applied effect presets keep an embedded snapshot and Reset restores the stack in one Undo', async () => {
  const layer = app.project.comp.layers.find(l => l.kind === 'drawings')!; app.editor.select(layer.id); const look = BUILTIN_PRESETS.find(p => p.id === 'soft-glow')!;
  app.editor.edit('Apply look', c => { c.layers = c.layers.map(l => l.id === layer.id ? presetLayer(look, l, c, { frame: 0, duration: 1, append: false }, () => 'original') : l); });
  app.editor.edit('Change glow', c => { c.layers.find(l => l.id === layer.id)!.effects![0]!.amount = 0; }); const dirty = app.editor.primary!.effects![0]!.amount; app.history.clear(); effects.show(layer.id); click('Reset to applied preset');
  expect(app.editor.primary!.effects![0]!.amount !== dirty && app.editor.primary!.styleOrigin?.name === 'Soft glow', 'reset did not restore applied look'); await undo(); expect(app.editor.primary!.effects![0]!.amount === dirty && !app.history.canUndo, 'reset took multiple Undo'); effects.close();
  const file = validateProjectFile((await captureProject(app.project, { mode: 'archive' }).settle()).file); expect(file.comps[file.main]!.layers.find(l => l.id === layer.id)?.styleOrigin?.name === 'Soft glow', 'file dropped preset snapshot');
});
await check('Effect Add keeps query, scroll and focus after repeated additions', async () => {
  effects.show(app.editor.primary!.id); click('+ Add effect', document.querySelector('.fxpanel')!); const content = document.querySelector<HTMLElement>('.fx-content')!, tv = document.querySelector<HTMLButtonElement>('[data-effect=tv]')!; tv.scrollIntoView({ block: 'nearest' }); const scroll = content.scrollTop; tv.click();
  expect(Math.abs(document.querySelector('.fx-content')!.scrollTop - scroll) < 2 && document.activeElement === document.querySelector('[data-effect=tv]'), 'add reset scroll or focus'); input('Find an effect', 'blur'); document.querySelector<HTMLButtonElement>('[data-effect=blur]')!.click(); expect(field<HTMLInputElement>('Find an effect').value === 'blur' && document.querySelector('.fx-add') && document.querySelector('[data-effect=blur]') === document.activeElement, 'query/tab lost'); effects.close();
});
await check('Touch Effects has one scroll region and reachable header controls', async () => {
  effects.show(app.editor.primary!.id); const root = document.querySelector<HTMLElement>('.fxpanel')!, r = root.getBoundingClientRect(); expect(document.querySelectorAll('.fxpanel').length === 1 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, 'panel outside viewport'); expect(getComputedStyle(root.querySelector('.fx-content')!).overflowY === 'auto' && root.querySelector('.fx-head')!.getBoundingClientRect().top >= r.top, 'not one scrolling content region'); expect(button('Close', root).getBoundingClientRect().bottom <= innerHeight, 'close unreachable'); if (innerHeight <= 480) expect(root.querySelector('.fx-content')!.clientHeight >= 88, 'landscape leaves no usable effect list'); effects.close();
});
await check('Effect limit disables the seventeenth addition with a visible explanation', () => {
  const id = app.editor.primary!.id; app.editor.edit('Fill effects', c => { c.layers.find(l => l.id === id)!.effects = Array.from({ length: 16 }, (_, i) => newEffect('blur', `e${i}`, 1)); }); effects.show(id); click('+ Add effect', document.querySelector('.fxpanel')!); expect([...document.querySelectorAll<HTMLButtonElement>('[data-effect]')].every(b => b.disabled) && document.querySelector('.fxpanel')!.textContent!.includes('16 effects'), 'overflow effect can be added'); effects.close();
});
await check('Symbol options explain shared source usage and expose pin reset controls', () => {
  const p = app.project, blue = p.newDrawing(), red = p.newDrawing(); paint(blue.line, '#0055ff'); paint(red.line, '#ff2255'); blue.rev++; red.rev++;
  const a = newComp('sourceA', 'Shared badge', 320, 180, 12), b = newComp('sourceB', 'Red badge', 320, 180, 12); a.asset = b.asset = true; a.duration = b.duration = 24; a.layers.push(drawingsLayer('innerA', 'Badge', [{ drawing: blue.id, length: 24 }], 320, 180)); b.layers.push(drawingsLayer('innerB', 'Red', [{ drawing: red.id, length: 24 }], 320, 180)); a.pins.push({ layer: 'innerA', prop: 'opacity' }); p.comps.set(a.id, a); p.comps.set(b.id, b); oldSource = a.id; replacementSource = b.id;
  const placement = compLayer('symbol', 'Custom badge placement', a, p.comp); placement.in = placement.start = 2; placement.out = 54; placement.play = 'loop'; placement.overrides = { 'innerA:opacity': staticProp(40) }; placement.transform.position.value = [140, 80]; p.comp.layers.unshift(placement, { ...structuredClone(placement), id: 'peer', name: 'Linked peer' }); placementId = placement.id; app.editor.select(placement.id); app.setFrame(6); refresh(); symbols.show(placement.id);
  expect(document.querySelector('.symbol-options')!.textContent!.includes('2 linked placements') && !!button('Reset Badge opacity override'), 'source use or pins unclear'); click('Done', document.querySelector('.symbol-options')!);
});
await check('Source swap preview and Cancel preserve placement, playhead and history', async () => {
  app.history.clear(); const before = JSON.stringify([...app.project.comps]), frame = app.frame; symbols.swap(placementId); await until(() => !button('Apply source swap').disabled); click('Cancel', document.querySelector('.symbol-swap')!); expect(JSON.stringify([...app.project.comps]) === before && app.frame === frame && !app.history.canUndo, 'source preview mutated document');
});
await check('Source swap preserves custom name, transforms and timing, resets only its pins and undoes once', async () => {
  const before = structuredClone(app.project.comp.layers.find(l => l.id === placementId) as CompLayer); symbols.swap(placementId); input('Replacement source', replacementSource); await until(() => !button('Apply source swap').disabled); click('Apply source swap'); const next = app.project.comp.layers.find(l => l.id === placementId) as CompLayer;
  expect(next.comp === replacementSource && Object.keys(next.overrides).length === 0 && next.name === before.name && JSON.stringify(next.transform) === JSON.stringify(before.transform) && next.in === before.in && next.out === before.out && next.start === before.start && (app.project.comp.layers.find(l => l.id === 'peer') as CompLayer).comp === oldSource, 'swap changed placement or peers'); await undo(); expect(JSON.stringify(app.project.comp.layers.find(l => l.id === placementId)) === JSON.stringify(before) && !app.history.canUndo, 'swap undo lost source or overrides'); app.editor.select(placementId);
});
await check('Make independent copies the editable graph and one Undo restores sharing', async () => {
  app.history.clear(); const count = app.project.comps.size; symbols.show(placementId); click('Make independent'); await until(() => (app.project.comp.layers.find(l => l.id === placementId) as CompLayer).comp !== oldSource); expect(app.project.comps.size > count && (app.project.comp.layers.find(l => l.id === 'peer') as CompLayer).comp === oldSource, 'independence changed peer'); symbols.close(); await undo(); expect(app.project.comps.size === count && (app.project.comp.layers.find(l => l.id === placementId) as CompLayer).comp === oldSource && !app.history.canUndo, 'independent undo lost graph sharing');
});
const bundleOptions: BundleOptions = { start: 12, end: 24, poster: 18, project: true, video: { format: 'mp4', size: '1080p', quality: 'high', background: 'white' } };
await check('Hand-in preview accurately labels range, GIF excerpt and poster without changing the document', async () => {
  const p = new Project(64, 64), red = p.newDrawing(); p.comp.duration = 24; paint(p.drawings.get('d1')!.line, '#0000ff80'); paint(red.line, '#ff000080'); p.layer.exposures = [{ drawing: 'd1', length: 12 }, { drawing: red.id, length: 12 }]; app.loadProject(p); app.setWorkspace('motion'); app.setFrame(18); app.history.clear(); const before = JSON.stringify([...p.comps]); bundle.show(); input('Bundle start frame', '13'); input('Bundle end frame', '24'); await until(() => !button('Make bundle').disabled || !document.querySelector('.bundle-dialog [role=status]')!.textContent!.includes('Checking'));
  expect(document.querySelector('.bundle-dialog')!.textContent!.includes('1.00 s') && JSON.stringify([...p.comps]) === before && !app.history.canUndo, 'bundle preview edited project or wrong duration'); bundle.close();
});
await check('Frozen export snapshot survives later artwork changes and produces all four files atomically', async () => {
  const plan = planBundle(app.project, bundleOptions, false), support = await videoSupport(planVideo(app.project, plan.video, undefined, plan.frames)); expect(support.codec === 'avc', `Real MP4 encoder unavailable: ${support.message}`);
  const before = JSON.stringify([...app.project.comps]), frame = app.frame; session = await prepareBundle(app.project, bundleOptions, false, app.device.limits.budget, k => app.assets(k), new AbortController().signal);
  paint(app.drawing.line, '#00ff00'); app.drawing.rev++; const result = await session.queue.run(new AbortController().signal, () => {}); actualZip = await readZip(new Uint8Array(await result.arrayBuffer()));
  expect(actualZip.size === 5 && JSON.stringify([...app.project.comps]) === before && app.frame === frame && !app.history.canUndo, 'export edited project or missing members'); const manifest = JSON.parse(new TextDecoder().decode(actualZip.get('manifest.json'))); expect(manifest.complete && manifest.range.start === 13 && manifest.posterFrame === 19 && manifest.gif.seconds === 1, 'manifest range wrong');
});
await check('PNG, GIF and editable project carry the same frozen red artwork and alpha', async () => {
  expect(!!actualZip, 'bundle not available'); const file = (ext: string) => actualZip!.get([...actualZip!.keys()].find(k => k.endsWith(ext))!)!;
  const bitmap = await createImageBitmap(new Blob([file('-poster.png') as BlobPart], { type: 'image/png' })), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); const pixel = [...canvas.getContext('2d')!.getImageData(32, 32, 1, 1).data]; expect(pixel[0] === 255 && pixel[1] === 0 && Math.abs(pixel[3]! - 128) < 2 && canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data[3] === 0, 'poster lost alpha or frozen pixels');
  const gif = decodeGif(file('.gif')), at = (32 * gif.width + 32) * 4; expect(gif.frames[0]!.rgba[at]! > 230 && gif.frames[0]!.rgba[at + 1]! < 170, 'GIF starts at wrong comp frame');
  const projectFiles = await readZip(file('.2dope')); expect(projectFiles.has('project.json') && projectFiles.size >= 3, 'editable package incomplete'); session?.dispose(); session = null;
});
await check('Encoded MP4 is a real playable red frame, rather than a renamed format', async () => {
  expect(!!actualZip, 'bundle not available'); const bytes = actualZip!.get([...actualZip!.keys()].find(k => k.endsWith('.mp4'))!)!; expect(new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp', 'not an MP4 container');
  const video = document.createElement('video'), url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' })); video.src = url; video.muted = true;
  try { await new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('MP4 decode timed out')), 7000); video.onloadeddata = () => { clearTimeout(timeout); resolve(); }; video.onerror = () => { clearTimeout(timeout); reject(new Error('MP4 decode failed')); }; video.load(); }); await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Video frame presentation timed out')), 5000); video.requestVideoFrameCallback(() => { clearTimeout(timer); video.pause(); resolve(); }); void video.play().catch(reject); }); const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')!.drawImage(video, 0, 0); const pixel = canvas.getContext('2d')!.getImageData(32, 32, 1, 1).data; expect(pixel[0]! > 220 && pixel[1]! > 90 && pixel[1]! < 170 && pixel[2]! < 170, `MP4 frame does not match frozen red picture: ${[...pixel].join(',')}`); } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
});
await check('Bundle audio is muxed as AAC or explicitly refused without a silent replacement', async () => {
  const rate = 44100, samples = rate * 2, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer), ascii = (at: number, text: string) => bytes.set(new TextEncoder().encode(text), at);
  ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = rate; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i / rate * Math.PI * 440) * 12000), true);
  app.project.sounds.set('fixtureSound', { name: 'Cue.wav', path: `assets/${hashBytes(bytes)}.wav`, duration: 2, bytes }); app.project.comp.audio = [{ id: 'cue', asset: 'fixtureSound', name: 'Cue', start: 0, trimIn: 0, trimOut: 2, gain: 1, muted: false, link: null }];
  const { canEncodeAudio, Input, BlobSource, ALL_FORMATS } = await import('mediabunny'), supported = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: rate, bitrate: 128000 });
  const audioSession = await prepareBundle(app.project, { ...bundleOptions, project: false }, false, app.device.limits.budget, k => app.assets(k), new AbortController().signal);
  try {
    if (supported) { const result = await audioSession.queue.run(new AbortController().signal, () => {}), files = await readZip(new Uint8Array(await result.arrayBuffer())), mp4 = files.get([...files.keys()].find(k => k.endsWith('.mp4'))!)!, input = new Input({ source: new BlobSource(new Blob([mp4 as BlobPart])), formats: ALL_FORMATS }); try { expect((await input.getAudioTracks()).length === 1, 'bundle dropped audio track'); } finally { input.dispose(); } }
    else { let refused = false; try { await audioSession.queue.run(new AbortController().signal, () => {}); } catch (e) { refused = String(e).includes('cannot encode audio'); } expect(refused && audioSession.queue.completed.size === 0, 'unsupported AAC produced a silent substitute'); }
    const li = document.createElement('li'); li.textContent = `Measured: real AAC bundle encoder ${supported ? 'passed' : 'unavailable; explicit refusal verified'}`; document.querySelector('#results')!.append(li);
  } finally { audioSession.dispose(); delete app.project.comp.audio; app.project.sounds.delete('fixtureSound'); }
});
await check('Bundle UI makes the real files but downloads only after an explicit Save', async () => {
  bundle.show(); input('Bundle start frame', '13'); input('Bundle end frame', '24'); const include = field<HTMLInputElement>('Include editable project'); include.checked = true; include.dispatchEvent(new Event('change', { bubbles: true })); await until(() => !button('Make bundle').disabled);
  let downloads = 0; const original = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => { downloads++; };
  try { click('Make bundle'); await until(() => !!document.querySelector('.bundle-dialog [role=status]')?.textContent?.includes('All files are ready')); expect(downloads === 0 && !button('Save bundle ZIP').hidden, 'bundle downloaded before explicit Save'); click('Save bundle ZIP'); expect(Number(downloads) === 1, 'Save did not download ZIP'); } finally { HTMLAnchorElement.prototype.click = original; bundle.close(); }
});
await check('Bundle UI cancellation produces no ready download or document edits', async () => {
  const before = JSON.stringify([...app.project.comps]); app.history.clear(); bundle.show(); await until(() => !button('Make bundle').disabled); click('Make bundle'); click('Cancel making'); await until(() => !!document.querySelector('.bundle-dialog [role=status]')?.textContent?.includes('Cancelled')); expect(button('Save bundle ZIP').hidden && !app.history.canUndo && JSON.stringify([...app.project.comps]) === before, 'cancel wrote a result or changed artwork'); bundle.close();
});
await check('Bundle recovery retains completed files, retries only the failed step and blocks unavailable MP4', async () => {
  const p = planBundle(app.project, bundleOptions, false), calls: string[] = []; let failure = true, fallback = false;
  const queue = new BundleQueue(p, async step => { calls.push(step); if (step === 'gif' && failure) throw new Error('Injected GIF failure'); return new Blob([step]); });
  const recovery = new BundleUI(app, () => {}, { prepare: async () => ({ queue, dispose() { queue.completed.clear(); } }), support: async () => ({ codec: 'avc', message: '' }) });
  recovery.show(); await until(() => !button('Make bundle').disabled); click('Make bundle'); await until(() => !!document.querySelector('.bundle-dialog [role=status]')?.textContent?.includes('Injected GIF failure')); expect(!button('Save completed files').hidden && button('Save bundle ZIP').hidden, 'failure exposed complete bundle'); failure = false; click('Retry failed step'); await until(() => !button('Save bundle ZIP').hidden); expect(calls.join(',') === 'video,poster,gif,gif,project', 'retry rerendered successful files'); recovery.close();
  const unavailable = new BundleUI(app, () => { fallback = true; }, { support: async () => ({ codec: null, message: 'MP4 unavailable for this device.' }) }); unavailable.show(); await until(() => !!document.querySelector('.bundle-dialog [role=status]')?.textContent?.includes('MP4 unavailable')); expect(button('Make bundle').disabled, 'unsupported MP4 can be made'); click('Other Share formats'); expect(fallback && !document.querySelector('.bundle-dialog'), 'no ordinary Share recovery');
});
await check('Share hands the selected shot to Bundle even if the editor returns to another asset', async () => {
  const project = app.project, main = project.main, other = newComp('otherScope', 'Other asset', 64, 64, 12); other.asset = true; other.duration = 6; project.comps.set(other.id, other);
  const share = new ShareView(app, { sounds: new SoundBank(() => false), backup() {}, onOpenChange() {} });
  share.onBundle = scope => { project.activeComp = other.id; bundle.show(scope); };
  share.show('video'); click('Hand-in bundle'); await until(() => !!document.querySelector('.bundle-dialog [role=status]')?.textContent?.includes('Ready'));
  expect(document.querySelector('.bundle-dialog')!.textContent!.includes('2.00 s') && field<HTMLInputElement>('Bundle end frame').value === '24', 'Share lost export scope'); bundle.close(); project.activeComp = main; share.close();
});
await check('New dialogs fit the viewport and keep Apply/Close reachable', async () => {
  camera.show(); await wait(); let r = document.querySelector('.camera-move')!.getBoundingClientRect(); expect(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, 'camera dialog outside viewport'); button('Apply camera move').scrollIntoView(); expect(button('Apply camera move').getBoundingClientRect().bottom <= innerHeight, 'camera Apply unreachable'); camera.close(); bundle.show(); await wait(); r = document.querySelector('.bundle-dialog')!.getBoundingClientRect(); expect(r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, 'bundle outside viewport'); button('Close', document.querySelector('.bundle-dialog')!).scrollIntoView(); expect(button('Close', document.querySelector('.bundle-dialog')!).getBoundingClientRect().bottom <= innerHeight && !errors.length, errors.join('; ') || 'Close unreachable'); bundle.close();
});
(session as BundleSession | null)?.dispose(); document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app, motion, camera, effects, assets, symbols, bundle };
