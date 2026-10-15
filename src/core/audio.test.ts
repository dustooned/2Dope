import { describe, expect, it } from 'vitest';
import { compLayer, compLength, drawingsLayer, newComp } from './comp';
import { soundStart, soundWindow, waveform, type SoundClip } from './audio';
import { mixSound, soundVoices } from '../io/soundmix';
import type { Project } from './project';
import { assetPaths, compFile, compsFromFile, SCHEMA, validateProjectFile } from '../io/schema';
import { assetsOf } from '../io/persist';

const clip = (patch: Partial<SoundClip> = {}): SoundClip => ({ id: 'a1', asset: 's1', name: 'Dialogue', start: 12, trimIn: 1, trimOut: 3, gain: 1, muted: false, link: null, ...patch });
function fixture() {
  const c = newComp('c1', 'Shot', 400, 300, 12);
  c.layers.push(drawingsLayer('board', 'Board', [{ drawing: 'd1', length: 12 }, { drawing: 'd2', length: 24 }], 400, 300));
  c.audio = [clip()];
  return c;
}
describe('shared audio timing and storage', () => {
  it('follows a linked panel through retiming, reordering, removal and restoration', () => {
    const c = fixture(), board = c.layers[0]!;
    if (board.kind !== 'drawings') throw new Error('fixture');
    const s = clip({ link: { layer: board.id, drawing: 'd2', occurrence: 0, offset: 2 } });
    expect(soundStart(s, c)).toBe(14);
    board.exposures[0]!.length = 20; expect(soundStart(s, c)).toBe(22);
    board.exposures.reverse(); expect(soundStart(s, c)).toBe(2);
    const old = board.exposures.shift()!; expect(soundStart(s, c)).toBeNull();
    board.exposures.unshift(old); expect(soundStart(s, c)).toBe(2);
    expect(soundStart(clip(), c)).toBe(12);
  });
  it('trims source time correctly when starting playback partway through a clip', () => {
    const c = fixture();
    expect(soundWindow(clip(), c, 2, 10)).toEqual({ at: 2, offset: 2, duration: 1, gain: 1 });
    expect(soundWindow(clip({ muted: true }), c, 0, 10)).toBeNull();
    expect(soundWindow(clip(), c, 4, 10)).toBeNull();
    c.audio = [clip({ start: 48 })]; expect(compLength(c, new Map([[c.id, c]]))).toBe(72);
    c.duration = 24; expect(compLength(c, new Map([[c.id, c]]))).toBe(24);
  });
  it('maps nested comp fps, offset, speed, looping and mute into the exported sound', () => {
    const root = newComp('root', 'Root', 400, 300, 12), child = newComp('child', 'Child', 400, 300, 24);
    child.duration = 48; child.audio = [clip({ start: 0, trimIn: 0, trimOut: 2 })];
    const instance = compLayer('nested', 'Nested', child, root); instance.start = instance.in = 12; instance.speed = 2; instance.out = 60; instance.play = 'loop'; root.layers.push(instance);
    const p = { comps: new Map([[root.id, root], [child.id, child]]) } as unknown as Project;
    const voices = soundVoices(p, root.id);
    expect(voices[0]!.sourceTime(0)).toBeNull();
    expect(voices[0]!.sourceTime(1.25)).toBeCloseTo(0.5);
    expect(voices[0]!.sourceTime(2.25)).toBeCloseTo(0.5);
    child.audio[0]!.muted = true; expect(soundVoices(p, root.id)).toHaveLength(0);
  });
  it('mixes stereo/mono, source trims, gain, silence and timeline looping without clipping', () => {
    const values = new Float32Array([0, 0.5, 1, -1]);
    const bank = { get: () => ({ sampleRate: 4, numberOfChannels: 1, getChannelData: () => values }) as unknown as AudioBuffer };
    const voices = [{ asset: 's1', gain: 2, sourceTime: (t: number) => t < 1 ? t : null }];
    const [l, r] = mixSound(voices, bank, 0, 8, 4, 1);
    expect([...l]).toEqual([0, 1, 1, -1, 0, 1, 1, -1]); expect([...r]).toEqual([...l]);
    expect(waveform([values], 2)).toEqual([0.5, 1]);
  });
  it('round-trips audio, keeps its asset referenced, migrates old files and rejects bad paths or trims', () => {
    const c = fixture();
    const raw = { format: '2dope', schema: SCHEMA, canvas: { width: 400, height: 300 }, main: 'c1', comps: { c1: compFile(c) }, folders: {}, drawings: { d1: { num: 1 }, d2: { num: 2 } }, sounds: { s1: { name: 'Dialogue', path: 'assets/voice.wav', duration: 4 } } };
    const file = validateProjectFile(raw);
    expect(compsFromFile(file).get('c1')!.audio).toEqual(c.audio);
    expect([...assetPaths(file)]).toContain('assets/voice.wav'); expect([...assetsOf(file)]).toContain('assets/voice.wav');
    expect(() => validateProjectFile({ ...raw, sounds: { s1: { ...raw.sounds.s1, path: '../voice.wav' } } })).toThrow(/audio/);
    const bad = structuredClone(raw); bad.comps.c1.audio![0]!.trimOut = 0.5;
    expect(() => validateProjectFile(bad)).toThrow(/source out/);
    const old = structuredClone(raw); delete old.comps.c1.audio; old.schema = 2;
    expect(validateProjectFile(old).schema).toBe(3);
  });
});
