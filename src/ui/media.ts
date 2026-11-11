import type { App } from '../app';
import type { BlendMode } from '../core/comp';
import { decodeGif, gifHolds } from '../io/gifdecode';
import { readOra } from '../io/ora';
import { readPsd } from '../io/psd';
import type { AudioTracks } from './audiotracks';
import { importVectorDocument } from '../io/vectorimport';

/** What the media picker offers: pictures (also animated GIFs and layered PSD / OpenRaster), movies and sounds. */
export const MEDIA_ACCEPT = 'image/*,video/*,audio/*,.svg,.eps,.psd,.ora,.gif,.mov,.mp4,.m4v,.webm,.wav,.mp3,.m4a,.aac,.ogg,.flac';
const ASSET_ACCEPT = `${MEDIA_ACCEPT},.2dope`;

type Kind = 'picture' | 'vector' | 'gif' | 'layered' | 'movie' | 'sound';

export function mediaKind(name: string, type: string): Kind | null {
  if (/\.(svg|eps)$/i.test(name) || type === 'image/svg+xml' || type === 'application/postscript') return 'vector';
  if (/\.(psd|ora)$/i.test(name) || type === 'image/vnd.adobe.photoshop' || type === 'image/openraster') return 'layered';
  if (type === 'image/gif' || /\.gif$/i.test(name)) return 'gif';
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(name)) return 'picture';
  if (type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(name)) return 'movie';
  if (type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(name)) return 'sound';
  return null;
}

/**
 * One picker for everything you bring in (Procreate Dreams style): each picture, movie or sound
 * becomes its own track on the timeline from frame 1. A picture is an object layer for the whole
 * shot, a movie is a layer of frames (plus its sound, when it has one), a sound is a clip.
 */
export function mediaPicker(app: App, audio: AudioTracks) {
  let input: HTMLInputElement | null = null;
  let assetPick = false;
  let busy = false;
  const bring = async (files: File[], assetFrame?: number) => {
    if (busy || app.strokeActive) { app.onNotice?.('Finish the current edit or import first.'); return; }
    if (assetFrame !== undefined && app.playing) app.togglePlay();
    const project = app.project, comp = project.comp;
    const checkTarget = () => {
      if (app.project !== project || project.comp !== comp || app.strokeActive || (assetFrame !== undefined && app.playing))
        throw new Error('The timeline changed while importing. Try again.');
    };
    busy = true;
    try {
      for (const f of files) {
        try { checkTarget(); } catch (e) { app.onNotice?.((e as Error).message); break; }
        if (/\.2dope$/i.test(f.name) && app.importAssetArchive) {
          try { await app.importAssetArchive(f, assetFrame ?? app.frame); }
          catch (e) { app.onNotice?.(`${f.name}: ${(e as Error).message}`); }
          continue;
        }
        if (assetFrame !== undefined && !canPasteMedia(f)) { app.onNotice?.(`${f.name}: use Import media for this file.`); continue; }
        const kind = mediaKind(f.name, f.type);
        if (kind === 'vector') {
          try {
            const doc = importVectorDocument(await f.text(), /\.eps$/i.test(f.name) || f.type === 'application/postscript');
            checkTarget();
            app.importVectors(f.name, doc, assetFrame);
            if (assetFrame === undefined) app.onNotice?.(`${f.name}: ${doc.strokes.length} scalable vector paths. Arrange in Motion; Rasterize imported vectors in the Vector tools enables pixel painting.`);
          } catch (e) { app.onNotice?.(`${f.name}: ${e instanceof Error ? e.message : 'could not be read'}.`); }
          continue;
        }
        if (kind === 'gif') {
          // an animated GIF comes in frame by frame (its holds kept); one frame is a picture
          try {
            const budget = (app.device.lite ? 12 : 32) * 1024 * 1024;
            const g = decodeGif(new Uint8Array(await f.arrayBuffer()), assetFrame === undefined ? Infinity : budget);
            checkTarget();
            if (g.frames.length > 1) {
              const frames = g.frames.map((fr) => pictureOf(fr.rgba, g.width, g.height));
              try { app.importAnimation(f.name, frames, g.width, g.height, gifHolds(g.frames.map((x) => x.delay), app.project.comp.fps), assetFrame); }
              finally { frames.forEach(canvas => { canvas.width = 0; }); }
              if (assetFrame === undefined) app.onNotice?.(`${f.name}: ${g.frames.length} frames on a new layer from frame 1, each held as long as in the GIF.`);
              continue;
            }
          } catch (e) {
            if (assetFrame !== undefined) { app.onNotice?.(`${f.name}: ${(e as Error).message}.`); continue; }
            // The legacy file picker also accepts GIFs the bitmap decoder can open as stills.
          }
        }
        if (kind === 'layered') {
          try {
            const bytes = new Uint8Array(await f.arrayBuffer());
            const doc = /\.ora$/i.test(f.name) || f.type === 'image/openraster' ? await oraLayers(bytes) : psdLayers(bytes);
            checkTarget();
            app.importLayered(f.name, doc.width, doc.height, doc.layers, doc.background, assetFrame);
            if (assetFrame === undefined) app.onNotice?.(`${f.name}: ${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'} as a paint stack${doc.background ? ' at the back' : ''}. Each keeps its name, opacity and blend.`);
          } catch (e) {
            app.onNotice?.(`${f.name}: ${e instanceof Error ? e.message : 'could not be read'}.`);
          }
          continue;
        }
        if (kind === 'picture' || kind === 'gif') {
          try {
            const picture = await decodePicture(f);
            try {
              checkTarget();
              app.importPicture(f.name, picture.source, picture.width, picture.height, assetFrame);
            } finally { picture.close(); }
            if (assetFrame === undefined) app.onNotice?.(`${f.name} is an object layer for the whole shot; transparent pixels stay transparent. View → Transparency grid shows them. Move or scale it in Motion.`);
          } catch (e) {
            app.onNotice?.(`${f.name}: ${(e as Error).message}.`);
          }
        } else if (kind === 'movie') {
          app.onNotice?.(`Bringing in ${f.name}…`);
          checkTarget();
          await app.importVideo(f, bytes => audio.movieSound(bytes, f.name), assetFrame);
        } else if (kind === 'sound') {
          if (assetFrame === undefined) await audio.import(f);
          else {
            try {
              const decoded = await audio.decodeAsset(f);
              checkTarget();
              app.importSoundAsset(f.name, decoded, assetFrame);
            } catch (e) { app.onNotice?.(`${f.name}: ${(e as Error).message}.`); }
          }
        } else app.onNotice?.(`${f.name}: not a picture, movie or sound.`);
      }
    } finally {
      busy = false;
    }
  };
  const open = (asset = false) => {
    if (busy) {
      app.onNotice?.('Still bringing in the last file…');
      return;
    }
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.hidden = true;
      input.addEventListener('change', () => {
        const files = [...(input!.files ?? [])];
        input!.value = '';
        if (files.length) void bring(files, assetPick ? app.frame : undefined);
      });
      document.body.append(input);
    }
    assetPick = asset;
    input.accept = asset ? ASSET_ACCEPT : MEDIA_ACCEPT;
    input.click();
  };
  return Object.assign(() => open(), { pickAssets: () => open(true), importAssets: (files: File[], frame: number) => bring(files, frame) });
}

