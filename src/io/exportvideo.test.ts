import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawingsLayer, newComp } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { exportVideo, videoSupport } from './exportvideo';
import { DEFAULT_VIDEO, planVideo } from './videoplan';
import type { SoundBank } from './sound';

const rig = vi.hoisted(() => ({
  supported: new Set(['avc', 'vp9', 'vp8']),
  encoded: [] as [number, number | undefined][],
  drawn: [] as { comp: string; frame: number; options: unknown }[],
  canvases: [] as { width: number; height: number; getContext: () => object }[],
  cancelled: 0,
  finalized: 0,
  released: 0,
  rate: 0,
  writtenBytes: 8,
  onAdd: null as null | (() => void),
  onProbe: null as null | (() => void),
  failSetup: false,
  supportsAudio: true,
  audioCodec: '',
  audioChunks: [] as { length: number; first: number }[],
}));

vi.mock('../brush/raster', () => ({
  makeCanvas: (width: number, height: number) => {
    const g = { setTransform() {}, fillRect() {}, fillStyle: '', imageSmoothingQuality: '' };
    const canvas = { width, height, getContext: () => g };
    rig.canvases.push(canvas);
    return canvas;
  },
}));
vi.mock('../view/composite', () => ({
  drawComp: (_g: unknown, _p: unknown, comp: string, frame: number, options: unknown) => rig.drawn.push({ comp, frame, options }),
  releaseScratch: () => rig.released++,
}));
vi.mock('mediabunny', () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = null;
    write: ((value: { end: number }) => void) | null = null;
    on(_type: string, handler: (value: { end: number }) => void) { this.write = handler; }
  }
  class Output {
    state = 'pending';
    target: BufferTarget;
    constructor(options: { target: BufferTarget }) { this.target = options.target; }
    addVideoTrack(_source: unknown, metadata: { frameRate: number }) { rig.rate = metadata.frameRate; }
    addAudioTrack() {}
    async start() { this.state = 'started'; }
    async cancel() { rig.cancelled++; this.state = 'canceled'; }
    async finalize() {
      this.target.write?.({ end: rig.writtenBytes });
      this.target.buffer = new ArrayBuffer(rig.writtenBytes);
      rig.finalized++;
      this.state = 'finalized';
    }
  }
  class CanvasSource {
    constructor() { if (rig.failSetup) throw new Error('source setup failed'); }
    async add(timestamp: number, duration?: number) {
      rig.encoded.push([timestamp, duration]);
      rig.onAdd?.();
    }
    close() {}
  }
  return {
    BufferTarget, Output, CanvasSource,
    AudioBufferSource: class {
      constructor(options: { codec: string }) { rig.audioCodec = options.codec; }
      async add(buffer: { length: number; first: number }) { rig.audioChunks.push({ length: buffer.length, first: buffer.first }); }
      close() {}
    }, canEncodeAudio: async () => rig.supportsAudio,
    Mp4OutputFormat: class {}, WebMOutputFormat: class {}, Quality: class {},
    canEncodeVideo: async (codec: string) => { rig.onProbe?.(); return rig.supported.has(codec); },
  };
});

function project(): Project {
  const shot = newComp('shot', 'Shot', 400, 300, 12);
  shot.layers.push(drawingsLayer('L1', 'Drawing', [{ drawing: 'd1', length: 2 }, { drawing: 'd2', length: 1 }], 400, 300));
  const inside = newComp('inside', 'Inside', 200, 200, 24);
  const drawings = new Map([['d1', { id: 'd1' }], ['d2', { id: 'd2' }]]);
  return { main: 'shot', comp: inside, comps: new Map([['shot', shot], ['inside', inside]]), drawings } as unknown as Project;
}
function residency() {
  const pins: string[] = [];
  const unpins: string[] = [];
  return { pins, unpins, pin: async (d: Drawing) => { pins.push(d.id); }, unpin: (d: Drawing) => { unpins.push(d.id); } };
}

beforeEach(() => {
  rig.supported = new Set(['avc', 'vp9', 'vp8']);
  rig.encoded = [];
  rig.drawn = [];
  rig.canvases = [];
  rig.cancelled = rig.finalized = rig.released = rig.rate = 0;
  rig.writtenBytes = 8;
  rig.onAdd = rig.onProbe = null;
  rig.failSetup = false;
  rig.supportsAudio = true; rig.audioCodec = ''; rig.audioChunks = [];
  vi.stubGlobal('AudioBuffer', class {
    length: number; first = 0;
    constructor(options: { length: number }) { this.length = options.length; }
    copyToChannel(data: Float32Array, channel: number) { if (channel === 0) this.first = data[0] ?? 0; }
  });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('VideoEncoder', class {});
  vi.stubGlobal('VideoFrame', class {});
});
afterEach(() => vi.unstubAllGlobals());

