import type { ArtworkPackage } from '../io/artwork';
import { mainLength } from '../io/schema';
import { ArtworkPreviewSession } from '../view/artworkpreview';

/** Saved animation preview has its own clock and never inserts artwork or changes the editor. */
export function showArtworkPreview(bundle: ArtworkPackage, name: string, opener: HTMLElement): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'asset-preview-dialog'; dialog.setAttribute('aria-label', `Preview ${name}`);
  const head = document.createElement('header'); head.className = 'artwork-head';
  const title = document.createElement('h2'); title.textContent = name;
  const close = document.createElement('button'); close.textContent = 'Done'; close.type = 'button'; close.setAttribute('aria-label', 'Close asset preview'); head.append(title, close);
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; canvas.className = 'asset-preview-canvas'; canvas.setAttribute('aria-label', `Saved artwork ${name}`);
  const comp = bundle.file.comps[bundle.file.main]!, frames = mainLength(bundle.file), fps = comp.fps;
  const info = document.createElement('p'); info.className = 'artwork-note'; info.textContent = `${bundle.file.canvas.width}×${bundle.file.canvas.height} · ${comp.layers.length} layers · ${frames} frames · ${fps} fps · ${(frames / fps).toFixed(2)} s`;
  const controls = document.createElement('div'); controls.className = 'asset-preview-controls';
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play'; play.disabled = frames <= 1;
  const seek = document.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = String(frames - 1); seek.value = '0'; seek.setAttribute('aria-label', 'Asset preview frame');
  const readout = document.createElement('output'); readout.textContent = `1 / ${frames}`;
  const status = document.createElement('p'); status.className = 'artwork-note'; status.setAttribute('role', 'status');
  controls.append(play, seek, readout); dialog.append(head, canvas, info, controls, status); document.body.append(dialog); dialog.showModal();
  const session = new ArtworkPreviewSession(bundle, canvas);
  let frame = 0, playing = false, timer = 0, closed = false, started = 0, startFrame = 0, playSerial = 0;
  const pause = () => { playing = false; playSerial++; clearTimeout(timer); play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); };
  const paint = async () => {
    status.textContent = 'Loading frame…';
    try { if (await session.render(frame)) { seek.value = String(frame); readout.textContent = `${frame + 1} / ${frames}`; status.textContent = ''; } }
    catch (e) { pause(); status.textContent = `Preview unavailable: ${e instanceof Error ? e.message : String(e)}`; }
  };
  const tick = async (serial: number) => {
    if (serial !== playSerial || closed) return;
    const start = performance.now(); frame = (startFrame + Math.floor((start - started) * fps / 1000)) % frames;
    await paint();
    if (playing && !closed && serial === playSerial) timer = window.setTimeout(() => void tick(serial), Math.max(16, 1000 / fps - (performance.now() - start)));
  };
  play.addEventListener('click', () => { if (playing) pause(); else { playing = true; started = performance.now(); startFrame = frame; play.textContent = 'Pause'; play.setAttribute('aria-pressed', 'true'); void tick(++playSerial); } });
  seek.addEventListener('input', () => { pause(); frame = Number(seek.value); void paint(); });
  const dismiss = () => { if (closed) return; closed = true; pause(); session.close(); dialog.close(); dialog.remove(); if (opener.isConnected) opener.focus(); };
  close.addEventListener('click', dismiss); dialog.addEventListener('cancel', e => { e.preventDefault(); dismiss(); });
  dialog.addEventListener('keydown', e => e.stopPropagation()); dialog.addEventListener('keyup', e => e.stopPropagation());
  dialog.addEventListener('close', dismiss); void paint(); return dismiss;
}
