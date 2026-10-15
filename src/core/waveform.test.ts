import { describe, expect, it, vi } from 'vitest';
import { buildWaveform, waveformColumns, waveformRange } from './waveform';
import { SoundBank } from '../io/sound';
import type { Project } from './project';

describe('cached audio waveform', () => {
  it('keeps both channels and polarity, including a transient in the right channel only', () => {
    const l = new Float32Array(600), r = new Float32Array(600);
    l[40] = -0.5; r[400] = 0.75;
    const data = buildWaveform([l, r], 100);
    expect(waveformRange(data, 0, 600)).toEqual([-0.5, 0.75]);
    expect(waveformRange(data, 128, 512)).toEqual([0, 0.75]);
    expect(data.channels[0]).toBe(l); // No extra PCM copy.
    expect(data.levels[0]!.min.length).toBe(5);
  });
  it('excludes trimmed-out transients even when they share an overview block', () => {
    const channel = new Float32Array(512); channel[99] = 1; channel[101] = -0.25; channel[200] = 0.9;
    const data = buildWaveform([channel], 100);
    expect(waveformRange(data, 100, 200)).toEqual([-0.25, 0]);
    expect(waveformColumns(data, 1, 2, 1)).toEqual([[-0.25, 0]]);
  });
  it('scales volume and clips the visual peak without changing the cached source', () => {
    const data = buildWaveform([new Float32Array([-0.75, 0.75])], 2);
    expect(waveformColumns(data, 0, 1, 1, 0.5)).toEqual([[-0.375, 0.375]]);
    expect(waveformColumns(data, 0, 1, 1, 2)).toEqual([[-1, 1]]);
    expect(waveformColumns(data, 0, 1, 1, 0)).toEqual([[-0, 0]]);
    expect(waveformRange(data, 0, 2)).toEqual([-0.75, 0.75]);
  });
  it('matches brute-force extrema for aligned, partial and irregular ranges', () => {
    const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i * 0.13) * ((i % 301) / 301));
    const data = buildWaveform([samples], 48000);
    for (const [a, b] of [[0, 48000], [1, 47999], [128, 256], [1000, 23456], [47990, 50000]] as const) {
      const raw = [...samples.subarray(a, Math.min(samples.length, b))];
      expect(waveformRange(data, a!, b!)).toEqual([Math.min(...raw), Math.max(...raw)]);
    }
    expect(waveformRange(data, 100, 100)).toEqual([0, 0]);
    expect(waveformColumns(buildWaveform([], 44100), 0, 1, 2)).toEqual([[0, 0], [0, 0]]);
  });
  it('builds an asset overview once and releases it when another project is opened', async () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const getChannelData = vi.fn(() => samples);
    vi.stubGlobal('OfflineAudioContext', class { async decodeAudioData() { return { duration: 1, numberOfChannels: 1, sampleRate: 3, getChannelData }; } });
    try {
      const p = { sounds: new Map([['s1', { name: 'Test', duration: 1, path: 'assets/test.wav', bytes: new Uint8Array([1]) }]]) } as unknown as Project;
      const bank = new SoundBank(() => true);
      await bank.load(p, 's1');
      const first = bank.waveform('s1');
      expect(bank.waveform('s1')).toBe(first); expect(getChannelData).toHaveBeenCalledTimes(1);
      bank.use({ sounds: new Map() } as unknown as Project);
      expect(bank.waveform('s1')).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
});
