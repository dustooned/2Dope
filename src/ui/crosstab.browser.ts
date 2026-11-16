/**
 * Copy in one 2Dope tab, paste in another. The other tab is a same-origin iframe running its own
 * App, clipboard handler and crosstab module (its own tab id), sharing this origin's IndexedDB and
 * Web Locks the way a second tab does. Removing the iframe stands in for closing that tab.
 */
import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import { crossTab, messages, readHead } from '../io/crosstab';
import { installClipboard } from './clipboard';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
installClipboard(app, document.querySelector<HTMLElement>('#stage')!, async () => {});
const errors: string[] = [], notices: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.onNotice = m => { notices.push(m); };
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const until = async (test: () => boolean | Promise<boolean>, ms = 8000) => { const end = performance.now() + ms; while (!(await test())) { if (performance.now() > end) throw new Error('Timed out'); await wait(30); } };
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${e}`; }
  document.querySelector('#results')!.append(li);
};
const paint = async (d: Drawing, colour: string, x: number, y: number) => {
  await app.residency.ensure(d);
  const g = d.line.getContext('2d')!; g.fillStyle = colour; g.fillRect(x, y, 20, 20); d.rev++;
};
const colourAt = async (d: Drawing, x: number, y: number) => { await app.residency.ensure(d); return [...d.line.getContext('2d')!.getImageData(x, y, 1, 1).data]; };
const red = (c: number[]) => c[0]! > 200 && c[1]! < 60 && c[3]! > 200;
const blue = (c: number[]) => c[2]! > 200 && c[0]! < 60 && c[3]! > 200;
/** Ctrl+V on this tab's canvas with `text` on the clipboard. */
const paste = (text: string) => {
  const data = new DataTransfer(); data.setData('text/plain', text);
  document.querySelector('#canvas')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
};
const open = async (w: number, h: number, workspace: 'draw' | 'motion') => {
  const p = new Project(w, h); app.loadProject(p); app.setWorkspace(workspace); await wait(120); return p;
};

type Peer = {
  app: App; errors: string[];
  share: (kind: 'frames', token: string | null, body?: Promise<unknown>) => void;
  source(workspace: 'draw' | 'motion', w?: number, h?: number): Promise<Project>;
  copyFrames(): { text: string; types: string[] };
  copyLayer(): { text: string; types: string[] };
  caption(): void; movie(): void;
  many(n: number): Promise<{ text: string; types: string[] }>;
};
let frame: HTMLIFrameElement | null = null;
const peerErrors: string[] = [];
const openPeer = async (): Promise<Peer> => {
  frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:480px;height:320px;opacity:.01;pointer-events:none';
  frame.src = '_crosstabpeer.html';
  document.body.append(frame);
  await until(() => frame!.contentDocument?.body?.dataset.ready === '1', 15000);
  return (frame.contentWindow as unknown as { peer: Peer }).peer;
};
const closePeer = (peer: Peer) => { peerErrors.push(...peer.errors); frame?.remove(); frame = null; };
const ready = (text: string) => until(async () => { const h = await readHead(); return h?.token === text && h.state === 'ready'; });

let peer = await openPeer();

await check('Frames copied in the other tab paste here as new drawings (red, blue), in one Undo step', async () => {
  await peer.source('draw');
  const { text, types } = peer.copyFrames();
  expect(/^2Dope clipboard [0-9a-f-]{36}$/.test(text) && types.join() === 'text/plain', `the clipboard should hold only the token (${types.join()})`);
  const b = await open(320, 180, 'draw');
  await paint(app.drawing, '#00ff00', 40, 40); // this tab's own d1 shares the peer's id
  paste(text); await until(() => b.exposures.length === 3);
  const [x, y] = b.exposures.slice(1).map(e => b.drawing(e.drawing));
  expect(red(await colourAt(x!, 50, 50)) && blue(await colourAt(y!, 50, 50)), 'wrong pictures');
  expect(!red(await colourAt(b.drawing(b.exposures[0]!.drawing), 50, 50)), 'this tab’s own first frame changed');
  app.history.undo(); await wait();
  expect(b.exposures.length === 1, 'one Undo did not remove the pasted frames');
});

await check('Into a project of another size the frames are centred, with the size notice', async () => {
  const { text } = peer.copyFrames(); await ready(text);
  const c = await open(400, 240, 'draw'); notices.length = 0;
  paste(text); await until(() => c.exposures.length === 3);
  const d = c.drawing(c.exposures[1]!.drawing);
  expect(red(await colourAt(d, 90, 80)) && !red(await colourAt(d, 50, 50)), 'not centred (offset 40, 30)');
  expect(notices.some(n => n.includes('320×180') && n.includes('centred')), 'no size notice');
});

await check('X-sheet Copy (no clipboard text) in the other tab: this tab’s Paste command takes it; a copy here afterwards wins again', async () => {
  peer.app.setSelection([1]); peer.app.copySelection(); // the X-sheet's Ctrl+C and the frame menu call this directly
  const e = await open(320, 180, 'draw');
  await until(async () => (await readHead())?.state === 'ready');
  await app.paste(); await until(() => e.exposures.length === 2);
  expect(blue(await colourAt(e.drawing(e.exposures[1]!.drawing), 50, 50)), 'did not paste the other tab’s blue frame');
  app.setSelection([0]); app.copySelection(); await app.paste(); await wait();
  expect(e.exposures.length === 3 && e.exposures[1]!.drawing === e.exposures[0]!.drawing, 'same-tab paste no longer shows the same drawing');
});

await check('A drawing layer copied in the other tab’s Motion pastes here with its drawings; Undo removes it', async () => {
  await peer.source('motion');
  const { text } = peer.copyLayer();
  const d = await open(320, 180, 'motion'); const before = d.comp.layers.length; notices.length = 0;
  paste(text); await until(() => d.comp.layers.length === before + 1);
  const l = d.comp.layers.find(x => x.kind === 'drawings' && x.exposures.length === 2);
  expect(l?.kind === 'drawings', 'no pasted layer with two frames');
  if (l?.kind !== 'drawings') return;
  const [x, y] = l.exposures.map(e => d.drawing(e.drawing));
  expect(red(await colourAt(x!, 50, 50)) && blue(await colourAt(y!, 50, 50)), 'wrong pictures');
  expect(notices.some(n => n.includes('from another project')), 'no notice');
  app.history.undo(); await wait();
  expect(d.comp.layers.length === before, 'Undo did not remove the layer');
});

await check('A caption from the other tab brings its custom font, renamed on a clash', async () => {
  peer.caption();
  const { text } = peer.copyLayer();
  const f = await open(320, 180, 'motion');
  f.fonts.set('f1', { name: 'Other', path: 'fonts/other.woff2', bytes: new Uint8Array([9]) });
  const before = f.comp.layers.length;
  paste(text); await until(() => f.comp.layers.length === before + 1);
  const cap = f.comp.layers.find(x => x.kind === 'drawings' && x.caption);
  const font = cap?.kind === 'drawings' ? cap.caption!.font : '';
  expect(font.startsWith('custom:') && font !== 'custom:f1' && f.fonts.get(font.slice(7))?.path === 'fonts/hand.woff2' && f.fonts.get('f1')?.name === 'Other', `font not carried under a fresh id (${font})`);
});

await check('A movie layer from the other tab is refused with the same message', async () => {
  await peer.source('motion'); peer.movie();
  const { text } = peer.copyLayer(); await ready(text);
  const g = await open(320, 180, 'motion'); const before = g.comp.layers.length; notices.length = 0;
  paste(text); await wait(400);
  expect(g.comp.layers.length === before && notices.some(n => n.startsWith('Movie layers need their movie file')), `pasted or no message (${notices.join(' | ')})`);
});

await check('More than 240 drawings: the other tab’s copy is refused as today (“could not be copied”)', async () => {
  const { text } = await peer.many(241);
  const h = await open(320, 180, 'draw'); notices.length = 0;
  paste(text); await until(() => notices.some(n => n.includes('could not be copied')));
  expect(h.exposures.length === 1, 'pasted something');
});

await check('A stale token (the other tab copied again since) says so and pastes nothing', async () => {
  await peer.source('draw');
  const first = peer.copyFrames().text;
  const second = peer.copyFrames().text; await ready(second);
  const k = await open(320, 180, 'draw'); notices.length = 0;
  paste(first); await until(() => notices.includes(messages.stale));
  expect(k.exposures.length === 1, 'pasted the newer copy for an old token');
  paste(second); await until(() => k.exposures.length === 3);
});

await check('Ordinary text on the clipboard is not taken for a 2Dope copy', async () => {
  const m = await open(320, 180, 'draw'); notices.length = 0;
  paste('hello'); await wait(200);
  expect(m.exposures.length === 1 && notices.some(n => n.startsWith('No supported artwork')), `unexpected (${notices.join(' | ')})`);
});

await check('Closing the other tab after its copy is ready: the copy still pastes', async () => {
  const { text } = peer.copyFrames(); await ready(text);
  closePeer(peer);
  const n = await open(320, 180, 'draw');
  paste(text); await until(() => n.exposures.length === 3);
  expect(red(await colourAt(n.drawing(n.exposures[1]!.drawing), 50, 50)), 'wrong picture');
});

await check('The other tab still encoding: paste waits, then times out with a clear message', async () => {
  peer = await openPeer();
  const text = '2Dope clipboard 00000000-0000-4000-8000-000000000001';
  peer.share('frames', text, new Promise(() => {})); // never finishes, as a frozen background tab
  await until(async () => (await readHead())?.token === text);
  crossTab.timeout = 500;
  const q = await open(320, 180, 'draw'); notices.length = 0;
  paste(text); await until(() => notices.includes(messages.timeout));
  expect(notices.includes(messages.waiting) && q.exposures.length === 1, 'no waiting notice, or pasted');
});

await check('The other tab closed before its copy was ready: a clear message', async () => {
  closePeer(peer);
  crossTab.timeout = 5000;
  const text = '2Dope clipboard 00000000-0000-4000-8000-000000000001';
  const r = await open(320, 180, 'draw'); notices.length = 0;
  paste(text); await until(() => notices.includes(messages.closed));
  expect(r.exposures.length === 1, 'pasted');
});

await check('No page errors in either tab', () => expect(!errors.length && !peerErrors.length, [...errors, ...peerErrors].join('; ')));
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app };
