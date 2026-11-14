/** Copy in one project, paste in another: frames and layers bring their own drawings (and caption fonts). */
import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import { defaultCaption } from '../lettering/spec';
import { installClipboard } from './clipboard';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
installClipboard(app, document.querySelector<HTMLElement>('#stage')!, async () => {});
const errors: string[] = [], notices: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.onNotice = m => { notices.push(m); };
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const until = async (test: () => boolean) => { const end = performance.now() + 5000; while (!test()) { if (performance.now() > end) throw new Error('Timed out'); await wait(30); } };
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
const clip = (type: 'copy' | 'paste') => { const e = new ClipboardEvent(type, { clipboardData: lastData ?? new DataTransfer(), bubbles: true, cancelable: true }); if (type === 'copy') lastData = e.clipboardData; document.querySelector<HTMLCanvasElement>('#canvas')!.dispatchEvent(e); };
let lastData: DataTransfer | null = null;

// A source project with two frames, red then blue (a closed project's canvases are handed back,
// so each test opens a fresh one, as the app does when it loads a project from storage)
const source = async (workspace: 'draw' | 'motion') => {
  const p = new Project(320, 180); p.name = 'Source';
  app.loadProject(p); app.setWorkspace('draw'); await wait(120);
  await paint(app.drawing, '#ff0000', 40, 40);
  app.addFrame(); await wait();
  await paint(app.drawing, '#0000ff', 40, 40);
  app.setWorkspace(workspace); await wait(60);
  return p;
};
const a = await source('draw');
const aIds = a.exposures.map(e => e.drawing);

await check('Copying frames, then opening another project, pastes copies of those frames (not the new project’s drawings with the same ids)', async () => {
  app.setSelection([0, 1]); expect(app.copySelection() === 2, 'copy');
  const b = new Project(320, 180); b.name = 'B';
  app.loadProject(b); app.setWorkspace('draw'); await wait(120);
  expect(b.drawings.has(aIds[0]!), 'test setup: B should reuse A’s first drawing id');
  await paint(app.drawing, '#00ff00', 40, 40); // B's own d1 is green
  await app.paste(); await until(() => b.exposures.length === 3);
  const pasted = b.exposures.slice(1).map(e => b.drawing(e.drawing));
  expect(pasted.every(d => !aIds.includes(d.id) || d !== a.drawings.get(d.id)), 'pasted A’s drawing objects');
  expect(red(await colourAt(pasted[0]!, 50, 50)) && blue(await colourAt(pasted[1]!, 50, 50)), 'pasted the wrong pictures');
  expect(!red(await colourAt(b.drawing(b.exposures[0]!.drawing), 50, 50)), 'B’s own first frame changed');
  app.history.undo(); await wait();
  expect(b.exposures.length === 1, 'one Undo did not remove the pasted frames');
});

await check('Pasting into a project of another size centres the frames at the same pixel size', async () => {
  const c = new Project(400, 240); c.name = 'C';
  app.loadProject(c); app.setWorkspace('draw'); await wait(120);
  notices.length = 0;
  await app.paste(); await until(() => c.exposures.length === 3);
  const d = c.drawing(c.exposures[1]!.drawing);
  expect(d.line.width === 400 && red(await colourAt(d, 40 + 40 + 10, 40 + 30 + 10)) && !red(await colourAt(d, 50, 50)), 'not centred (offset 40, 30)');
  expect(notices.some(n => n.includes('320×180') && n.includes('centred')), 'no notice about the size');
});

await check('A drawing layer copied in Motion pastes into another project with its own drawings', async () => {
  const src = await source('motion');
  app.editor.select(src.layer.id); clip('copy'); await wait(200);
  const d = new Project(320, 180); d.name = 'D';
  app.loadProject(d); app.setWorkspace('motion'); await wait(120);
  const before = d.comp.layers.length;
  clip('paste'); await until(() => d.comp.layers.length === before + 1);
  const l = d.comp.layers.find(x => x.kind === 'drawings' && x.exposures.length === 2);
  expect(l && l.kind === 'drawings', 'no pasted layer with two frames');
  if (l?.kind !== 'drawings') return;
  const [x, y] = l.exposures.map(e => d.drawing(e.drawing));
  expect(red(await colourAt(x!, 50, 50)) && blue(await colourAt(y!, 50, 50)), 'pasted layer shows the wrong pictures');
  expect(notices.some(n => n.includes('from another project')), 'no notice');
  app.history.undo(); await wait();
  expect(d.comp.layers.length === before, 'Undo did not remove the pasted layer');
});

await check('A caption copied in another project brings its custom font', async () => {
  const e = new Project(320, 180); e.name = 'E';
  e.fonts.set('f1', { name: 'Hand', path: 'fonts/hand.woff2', bytes: new Uint8Array([1, 2, 3]) });
  app.loadProject(e); app.setWorkspace('motion'); await wait(120);
  const id = e.layer.id;
  app.editor.edit('cap', c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') { x.name = 'Balloon'; x.caption = { ...defaultCaption(160, 60), text: 'Hi', font: 'custom:f1' }; } });
  app.editor.select(id); clip('copy'); await wait(200);
  const f = new Project(320, 180); f.name = 'F';
  f.fonts.set('f1', { name: 'Other', path: 'fonts/other.woff2', bytes: new Uint8Array([9]) });
  app.loadProject(f); app.setWorkspace('motion'); await wait(120);
  const before = f.comp.layers.length;
  clip('paste'); await until(() => f.comp.layers.length === before + 1);
  const cap = f.comp.layers.find(x => x.kind === 'drawings' && x.caption);
  const font = cap?.kind === 'drawings' ? cap.caption!.font : '';
  expect(font.startsWith('custom:') && font !== 'custom:f1' && f.fonts.get(font.slice(7))?.path === 'fonts/hand.woff2' && f.fonts.get('f1')?.name === 'Other', `font not carried under a fresh id (${font})`);
});

await check('A movie layer from another project explains how to move it instead', async () => {
  const g = new Project(320, 180); g.name = 'G';
  app.loadProject(g); app.setWorkspace('motion'); await wait(120);
  const id = g.layer.id;
  app.editor.edit('movie', c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') x.video = { v: 1, asset: 'm1', offset: 0, sound: null, volume: 1 } as never; });
  app.editor.select(id); clip('copy'); await wait(200);
  const h = new Project(320, 180);
  app.loadProject(h); app.setWorkspace('motion'); await wait(120);
  notices.length = 0; const before = h.comp.layers.length;
  clip('paste'); await wait(300);
  expect(h.comp.layers.length === before && notices.some(n => n.includes('movie')), 'movie layer pasted or no explanation');
});

await check('Copying and pasting frames inside one project still shows the same drawings', async () => {
  const src = await source('draw');
  app.setSelection([0]); app.copySelection();
  await app.paste(); await wait();
  expect(src.exposures.length === 3 && src.exposures[1]!.drawing === src.exposures[0]!.drawing, 'same-project paste changed');
  app.history.undo(); await wait();
});

await check('No page errors', () => expect(!errors.length, errors.join('; ')));
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
export { app };
