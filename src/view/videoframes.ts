/**
 * Movie frames for movie layers, decoded from the stored file with mediabunny (already used for
 * video export). Drawing is synchronous: a frame not decoded yet asks for it (and the next few, for
 * playback) and the canvas redraws when it arrives; meanwhile the movie's last decoded frame shows.
 * Exports call `videoFramesReady` first, which decodes every frame they need at full size.
 */
import { setVideoReady } from '../core/comp';
import type { Project } from '../core/project';
import type { VideoAsset } from '../core/video';

type Sink = { getCanvas(t: number): Promise<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null>; canvasesAtTimestamps(ts: number[]): AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null> };
interface Track { preview: Sink; full: () => Sink; width: number; height: number; dispose(): void }

const PREVIEW_WIDTH = 1280;
const PREVIEW_CACHE = 150;
const FULL_CACHE = 12;
/** How many frames ahead a preview request decodes (smooth playback). */
const AHEAD = 12;

let project: () => Project | null = () => null;
let source: (path: string) => Promise<Uint8Array | null> = async () => null;
let redraw: () => void = () => {};

const tracks = new Map<string, { project: Project; track: Promise<Track | null> }>();
const preview = new Map<string, CanvasImageSource>();
const full = new Map<string, CanvasImageSource>();
const lastShown = new Map<string, CanvasImageSource>();
const busy = new Set<string>();

const key = (asset: string, t: number) => `${asset}@${Math.round(t * 1000)}`;
const remember = (map: Map<string, CanvasImageSource>, k: string, c: CanvasImageSource, max: number) => {
  map.delete(k); map.set(k, c);
  while (map.size > max) map.delete(map.keys().next().value!);
};

/** Set by the app: the open project, where stored movie bytes come from, and what redraws the canvas. */
export function setVideoHooks(h: { project: () => Project | null; source: (path: string) => Promise<Uint8Array | null>; redraw: () => void }): void {
  project = h.project; source = h.source; redraw = h.redraw;
}

/** Is this movie frame decoded? */
export const videoFrameReady = (asset: string, t: number) => preview.has(key(asset, t)) || full.has(key(asset, t));
setVideoReady(videoFrameReady);

/** Open a movie for decoding (once per project). */
function trackOf(p: Project, id: string): Promise<Track | null> {
  const have = tracks.get(id);
  if (have && have.project === p) return have.track;
  const asset = p.videos.get(id);
  const track = (async (): Promise<Track | null> => {
    if (!asset) return null;
    const bytes = asset.bytes ?? (await source(asset.path));
    if (!bytes) return null;
    const { Input, BufferSource, ALL_FORMATS, CanvasSink } = await import('mediabunny');
    const input = new Input({ source: new BufferSource(new Uint8Array(bytes).buffer), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) { input.dispose(); return null; }
    const w = video.displayWidth, h = video.displayHeight, pw = Math.min(w, PREVIEW_WIDTH);
    let fullSink: Sink | null = null;
    return {
      preview: new CanvasSink(video, { width: pw }) as unknown as Sink,
      full: () => (fullSink ??= new CanvasSink(video) as unknown as Sink),
      width: w, height: h,
      dispose: () => input.dispose(),
    };
  })().catch((e) => { console.warn('A movie could not be opened:', e); tracks.delete(id); return null; });
  tracks.set(id, { project: p, track });
  // nothing to open yet (its bytes not readable): try again next time it is asked for
  void track.then(t => { if (!t && tracks.get(id)?.track === track) tracks.delete(id); });
  return track;
}

/** Forget every open movie (a different project, or memory pressure). */
export function releaseVideos(): void {
  for (const { track } of tracks.values()) void track.then(t => t?.dispose());
  tracks.clear(); preview.clear(); full.clear(); lastShown.clear(); busy.clear();
}

/**
 * The picture of a movie at a time, ready to draw now, or the last one decoded (null before any).
 * Asks for this frame and the next few when they are not decoded yet. `fps` is the shot's rate.
 */
export function videoFrame(asset: string, t: number, fps: number, exporting = false): CanvasImageSource | null {
  const k = key(asset, t);
  const hit = (exporting ? full.get(k) : undefined) ?? preview.get(k) ?? full.get(k);
  if (hit) { lastShown.set(asset, hit); return hit; }
  const p = project();
  if (p && !exporting && !busy.has(k)) {
    // this frame and the next ones, decoded in one pass
    const times = Array.from({ length: AHEAD }, (_, i) => t + i / fps).filter(x => !preview.has(key(asset, x)));
    for (const x of times) busy.add(key(asset, x));
    void (async () => {
      try {
        const track = await trackOf(p, asset);
        if (!track) return;
        let i = 0;
        for await (const got of track.preview.canvasesAtTimestamps(times)) {
          const at = times[i++]!;
          busy.delete(key(asset, at));
          if (got) remember(preview, key(asset, at), got.canvas as CanvasImageSource, PREVIEW_CACHE);
        }
        redraw();
      } catch (e) { console.warn('Movie frames could not be decoded:', e); } finally { for (const x of times) busy.delete(key(asset, x)); }
    })();
  }
  return lastShown.get(asset) ?? null;
}

/** Decode the frames a frame of an export needs, at full size (call before drawing it). */
export async function videoFramesReady(p: Project, frames: readonly { asset: string; time: number }[]): Promise<void> {
  for (const f of frames) {
    const k = key(f.asset, f.time);
    if (full.has(k)) continue;
    const track = await trackOf(p, f.asset);
    if (!track) continue;
    const got = await track.full().getCanvas(f.time);
    if (got) remember(full, k, got.canvas as CanvasImageSource, FULL_CACHE);
  }
}

/** The size of a stored movie, once known (for fitting it to the page). */
export function videoSize(asset: VideoAsset | undefined): { width: number; height: number } | null {
  return asset && asset.width > 0 && asset.height > 0 ? { width: asset.width, height: asset.height } : null;
}

/**
 * Read a movie file: its picture size, length and rate, and whether this browser can decode it.
 * Throws a short reason for files it cannot use.
 */
export async function probeVideo(bytes: Uint8Array): Promise<{ width: number; height: number; duration: number; fps: number; hasAudio: boolean }> {
  const { Input, BufferSource, ALL_FORMATS } = await import('mediabunny');
  const input = new Input({ source: new BufferSource(new Uint8Array(bytes).buffer), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no picture.');
    if (!(await video.canDecode())) throw new Error('This browser cannot play this movie’s picture. MP4 (H.264) usually works.');
    const duration = await input.computeDuration();
    let fps = 24;
    try { const stats = await video.computePacketStats(60); if (stats.averagePacketRate > 0) fps = Math.round(stats.averagePacketRate * 100) / 100; } catch { /* keep 24 */ }
    const audio = await input.getPrimaryAudioTrack();
    return { width: video.displayWidth, height: video.displayHeight, duration, fps, hasAudio: !!audio && (await audio.canDecode()) };
  } finally { input.dispose(); }
}
