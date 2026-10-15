/** Cached extrema at progressively larger sample windows; PCM remains owned by the audio buffer. */
export interface WaveformData {
  channels: readonly Float32Array[];
  sampleRate: number;
  length: number;
  levels: { min: Float32Array; max: Float32Array; block: number }[];
}

export function buildWaveform(channels: readonly Float32Array[], sampleRate: number): WaveformData {
  const length = channels[0]?.length ?? 0;
  const block = 128;
  const min = new Float32Array(Math.ceil(length / block)), max = new Float32Array(min.length);
  for (let b = 0; b < min.length; b++) {
    let lo = Infinity, hi = -Infinity;
    for (const data of channels) for (let i = b * block; i < Math.min(length, (b + 1) * block); i++) {
      const v = data[i] ?? 0; lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    min[b] = lo; max[b] = hi;
  }
  const levels = [{ min, max, block }];
  while (levels[levels.length - 1]!.min.length > 1) {
    const prev = levels[levels.length - 1]!;
    const a = new Float32Array(Math.ceil(prev.min.length / 2)), b = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      a[i] = Math.min(prev.min[i * 2]!, prev.min[i * 2 + 1] ?? Infinity);
      b[i] = Math.max(prev.max[i * 2]!, prev.max[i * 2 + 1] ?? -Infinity);
    }
    levels.push({ min: a, max: b, block: prev.block * 2 });
  }
  return { channels, sampleRate, length, levels };
}

/** Exact extrema inside [from, to), including partial edge blocks. Never leaks a trimmed transient. */
export function waveformRange(data: WaveformData, from: number, to: number): [number, number] {
  let at = Math.max(0, Math.min(data.length, Math.floor(from)));
  const end = Math.max(at, Math.min(data.length, Math.ceil(to)));
  if (at === end) return [0, 0];
  let lo = Infinity, hi = -Infinity;
  while (at < end) {
    let level = data.levels.length - 1;
    while (level >= 0) {
      const part = data.levels[level]!;
      if (at % part.block === 0 && at + part.block <= end) {
        const i = at / part.block;
        lo = Math.min(lo, part.min[i]!); hi = Math.max(hi, part.max[i]!); at += part.block;
        break;
      }
      level--;
    }
    if (level < 0) {
      for (const channel of data.channels) { const v = channel[at] ?? 0; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      at++;
    }
  }
  return [lo, hi];
}

/** A trim-aware, gain-scaled view without re-reading the full audio on each redraw. */
export function waveformColumns(data: WaveformData, fromSeconds: number, toSeconds: number, width: number, gain = 1): [number, number][] {
  const from = Math.max(0, fromSeconds * data.sampleRate);
  const span = Math.max(0, toSeconds * data.sampleRate - from);
  return Array.from({ length: width }, (_, x) => {
    const [lo, hi] = waveformRange(data, from + x / width * span, from + (x + 1) / width * span);
    return [Math.max(-1, Math.min(1, lo * gain)), Math.max(-1, Math.min(1, hi * gain))];
  });
}
