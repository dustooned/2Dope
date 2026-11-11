import type { App } from '../app';
import { frameContent, type Layer } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { canPasteMedia } from './media';

const TEXT = 'text/plain';
const SVG = 'image/svg+xml';
const PNG = 'image/png';
const editable = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const timeline = '#strip, #motion, #board, #tab-xsheet, .flip-row';

type InternalCopy =
  | { kind: 'art' }
  | { kind: 'frames'; project: WeakRef<Project> }
  | { kind: 'layers'; project: WeakRef<Project>; comp: string; layers: Layer[] }
  | { kind: 'keys' };

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    canvas.width = 0;
    if (blob) resolve(blob);
    else reject(new Error('Could not make a PNG.'));
  }, PNG));
}

function mediaFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files);
  if (!files.length) {
    for (const item of data.items) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  const svg = data.getData(SVG);
  if (svg && !files.some(canPasteMedia)) files.unshift(new File([svg], 'Pasted vector.svg', { type: SVG }));
  return files;
}

export function installClipboard(app: App, stage: HTMLElement, importAssets: (files: File[], frame: number) => Promise<void>): void {
  const canvas = stage.querySelector('#canvas');
  let internal: InternalCopy | null = null;
  let token = '';
  let imageWrite = 0;
  let timelineFocused = false;
  const notice = (message: string) => app.onNotice?.(message);
  const blocked = () => !!document.querySelector('dialog[open]') || document.body.matches('.gallery-open, .share-open, .presenting');
  const accepts = (e: Event) => !e.defaultPrevented && !blocked() && !(e.target instanceof Element && e.target.closest(editable));
  const editing = () => app.strokeActive || app.transforming || app.adjusting || app.editor.dragging;

  document.addEventListener('pointerdown', e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(timeline)) timelineFocused = true;
    else if (e.target === canvas) timelineFocused = false;
  }, true);

  const pasteInternal = () => {
    if (editing() || app.playing) { notice('Finish the current edit before pasting.'); return; }
    if (internal?.kind === 'art') {
      if (app.workspace === 'draw' || app.workspace === 'animate') app.pasteArt();
      else notice('Open a drawing in Draw or Animate to paste this selection.');
    } else if (internal?.kind === 'frames') {
      if (internal.project.deref() === app.project && app.workspace !== 'motion' && !app.arrangingAssets) void app.paste(true);
      else notice('Open a drawing timeline in the original project to paste these frames.');
    } else if (internal?.kind === 'layers') {
      if (internal.project.deref() !== app.project || !app.editor.pasteLayers(internal.layers, internal.comp))
        notice('These layers could not be pasted into this composition.');
      else notice(internal.layers.length === 1 ? `Pasted “${internal.layers[0]!.name}” as a new layer.` : `Pasted ${internal.layers.length} layers.`);
    } else if (internal?.kind === 'keys') {
      if (app.workspace !== 'motion') notice('Open Motion and select a layer to paste these keyframes.');
      else if (!app.editor.selected.length) notice('Select the layer to paste the keyframes on.');
      else { const n = app.editor.pasteKeys(); notice(n ? `Pasted ${n} key${n === 1 ? '' : 's'} at the playhead.` : 'This layer has none of those properties.'); }
    }
  };

  const placeFiles = (files: File[], frame = app.frame) => {
    const supported = files.filter(canPasteMedia);
    if (supported.length && !editing()) void importAssets(supported, frame);
    else if (supported.length) notice('Finish the current edit before pasting.');
    else notice('No supported artwork on the clipboard. Try importing the original file.');
  };

  const writeImage = (blob: () => Promise<Blob>, marker?: string) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      if (!marker) notice('Image copy is unavailable here. Use Share → Picture to export a PNG.');
      return;
    }
    const generation = ++imageWrite;
    const image = blob().then(value => {
      if (imageWrite !== generation) throw new Error('A newer clipboard copy is ready.');
      return value;
    });
    void image.catch(() => {}); // The API can reject before it reads the PNG promise.
    const types: Record<string, Blob | Promise<Blob>> = { [PNG]: image };
    if (marker) types[TEXT] = new Blob([marker], { type: TEXT });
    void (async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem(types)]);
        if (!marker) notice('Copied the visible frame as a PNG.');
      } catch {
        if (!marker) notice('The browser blocked image copy. Use Share → Picture to export a PNG.');
      }
    })();
  };

  app.copyVisible = () => {
    if (blocked() || editing()) return;
    const project = app.project, comp = project.comp, frame = app.frame;
    writeImage(async () => {
      const pinned: Drawing[] = [];
      try {
        for (const id of frameContent(project.comps, comp.id, frame).drawings) {
          const d = project.drawings.get(id);
          if (!d) continue;
          pinned.push(d);
          await app.residency.pin(d);
          if (app.project !== project || project.comp !== comp) throw new Error('The composition changed.');
        }
        const image = document.createElement('canvas');
        image.width = comp.width; image.height = comp.height;
        drawComp(image.getContext('2d')!, project, comp, frame, { export: true, camera: true });
        return await png(image);
      } finally {
        for (const d of pinned) app.residency.unpin(d);
        releaseScratch();
      }
    });
  };

  const copy = (e: ClipboardEvent, cut: boolean) => {
    const data = e.clipboardData;
    if (!data || !accepts(e) || app.strokeActive || app.playing || app.adjusting || app.editor.dragging) return;
    const painting = app.workspace === 'draw' || app.workspace === 'animate';
    const onTimeline = e.target instanceof Element && e.target.closest(timeline);
    // a layer that is not paint (a caption, a movie, a title, a clip): copy the layer itself, from any workspace
    const active = app.project.comp.layers.find(l => l.id === app.project.activeLayer);
    const whole = painting && !onTimeline && !app.spatialSelection && !!active && (active.kind !== 'drawings' || !!active.caption || !!active.video || !!active.title);
    if (app.workspace === 'motion' && !cut && app.editor.keys.size && app.editor.copyKeys()) {
      internal = { kind: 'keys' };
    } else if (whole && active) {
      if (cut && active.locked) return;
      internal = { kind: 'layers', project: new WeakRef(app.project), comp: app.project.activeComp, layers: structuredClone([active]) };
      if (cut) app.editor.deleteLayers([active.id]);
    } else if (painting && !onTimeline && (!timelineFocused || e.target === canvas) && !app.spatialSelection && !app.copyWholeDrawing()) {
      return;
    } else if (painting && !onTimeline && (!timelineFocused || e.target === canvas) && !app.spatialSelection) {
      // nothing selected on the canvas: the whole drawing was copied (paste it on any drawing)
      if (cut) { if (app.project.layer.locked) return; app.selectCanvas(); app.deleteSelectedArt('Cut'); app.clearSpatialSelection(); }
      internal = { kind: 'art' };
    } else if (app.workspace === 'motion' || app.arrangingAssets) {
      const layers = app.project.comp.layers.filter(l => app.editor.selected.includes(l.id));
      if (!layers.length || cut && layers.some(l => l.locked && l.id !== app.placedAsset?.id)) return;
      internal = { kind: 'layers', project: new WeakRef(app.project), comp: app.project.activeComp, layers: structuredClone(layers) };
      if (cut) app.editor.deleteLayers(layers.map(l => l.id));
    } else if (painting && !onTimeline && (!timelineFocused || e.target === canvas) && app.spatialSelection) {
      if (cut && app.project.layer.locked) return;
      if (!app.copyArt()) return;
      if (cut) app.deleteSelectedArt('Cut');
      internal = { kind: 'art' };
    } else {
      if (!app.copySelection()) return;
      if (cut) app.cutSelection();
      internal = { kind: 'frames', project: new WeakRef(app.project) };
    }
    token = `2Dope clipboard ${crypto.randomUUID()}`;
    e.preventDefault();
    data.setData(TEXT, token);
    if (internal.kind === 'art') writeImage(() => {
      const image = app.clipboardArtwork();
      return image ? png(image) : Promise.reject(new Error('The artwork selection changed.'));
    }, token);
    else {
      imageWrite++;
      notice(internal.kind === 'frames' ? 'Copied timeline frames.' : internal.kind === 'keys' ? 'Copied keyframes. Select a layer, move the playhead and paste.' : internal.layers.length === 1 ? `Copied the layer “${internal.layers[0]!.name}”. Paste makes a new one.` : 'Copied selected layers.');
    }
  };

  document.addEventListener('copy', e => copy(e, false));
  document.addEventListener('cut', e => copy(e, true));
  document.addEventListener('paste', e => {
    if (!e.clipboardData || !accepts(e)) return;
    if (internal && e.clipboardData.getData(TEXT) === token) {
      e.preventDefault();
      pasteInternal();
      return;
    }
    const files = mediaFiles(e.clipboardData);
    if (!files.length && !e.clipboardData.getData(TEXT)) return;
    e.preventDefault();
    placeFiles(files);
  });

  app.pasteMedia = () => {
    if (blocked() || editing()) return;
    if (!navigator.clipboard?.read) { app.focusCanvas(); notice('Use your system Paste shortcut, or choose Import File.'); return; }
    const project = app.project, comp = project.activeComp, frame = app.frame;
    void (async () => {
      const files: File[] = [];
      try {
        for (const item of await navigator.clipboard.read()) {
          if (internal && item.types.includes(TEXT) && await (await item.getType(TEXT)).text() === token) {
            if (app.project === project && project.activeComp === comp && !blocked()) pasteInternal();
            return;
          }
          const preferred = [SVG, 'image/gif', ...item.types].find(type => item.types.includes(type) && canPasteMedia(new File([], '', { type })));
          if (!preferred) continue;
          const blob = await item.getType(preferred);
          files.push(new File([blob], 'Pasted artwork', { type: preferred }));
        }
        if (app.project === project && project.activeComp === comp && !blocked()) placeFiles(files, frame);
      } catch {
        app.focusCanvas();
        notice('Use your system Paste shortcut, or choose Import File.');
      }
    })();
  };

  stage.addEventListener('dragover', e => {
    if (!blocked() && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  stage.addEventListener('drop', e => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    if (!blocked()) placeFiles(mediaFiles(e.dataTransfer));
  });
}
