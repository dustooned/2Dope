import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, captureEffects, captureMotion, presetLayer, readPreset } from './presets';
import { cameraLayer, drawingsLayer, newComp, compLayer } from './comp';
import { LINEAR, staticProp, type Prop } from './anim';
import { newEffect } from './effects';
const comp = () => newComp('shot', 'Shot', 200, 100, 24);
const layer = () => drawingsLayer('art', 'Art', [{ drawing: 'd1', length: 48 }], 200, 100);
const options = { frame: 5, duration: 12, append: false };
describe('independent motion and effect presets', () => {
  it.each(BUILTIN_PRESETS)('validates starter $name without changing its data', p => expect(readPreset(p)).toEqual(p));
  it('captures concrete effects at the layer playhead, retaining seed but no animation', () => {
    const l = layer(), e = newEffect('boil', 'old', 123); e.keys = { amount: { value: e.amount, keys: [{ f: 0, v: 0, in: LINEAR, out: LINEAR }, { f: 10, v: 2, in: LINEAR, out: LINEAR }] } }; l.effects = [e];
    const p = captureEffects(l, 5, 'saved', 'Look'); expect(p.kind).toBe('effects');
    if (p.kind !== 'effects') return; expect(p.effects[0]?.amount).toBe(1); expect(p.effects[0]?.seed).toBe(123); expect(p.effects[0]?.keys).toBeUndefined(); expect(e.keys).toBeDefined();
  });
  it('replaces by default, appends explicitly and always gives independent ids', () => {
    const l = layer(); l.effects = [newEffect('glow', 'old', 1)]; const p = BUILTIN_PRESETS.find(p => p.id === 'sticker-shadow')!;
    const replaced = presetLayer(p, l, comp(), options, () => 'new'); expect(replaced.effects?.map(e => e.id)).toEqual(['new']); expect(l.effects[0]?.id).toBe('old');
    expect(presetLayer(p, l, comp(), { ...options, append: true }, () => 'copy').effects?.map(e => e.id)).toEqual(['old', 'copy']);
  });
  it('stores an independent full result for Reset, including pre-existing animated effects on Append', () => {
    const l = layer(), e = newEffect('glow', 'old', 12); e.keys = { amount: { value: 10, keys: [{ f: 0, v: 10, in: LINEAR, out: LINEAR }, { f: 12, v: 20, in: LINEAR, out: LINEAR }] } }; l.effects = [e];
    const result = presetLayer(BUILTIN_PRESETS.find(p => p.id === 'sticker-shadow')!, l, comp(), { ...options, append: true }, () => 'fresh');
    expect(result.styleOrigin?.name).toBe('Sticker shadow'); expect(result.styleOrigin?.effects).toEqual(result.effects); result.effects![0]!.amount = 0; expect(result.styleOrigin?.effects[0]?.amount).toBe(e.amount); expect(result.styleOrigin?.effects[0]?.keys).toEqual(e.keys);
  });
  it('normalizes flat-composite group and adjustment targets', () => {
    const l = layer(); l.effects = [newEffect('glow', 'old', 1)]; l.effects[0]!.target = 'line'; const p = captureEffects(l, 0, 'look', 'Ink glow'); l.adjust = true;
    expect(presetLayer(p, l, comp(), options, () => 'new').effects?.[0]?.target).toBe('layer');
    expect(presetLayer(p, compLayer('group', 'Group', comp(), comp()), comp(), options, () => 'new').effects?.[0]?.target).toBe('layer');
  });
  it('anchors relative positions at the target and rescales frames while retaining outside keys and easing', () => {
    const l = layer(); l.transform.position.keys = [{ f: 0, v: [20, 30], in: LINEAR, out: LINEAR }, { f: 24, v: [60, 50], in: LINEAR, out: LINEAR }];
    const p = captureMotion(l, comp(), 'move', 'Move'); const t = layer(); t.start = 3; t.transform.position = { value: [100, 50], keys: [{ f: 0, v: [100, 50], in: LINEAR, out: LINEAR }, { f: 40, v: [100, 50], in: LINEAR, out: LINEAR }] };
    const result = presetLayer(p, t, comp(), options, () => 'unused'); expect(result.transform.position.keys.map(k => [k.f, k.v])).toEqual([[0, [100, 50]], [2, [100, 50]], [14, [140, 70]], [40, [100, 50]]]); expect(result.transform.position.keys[1]?.out).toEqual(LINEAR); expect(t.transform.position.keys).toHaveLength(2);
  });
  it('refuses timing that merges keys and leaves the target untouched', () => {
    const l = layer(), before = structuredClone(l); expect(() => presetLayer(BUILTIN_PRESETS.find(p => p.id === 'pop')!, l, comp(), { ...options, duration: 1 }, () => '')).toThrow('longer duration'); expect(l).toEqual(before);
  });
  it('refuses locked targets, wrong camera type and nonpositive camera zoom', () => {
    const l = layer(); l.locked = true; expect(() => presetLayer(BUILTIN_PRESETS[0]!, l, comp(), options, () => '')).toThrow('unlock');
    const p = BUILTIN_PRESETS.find(p => p.id === 'camera-push')!; expect(() => presetLayer(p, layer(), comp(), options, () => '')).toThrow('camera'); const cam = cameraLayer('cam', comp()); cam.zoom = staticProp(-1); expect(() => presetLayer(p, cam, comp(), options, () => '')).toThrow('above zero');
  });
  it.each([ { version: 3 }, { props: { unknown: {} } }, { extra: true }, { fps: 0 } ])('rejects the whole motion record: %j', patch => expect(() => readPreset({ ...BUILTIN_PRESETS[0], ...patch })).toThrow());
  it('rejects unknown effects and settings instead of shortening a stack', () => {
    const l = layer(); l.effects = [newEffect('glow', 'g', 1)]; const p = captureEffects(l, 0, 'look', 'Look');
    if (p.kind !== 'effects') return; expect(() => readPreset({ ...p, effects: [...p.effects, { ...p.effects[0], type: 'future' }] })).toThrow('unknown effect'); expect(() => readPreset({ ...p, effects: [{ ...p.effects[0], params: { future: 1 } }] })).toThrow('unknown effect setting');
  });
  it('rejects append overflow and single-frame motion captures', () => {
    const l = layer(); l.effects = Array.from({ length: 16 }, (_, i) => newEffect('glow', String(i), 1)); expect(() => presetLayer(BUILTIN_PRESETS.find(p => p.kind === 'effects')!, l, comp(), { ...options, append: true }, () => 'new')).toThrow('16');
    l.transform.rotation = { value: 0, keys: [{ f: 2, v: 2, in: LINEAR, out: LINEAR }] } as Prop<number>; expect(() => captureMotion(l, comp(), 'm', 'M')).toThrow('two different frames');
  });
});
