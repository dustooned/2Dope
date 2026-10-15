import { makeCanvas } from '../brush/raster';
import { frameContent } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { planVideo, VIDEO_MAX_BYTES, type VideoPlan } from './videoplan';

type VideoCodec = 'avc' | 'vp9' | 'vp8';
export interface VideoSupport { codec: VideoCodec | null; message: string }
export interface VideoProgress { done: number; total: number; label: string }
export interface VideoResult { blob: Blob; extension: 'mp4' | 'webm'; frames: number; duration: number }

/** Codec support is checked for the actual dimensions, frame rate and bitrate, not browser names. */
export async function videoSupport(plan: VideoPlan): Promise<VideoSupport> {
  if (!globalThis.isSecureContext || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined')
    return { codec: null, message: 'Video export needs a browser with video encoding in a secure tab (HTTPS or localhost). PNG sequence export is still available.' };
  const { canEncodeVideo, Quality } = await import('mediabunny');
  const codecs: VideoCodec[] = plan.options.format === 'mp4' ? ['avc'] : ['vp9', 'vp8'];
  for (const codec of codecs) {
    try {
      if (await canEncodeVideo(codec, {
        width: plan.width, height: plan.height, frameRate: plan.fps,
        quality: new Quality({ bitrate: plan.bitrate }), alpha: 'discard', latencyMode: 'quality',
      })) return { codec, message: '' };
    } catch {
      // A driver can reject a configuration even when its codec is advertised.
    }
  }
  return { codec: null, message: `This browser cannot make ${plan.options.format === 'mp4' ? 'MP4' : 'WebM'} at these settings. Try a smaller size or the other format, or export a PNG sequence.` };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/**
 * Encode the main shot offline at its own frame rate. Never records real-time playback, skips
 * held frames, or moves the editor playhead. The caller keeps document editing modal throughout.
 */
export async function exportVideo(
  project: Project,
  rawOptions: unknown,
  onProgress: (p: VideoProgress) => void,
  signal: AbortSignal,
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void },
  maxBytes = VIDEO_MAX_BYTES,
): Promise<VideoResult> {
  const check = () => { if (signal.aborted) throw new DOMException('Video export cancelled', 'AbortError'); };
  check();
  const plan = planVideo(project, rawOptions, maxBytes);
  onProgress({ done: 0, total: plan.frames, label: 'Checking video support…' });
  const support = await videoSupport(plan);
  check();
  if (!support.codec) throw new Error(support.message);
  const { Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, CanvasSource, Quality } = await import('mediabunny');
  check();
  const canvas = makeCanvas(plan.width, plan.height);
  const g = canvas.getContext('2d');
  if (!g) {
    canvas.width = canvas.height = 0;
    throw new Error('2D canvas unavailable');
  }
  const target = new BufferTarget();
  target.on('write', ({ end }) => {
    if (end > maxBytes) throw new Error('The video reached this device’s export size limit. Choose a smaller size or Standard quality.');
  });
  let output: InstanceType<typeof Output> | null = null;
  let cancelling: Promise<void> | null = null;
  const cancel = () => { if (output) cancelling ??= output.cancel().catch(() => {}); };
  try {
    output = new Output({
      // Write packets as they arrive so the byte cap applies during encoding.
      format: plan.options.format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat(),
      target,
    });
    const source = new CanvasSource(canvas, {
      codec: support.codec, quality: new Quality({ bitrate: plan.bitrate }),
      alpha: 'discard', latencyMode: 'quality', keyFrameInterval: 2,
    });
    output.addVideoTrack(source, { frameRate: plan.fps });
    signal.addEventListener('abort', cancel, { once: true });
    check();
    await output.start();
    for (let frame = 0; frame < plan.frames; frame++) {
      check();
      const pinned: Drawing[] = [];
      try {
        const content = frameContent(project.comps, plan.comp, frame);
        for (const id of content.drawings) {
          check();
          const drawing = project.drawings.get(id);
          if (!drawing) throw new Error(`Drawing ${id} is missing.`);
          // Residency.pin increments before loading; release it even if loading fails.
          pinned.push(drawing);
          await hold.pin(drawing);
        }
        check();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = plan.options.background === 'black' ? '#000000' : '#ffffff';
        g.fillRect(0, 0, plan.width, plan.height);
        g.setTransform(plan.scale, 0, 0, plan.scale, plan.x, plan.y);
        g.imageSmoothingQuality = 'high';
        drawComp(g, project, plan.comp, frame, { backgrounds: true, export: true });
        // Await backpressure before reusing the canvas or unpinning this frame's drawings.
        await source.add(frame / plan.fps, 1 / plan.fps);
      } finally {
        for (const drawing of pinned) hold.unpin(drawing);
      }
      onProgress({ done: frame + 1, total: plan.frames, label: `Frame ${frame + 1} of ${plan.frames}` });
      await yieldToBrowser();
    }
    check();
    source.close();
    onProgress({ done: plan.frames, total: plan.frames, label: 'Finishing the video…' });
    await output.finalize();
    check();
    if (!target.buffer?.byteLength) throw new Error('The browser did not produce a video file.');
    if (target.buffer.byteLength > maxBytes) throw new Error('The video exceeded this device’s export size limit.');
    return {
      blob: new Blob([target.buffer], { type: plan.options.format === 'mp4' ? 'video/mp4' : 'video/webm' }),
      extension: plan.options.format, frames: plan.frames, duration: plan.duration,
    };
  } catch (error) {
    check();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (output && output.state !== 'finalized' && output.state !== 'canceled') cancel();
    await cancelling;
    canvas.width = canvas.height = 0;
    releaseScratch();
  }
}