export function canPasteMedia(file: File): boolean {
  if (/\.2dope$/i.test(file.name)) return true;
  return mediaKind(file.name, file.type) !== null;
}

/** Bitmap decoding can reject an otherwise readable PNG on a device. Both paths preserve alpha. */
export async function decodePicture(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file), image = new Image();
    try {
      image.src = url; await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch { URL.revokeObjectURL(url); throw new Error('This picture could not be decoded'); }
  }
}

/** Raw RGBA as something a canvas can draw. */
function pictureOf(rgba: Uint8ClampedArray, w: number, h: number, x = 0, y = 0, pw = w, ph = h): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const g = c.getContext('2d')!;
  if (pw === w && ph === h && !x && !y) g.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  else {
    // a layer smaller than the page, somewhere on it (possibly partly off it)
    const t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    g.drawImage(t, x, y);
    t.width = 0;
  }
  return c;
}

interface Layered { width: number; height: number; background: boolean; layers: { name: string; src: CanvasImageSource; opacity: number; visible: boolean; blend: BlendMode; clip: boolean }[] }

/** A layered picture whose bottom layer covers the page is a background: it goes to the back. */
function coversPage(c: HTMLCanvasElement): boolean {
  const s = 16;
  const t = document.createElement('canvas');
  t.width = s;
  t.height = s;
  const g = t.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data;
  let solid = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]! > 200) solid++;
  return solid / (s * s) > 0.9;
}

function psdLayers(bytes: Uint8Array): Layered {
  const doc = readPsd(bytes);
  const layers = doc.layers.map((l) => ({ name: l.name, src: pictureOf(l.rgba, l.width, l.height, l.left, l.top, doc.width, doc.height), opacity: l.opacity, visible: l.visible, blend: l.blend, clip: l.clip }));
  return { width: doc.width, height: doc.height, background: coversPage(layers[0]!.src), layers };
}

async function oraLayers(bytes: Uint8Array): Promise<Layered> {
  const doc = await readOra(bytes);
  const layers = [];
  for (const l of doc.layers) {
    const bmp = await createImageBitmap(new Blob([l.png as BlobPart], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = doc.width;
    c.height = doc.height;
    c.getContext('2d')!.drawImage(bmp, l.x, l.y);
    bmp.close();
    layers.push({ name: l.name, src: c, opacity: l.opacity, visible: l.visible, blend: l.blend, clip: false });
  }
  return { width: doc.width, height: doc.height, background: coversPage(layers[0]!.src), layers };
}
