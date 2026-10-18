import { compLength } from '../core/comp';
import type { Project } from '../core/project';
import { soundVoices } from './soundmix';

export interface VideoOptions {
  format: 'mp4' | 'webm';
  size: '720p' | '1080p' | 'original';
  quality: 'standard' | 'high';
  /** 'transparent' keeps the see-through areas (WebM with VP9 / VP8 only: MP4 cannot hold it). */
  background: 'white' | 'black' | 'transparent';
}

export const DEFAULT_VIDEO: VideoOptions = { format: 'mp4', size: '720p', quality: 'standard', background: 'white' };
export const VIDEO_MAX_BYTES = 64 * 1024 * 1024;
export const VIDEO_LITE_MAX_BYTES = 32 * 1024 * 1024;

/** Device preferences are untrusted and may have been written by an older build. */
export function videoOptions(raw: unknown): VideoOptions {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    // a transparent video is always WebM: MP4 (H.264) has no transparency
    format: r.format === 'webm' || r.background === 'transparent' ? 'webm' : 'mp4',
    size: r.size === '1080p' || r.size === 'original' ? r.size : '720p',
    quality: r.quality === 'high' ? 'high' : 'standard',
    background: r.background === 'black' ? 'black' : r.background === 'transparent' ? 'transparent' : 'white',
  };
}

export interface VideoPlan {
  comp: string;
  frames: number;
  fps: number;
  duration: number;
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
  bitrate: number;
  estimatedBytes: number;
  options: VideoOptions;
}

/** Fit without upscaling or stretching; even dimensions suit AVC and 4:2:0 video codecs. */
export function videoSize(width: number, height: number, size: VideoOptions['size']) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384)
    throw new Error('The shot has invalid dimensions.');
  const edge = size === '720p' ? 1280 : size === '1080p' ? 1920 : Infinity;
  const scale = Math.min(1, edge / Math.max(width, height));
  const w = width * scale;
  const h = height * scale;
  const outW = Math.max(2, Math.ceil(w / 2) * 2);
  const outH = Math.max(2, Math.ceil(h / 2) * 2);
  return { width: outW, height: outH, scale, x: (outW - w) / 2, y: (outH - h) / 2 };
}

/** Always export the main shot, including while a precomp is open for editing. */
export function planVideo(project: Pick<Project, 'comps' | 'main' | 'comp'>, raw: unknown, maxBytes = VIDEO_MAX_BYTES): VideoPlan {
  const options = videoOptions(raw);
  const comp = project.comps.get(project.main) ?? project.comp;
  const frames = compLength(comp, project.comps);
  const fps = comp.fps;
  if (!Number.isInteger(frames) || frames < 1 || !Number.isFinite(fps) || fps < 1 || fps > 120)
    throw new Error('The shot has invalid timing.');
  const sz = videoSize(comp.width, comp.height, options.size);
  const bitrate = Math.round(Math.max(500_000, Math.min(24_000_000, sz.width * sz.height * fps * (options.quality === 'high' ? 0.2 : 0.1))));
  const duration = frames / fps;
  // A conservative estimate; actual writes are independently capped by the encoder adapter.
  const audioBitrate = soundVoices(project, comp.id).length ? 128000 : 0;
  const estimatedBytes = Math.ceil((bitrate + audioBitrate) * duration / 8 * 1.25) + 1024 * 1024;
  if (estimatedBytes > maxBytes)
    throw new Error('This video may be too large for an in-browser export. Choose a smaller size or Standard quality, or export a PNG sequence.');
  return { comp: comp.id, frames, fps, duration, ...sz, bitrate, estimatedBytes, options };
}
