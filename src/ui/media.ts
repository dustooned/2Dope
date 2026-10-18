import type { App } from '../app';
import type { AudioTracks } from './audiotracks';

/** What the media picker offers: pictures, movies and sounds. */
export const MEDIA_ACCEPT = 'image/*,video/*,audio/*,.mov,.mp4,.m4v,.webm,.wav,.mp3,.m4a,.aac,.ogg,.flac';

type Kind = 'picture' | 'movie' | 'sound';

export function mediaKind(name: string, type: string): Kind | null {
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return 'picture';
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
        if (kind === 'picture') {
          try {
            const bmp = await createImageBitmap(f);
            app.importPicture(f.name, bmp, bmp.width, bmp.height);
            bmp.close();
            app.onNotice?.(`${f.name} is an object layer for the whole shot. Move or scale it with Select.`);
          } catch {
            app.onNotice?.(`${f.name}: this picture could not be read.`);
          }
        } else if (kind === 'movie') {
          app.onNotice?.(`Bringing in ${f.name}…`);
          const ok = await app.importMovie(f, (i, n) => app.onNotice?.(`Bringing in ${f.name}… ${Math.round((i / n) * 100)}%`));
          if (ok) {
            await audio.import(f, true);
            app.onNotice?.(`${f.name} is a layer from frame 1, one drawing per frame. Draw over it on another layer.`);
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
