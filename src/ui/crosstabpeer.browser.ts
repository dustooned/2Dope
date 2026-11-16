/** The "other tab" of the crosstab fixture: its own 2Dope (own module instances, own tab id) in a same-origin iframe. */
import { App } from '../app';
import { Project, type Drawing } from '../core/project';
import { defaultCaption } from '../lettering/spec';
import { share } from '../io/crosstab';
import { installClipboard } from './clipboard';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
installClipboard(app, document.querySelector<HTMLElement>('#stage')!, async () => {});
const errors: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const paint = async (d: Drawing, colour: string, x: number, y: number) => {
  await app.residency.ensure(d);
  const g = d.line.getContext('2d')!; g.fillStyle = colour; g.fillRect(x, y, 20, 20); d.rev++;
};
/** Dispatch copy on a target and return the text it put on the clipboard (and every type it set). */
const clip = (target: Element) => {
  const e = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return { text: e.clipboardData!.getData('text/plain'), types: [...e.clipboardData!.types] };
};

const peer = {
  app, errors, share,
  /** A 320×180 project (or w×h) with two frames, red then blue. */
  async source(workspace: 'draw' | 'motion', w = 320, h = 180) {
    const p = new Project(w, h); p.name = 'Peer';
    app.loadProject(p); app.setWorkspace('draw'); await wait(120);
    await paint(app.drawing, '#ff0000', 40, 40);
    app.addFrame(); await wait();
    await paint(app.drawing, '#0000ff', 40, 40);
    app.setWorkspace(workspace); await wait(60);
    return p;
  },
  /** Ctrl+C on the frame strip with both frames selected. */
  copyFrames() { app.setSelection([0, 1]); return clip(document.querySelector('#strip')!); },
  async paintedFrame() {
    app.loadProject(new Project(320, 180)); app.setWorkspace('draw');
    app.addFlipTrack(true);
    await paint(app.drawing, '#ff0000', 40, 40);
    app.addPaintLayer();
    await paint(app.drawing, '#0000ff', 70, 70);
    app.setSelection([0]);
    return clip(document.querySelector('#strip')!);
  },
  /** Ctrl+C on the selected layer in Motion. */
  copyLayer() { app.editor.select(app.project.layer.id); return clip(document.querySelector('#canvas')!); },
  caption() {
    const p = app.project, id = p.layer.id;
    p.fonts.set('f1', { name: 'Hand', path: 'fonts/hand.woff2', bytes: new Uint8Array([1, 2, 3]) });
    app.editor.edit('cap', c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') { x.name = 'Balloon'; x.caption = { ...defaultCaption(160, 60), text: 'Hi', font: 'custom:f1' }; } });
  },
  movie() {
    const id = app.project.layer.id;
    app.editor.edit('movie', c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') x.video = { v: 1, asset: 'm1', offset: 0, sound: null, volume: 1 } as never; });
  },
  async many(n: number) {
    const p = new Project(64, 36); app.loadProject(p); app.setWorkspace('draw'); await wait(120);
    for (let i = 1; i < n; i++) app.addFrame();
    app.setSelection(p.exposures.map((_, i) => i));
    return clip(document.querySelector('#strip')!);
  },
};
(window as unknown as { peer: typeof peer }).peer = peer;
document.body.dataset.ready = '1';
