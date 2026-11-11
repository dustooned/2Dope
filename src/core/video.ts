/**
 * Movies as tracks (Procreate Dreams style): a drawings layer with a `video` plays an imported movie
 * file, decoded as it is shown instead of turned into drawings, so long animatics and reference
 * footage stay light. Its sound is part of the same layer: moving, trimming, splitting, speeding up
 * or duplicating the layer carries picture and sound together. Anything painted on the layer's
 * drawing shows on top of the movie.
 */

/** A movie file stored with the project (the original bytes, as imported). */
export interface VideoAsset {
  name: string;
  /** Where its bytes live in the asset store / archive: `assets/<hash>.<ext>`. */
  path: string;
  duration: number;
  width: number;
  height: number;
  /** Frames per second the file reports (for display; timing follows the shot). */
  fps: number;
  bytes: Uint8Array | null;
}

/** What a movie layer plays. */
export interface VideoSpec {
  v: 1;
  /** The movie asset's id in `project.videos`. */
  asset: string;
  /** Seconds into the movie at the layer's own frame 0 (slip: show a later part in the same place). */
  offset: number;
  /** The movie's sound as a sound asset id (in `project.sounds`), or null when it has none. */
  sound: string | null;
  /** 0..2 (1 = as recorded). */
  volume: number;
  muted: boolean;
}

/** Longest movie brought in, in seconds (a long animatic). */
export const VIDEO_MAX_SECONDS = 600;
/** Largest movie file, in bytes. */
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
/** Movie files 2Dope stores, by extension. */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm'] as const;
export const VIDEO_PATH = /^assets\/[A-Za-z0-9_-]{8,80}\.(mp4|m4v|mov|webm)$/;

/** A movie spec from a file, checked (throws a short reason). */
export function readVideo(input: unknown): VideoSpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid movie settings');
  const v = input as Record<string, unknown>;
  if (v.v !== 1) throw new Error('a newer movie format');
  if (typeof v.asset !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v.asset)) throw new Error('invalid movie asset');
  const num = (x: unknown, lo: number, hi: number, def: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def);
  const sound = v.sound === null || v.sound === undefined ? null : typeof v.sound === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v.sound) ? v.sound : null;
  return { v: 1, asset: v.asset, offset: num(v.offset, 0, VIDEO_MAX_SECONDS, 0), sound, volume: num(v.volume, 0, 2, 1), muted: v.muted === true };
}

/**
 * The movie time (seconds) a movie layer shows at one of its content frames, or null past the
 * movie's end. `fps` is the shot's frame rate (a content frame lasts one shot frame).
 */
export function videoTime(spec: VideoSpec, contentFrame: number, fps: number, duration: number): number | null {
  const t = spec.offset + contentFrame / fps;
  return t < 0 || t >= duration ? null : t;
}

/** The movie frame index for a time (frames of the shot's rate), used as a cache and frame key. */
export const videoFrameIndex = (t: number, fps: number) => Math.floor(t * fps + 1e-6);
