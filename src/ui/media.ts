import type { App } from '../app';
import type { BlendMode } from '../core/comp';
import { decodeGif, gifHolds } from '../io/gifdecode';
import { readOra } from '../io/ora';
import { readPsd } from '../io/psd';
import type { AudioTracks } from './audiotracks';
import { importVectorDocument } from '../io/vectorimport';

/** What the media picker offers: pictures (also animated GIFs and layered PSD / OpenRaster), movies and sounds. */
export const MEDIA_ACCEPT = 'image/*,video/*,audio/*,.svg,.eps,.psd,.ora,.gif,.mov,.mp4,.m4v,.webm,.wav,.mp3,.m4a,.aac,.ogg,.flac';

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
export function mediaPicker(app: App, audio: AudioTracks): () => void {
  let input: HTMLInputElement | null = null;
  let busy = false;
  const bring = async (files: File[]) => {
    busy = true;
    try {
      for (const f of files) {
        const kind = mediaKind(f.name, f.type);
        if (kind === 'vector') {
          try {
            const project = app.project, comp = project.activeComp;
            const doc = importVectorDocument(await f.text(), /\.eps$/i.test(f.name) || f.type === 'application/postscript');
            if (app.project !== project || project.activeComp !== comp) throw new Error('The timeline changed while this vector file was loading; import it again');
            app.importVectors(f.name, doc);
            app.onNotice?.(`${f.name}: ${doc.strokes.length} scalable vector paths. Arrange in Motion; Rasterize imported vectors in the Vector tools enables pixel painting.`);
          } catch (e) { app.onNotice?.(`${f.name}: ${e instanceof Error ? e.message : 'could not be read'}.`); }
          continue;
        }
        if (kind === 'gif') {
          // an animated GIF comes in frame by frame (its holds kept); one frame is a picture
          try {
            const g = decodeGif(new Uint8Array(await f.arrayBuffer()));
            if (g.frames.length > 1) {
              const frames = g.frames.map((fr) => pictureOf(fr.rgba, g.width, g.height));
              app.importAnimation(f.name, frames, g.width, g.height, gifHolds(g.frames.map((x) => x.delay), app.project.comp.fps));
              app.onNotice?.(`${f.name}: ${g.frames.length} frames on a new layer from frame 1, each held as long as in the GIF.`);
              continue;
            }
          } catch { /* not readable by us: try it as a plain picture below */ }
        }
        if (kind === 'layered') {
          try {
            const bytes = new Uint8Array(await f.arrayBuffer());
            const doc = /\.ora$/i.test(f.name) ? await oraLayers(bytes) : psdLayers(bytes);
            app.importLayered(f.name, doc.width, doc.height, doc.layers, doc.background);
            app.onNotice?.(`${f.name}: ${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'} as a paint stack${doc.background ? ' at the back' : ''}. Each keeps its name, opacity and blend.`);
          } catch (e) {
            app.onNotice?.(`${f.name}: ${e instanceof Error ? e.message : 'could not be read'}.`);
          }
          continue;
        }
        if (kind === 'picture' || kind === 'gif') {
          try {
            const project = app.project, comp = project.activeComp;
            const picture = await decodePicture(f);
            try {
              if (app.project !== project || project.activeComp !== comp) throw new Error('The timeline changed');
              app.importPicture(f.name, picture.source, picture.width, picture.height);
            } finally { picture.close(); }
            app.onNotice?.(`${f.name} is an object layer for the whole shot; transparent pixels stay transparent. View → Transparency grid shows them. Move or scale it in Motion.`);
          } catch {
            app.onNotice?.(`${f.name}: this picture could not be read.`);
          }
        } else if (kind === 'movie') {
          app.onNotice?.(`Bringing in ${f.name}…`);
          const ok = await app.importMovie(f, (i, n) => app.onNotice?.(`Bringing in ${f.name}… ${Math.round((i / n) * 100)}%`));
          if (ok) {
            await audio.import(f, true);
            app.onNotice?.(`${f.name} is a layer from frame 1, one drawing per frame. Draw over it on another layer. To remove it, hold its track (or Layers → Delete); any sound it had is a separate clip with its own delete.`);
          }
        } else if (kind === 'sound') await audio.import(f);
        else app.onNotice?.(`${f.name}: not a picture, movie or sound.`);
      }
    } finally {
      busy = false;
    }
  };
  return () => {
    if (busy) {
      app.onNotice?.('Still bringing in the last file…');
      return;
    }
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = MEDIA_ACCEPT;
      input.multiple = true;
      input.hidden = true;
      input.addEventListener('change', () => {
        const files = [...(input!.files ?? [])];
        input!.value = '';
        if (files.length) void bring(files);
      });
      document.body.append(input);
    }
    input.click();
  };
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