describe('offline video export', () => {
  const withAudio = () => {
    const p = project();
    p.comps.get(p.main)!.audio = [{ id: 'a1', asset: 's1', name: 'Sound', start: 0, trimIn: 0, trimOut: 0.25, gain: 0.5, muted: false, link: null }];
    const pcm = new Float32Array(12000).fill(0.25);
    const bank = { load: vi.fn(async () => {}), get: () => ({ sampleRate: 44100, numberOfChannels: 1, getChannelData: () => pcm }) } as unknown as SoundBank;
    return { p, bank };
  };
  it('encodes mixed audio with the matching MP4/WebM codec and exact total sample count', async () => {
    const { p, bank } = withAudio();
    await exportVideo(p, DEFAULT_VIDEO, () => {}, new AbortController().signal, residency(), undefined, bank);
    expect(rig.audioCodec).toBe('aac');
    expect(rig.audioChunks).toEqual(Array.from({ length: 3 }, () => ({ length: 3675, first: 0.125 })));
    rig.audioChunks = [];
    await exportVideo(p, { format: 'webm' }, () => {}, new AbortController().signal, residency(), undefined, bank);
    expect(rig.audioCodec).toBe('opus');
    expect(rig.audioChunks.reduce((n, c) => n + c.length, 0)).toBe(11025);
  });
  it('reports unavailable audio encoding without producing a silent replacement video', async () => {
    const { p, bank } = withAudio(); rig.supportsAudio = false;
    await expect(exportVideo(p, DEFAULT_VIDEO, () => {}, new AbortController().signal, residency(), undefined, bank)).rejects.toThrow(/cannot encode audio/);
    expect(rig.canvases).toHaveLength(0); expect(rig.encoded).toHaveLength(0);
  });
  it('keeps muted audio out of the mux and includes active audio in the export budget', async () => {
    const { p, bank } = withAudio(); const audible = planVideo(p, DEFAULT_VIDEO).estimatedBytes;
    p.comps.get(p.main)!.audio![0]!.muted = true;
    expect(planVideo(p, DEFAULT_VIDEO).estimatedBytes).toBeLessThan(audible);
    await exportVideo(p, DEFAULT_VIDEO, () => {}, new AbortController().signal, residency(), undefined, bank);
    expect(rig.audioChunks).toHaveLength(0); expect(rig.audioCodec).toBe('');
  });
  it('encodes every main-shot frame, including holds, at exact timestamps and releases pixel pins', async () => {
    const hold = residency();
    const result = await exportVideo(project(), DEFAULT_VIDEO, () => {}, new AbortController().signal, hold);
    expect(rig.encoded).toEqual([[0, 1 / 12], [1 / 12, 1 / 12], [2 / 12, 1 / 12]]);
    expect(rig.rate).toBe(12);
    expect(rig.drawn).toEqual([0, 1, 2].map((frame) => ({ comp: 'shot', frame, options: { backgrounds: true, export: true } })));
    expect(hold.pins).toEqual(['d1', 'd1', 'd2']);
    expect(hold.unpins).toEqual(hold.pins);
    expect(result).toMatchObject({ extension: 'mp4', frames: 3, duration: 0.25 });
    expect(result.blob.type).toBe('video/mp4');
    expect(rig.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect([rig.finalized, rig.cancelled, rig.released]).toEqual([1, 0, 1]);
  });

  it('falls back from VP9 to VP8 only for WebM, never relabels its container as MP4', async () => {
    rig.supported = new Set(['vp8']);
    const p = project();
    expect((await videoSupport(planVideo(p, DEFAULT_VIDEO))).codec).toBeNull();
    expect((await videoSupport(planVideo(p, { format: 'webm' }))).codec).toBe('vp8');
    const result = await exportVideo(p, { format: 'webm' }, () => {}, new AbortController().signal, residency());
    expect(result.extension).toBe('webm');
    expect(result.blob.type).toBe('video/webm');
  });

  it('reports unsupported/insecure configurations before allocating export resources', async () => {
    vi.stubGlobal('isSecureContext', false);
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, new AbortController().signal, residency())).rejects.toThrow(/secure tab/);
    expect(rig.canvases).toHaveLength(0);
    expect(rig.encoded).toHaveLength(0);
  });

  it('cancels mid-encode without finalizing or leaking pinned drawings', async () => {
    const abort = new AbortController();
    const hold = residency();
    rig.onAdd = () => abort.abort();
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, abort.signal, hold)).rejects.toMatchObject({ name: 'AbortError' });
    expect(rig.encoded).toHaveLength(1);
    expect(hold.unpins).toEqual(hold.pins);
    expect([rig.cancelled, rig.finalized, rig.released]).toEqual([1, 0, 1]);
    expect(rig.canvases[0]).toMatchObject({ width: 0, height: 0 });
  });

  it('honors cancellation during codec probing without starting an output', async () => {
    const abort = new AbortController();
    rig.onProbe = () => abort.abort();
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, abort.signal, residency())).rejects.toMatchObject({ name: 'AbortError' });
    expect(rig.canvases).toHaveLength(0);
  });

  it('releases an incremented residency pin even when decoding the next drawing fails', async () => {
    const hold = residency();
    const pin = hold.pin;
    hold.pin = async (d) => { await pin(d); if (d.id === 'd2') throw new Error('decode failed'); };
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, new AbortController().signal, hold)).rejects.toThrow('decode failed');
    expect(hold.unpins).toEqual(hold.pins);
    expect([rig.cancelled, rig.finalized, rig.released]).toEqual([1, 0, 1]);
  });

  it('aborts and cleans up when actual encoded bytes exceed the device limit', async () => {
    rig.writtenBytes = 3 * 1024 * 1024;
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, new AbortController().signal, residency(), 2 * 1024 * 1024))
      .rejects.toThrow(/size limit/);
    expect([rig.cancelled, rig.finalized, rig.released]).toEqual([1, 0, 1]);
  });

  it('propagates encoder failures without keeping canvases or pins alive', async () => {
    const hold = residency();
    rig.onAdd = () => { throw new Error('encoder failed'); };
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, new AbortController().signal, hold)).rejects.toThrow('encoder failed');
    expect(hold.unpins).toEqual(hold.pins);
    expect(rig.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(rig.cancelled).toBe(1);
  });

  it('cleans up even if encoder-source initialization fails before output starts', async () => {
    rig.failSetup = true;
    await expect(exportVideo(project(), DEFAULT_VIDEO, () => {}, new AbortController().signal, residency())).rejects.toThrow('source setup failed');
    expect(rig.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect([rig.cancelled, rig.finalized, rig.released]).toEqual([1, 0, 1]);
  });
});
