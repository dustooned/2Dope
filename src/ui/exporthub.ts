import type { App } from '../app';
import { exportGif, planGif } from '../io/exportgif';
import { sanitizeName } from '../io/exportplan';

export function openExportHub(app: App, actions: { video(): void; sequence(): void; backup(): void; blender(): void; board(): void }): void {
  if (app.strokeActive) { app.onNotice?.('Finish the stroke before exporting.'); return; }
  if (app.playing) app.togglePlay();
  const d = document.createElement('dialog');
  d.className = 'export-hub'; d.setAttribute('aria-label', 'Export and finish'); d.setAttribute('data-own-keys', '');
  let abort: AbortController | null = null, url: string | null = null;
  const add = (tag: string, text: string) => { const e = document.createElement(tag); e.textContent = text; d.append(e); return e; };
  const button = (label: string, run: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', run); d.append(b); return b;
  };
  const launch = (run: () => void) => () => { d.close(); run(); };
  const close = () => abort ? abort.abort() : d.close();
  d.addEventListener('cancel', e => { e.preventDefault(); close(); });
  d.addEventListener('close', () => { abort?.abort(); if (url) URL.revokeObjectURL(url); d.remove(); });
  add('h2', 'Export and finish');
  add('p', 'Choose a copy to share, continue editing elsewhere, or keep as a backup.');
  button('Video · MP4 / WebM with audio', launch(actions.video));
  button('Looping GIF · silent animation', () => {
    d.replaceChildren(); add('h2', 'Looping GIF');
    add('p', 'Whole main shot · white background · simplified 256 colours · no audio. Up to 15 seconds, 12 fps and ' + (app.device.lite ? '320' : '480') + ' px on the longest side. Use PNG for full colour and transparency.');
    const status = add('p', ''); status.setAttribute('role', 'status');
    const go = button('Make GIF', () => void run());
    const cancel = button('Close', close);
    try { const p = planGif(app.project, app.device.lite); status.textContent = `${p.width} × ${p.height} · ${p.duration.toFixed(2)} seconds · ${p.samples} frames`; }
    catch (e) { status.textContent = (e as Error).message; go.disabled = true; }
    async function run() {
      if (abort) return;
      const controller = new AbortController(); abort = controller; go.disabled = true; cancel.textContent = 'Cancel';
      try {
        const blob = await exportGif(app.project, app.device.lite, controller.signal, app.residency, (n, total) => { status.textContent = `Making GIF: ${n} of ${total}`; });
        if (controller.signal.aborted || !d.open) return;
        url = URL.createObjectURL(blob);
        d.replaceChildren(); add('h2', 'GIF ready');
        const img = document.createElement('img'); img.src = url; img.alt = 'Exported looping GIF preview'; d.append(img);
        add('p', `${(blob.size / 1024 / 1024).toFixed(2)} MB · silent loop`);
        const save = document.createElement('a'); save.href = url; save.download = `${sanitizeName(app.project.name)}.gif`; save.className = 'video-save'; save.textContent = 'Save GIF'; d.append(save);
        button('Close', () => d.close()); save.focus();
      } catch (e) {
        status.textContent = controller.signal.aborted ? 'GIF cancelled. You can try again.' : `Could not export: ${(e as Error).message}`;
        go.disabled = false; cancel.textContent = 'Close';
      } finally { abort = null; }
    }
  });
  button('PNG sequence · separate Line / Fill / Matte passes', launch(actions.sequence));
  button('Current frame · transparent PNG', launch(() => void app.exportPNG()));
  const board = button('Storyboard · PDF / panel images', launch(actions.board));
  board.disabled = !app.board;
  if (!app.board) board.title = 'Start a storyboard in Board first.';
  button('Blender · editable scene package', launch(actions.blender));
  button('Project backup · editable .2dope', launch(actions.backup));
  button('Close', close);
  document.body.append(d); d.showModal();
}
