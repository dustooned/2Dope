import { describe, expect, it } from 'vitest';
import { assetTiming, assetTimingChange, assetClipTimingChange } from './assettiming';
import { compLayer, drawingsLayer, newComp } from './comp';

function rig() {
  const shot = newComp('shot','Shot',100,100,12), source = newComp('source','Art',100,100,12);
  shot.layers.push(drawingsLayer('draw','Drawing',[{drawing:'d',length:24}],100,100));
  source.asset = true; source.duration = 4;
  const l = compLayer('asset','Art',source,shot); l.play = 'loop'; shot.layers.push(l);
  return {shot,source,l,comps:new Map([[shot.id,shot],[source.id,source]])};
}
describe('asset interval timing', () => {
  it('dragging a following clip preserves its visible duration with an explicit ending', () => {
    const {shot,l,comps} = rig();
    expect(assetClipTimingChange(l,shot,comps,'move',5)).toMatchObject({start:5,in:5,out:29});
    expect(assetClipTimingChange(l,shot,comps,'move',-100)).toMatchObject({start:0,in:0,out:24});
  });
  it('start trimming preserves the source origin and end, including at its limits', () => {
    const {shot,l,comps} = rig(); l.start=2; l.in=4; l.out=12;
    expect(assetClipTimingChange(l,shot,comps,'in',3)).toMatchObject({start:2,in:7,out:12});
    expect(assetClipTimingChange(l,shot,comps,'in',100)?.in).toBe(11);
    expect(assetClipTimingChange(l,shot,comps,'in',-100)?.in).toBe(0);
  });
  it('end dragging respects a fixed shot and keeps at least one visible frame', () => {
    const {shot,l,comps} = rig(); shot.duration=20; l.in=4; l.out=12;
    expect(assetClipTimingChange(l,shot,comps,'out',100)?.out).toBe(20);
    expect(assetClipTimingChange(l,shot,comps,'out',-100)?.out).toBe(5);
    expect(assetClipTimingChange(l,shot,comps,'move',100)).toMatchObject({in:12,out:20});
  });
  it('returning to the starting position restores following timing and rejects invalid deltas', () => {
    const {shot,l,comps} = rig();
    for (const kind of ['move','in','out'] as const) expect(assetClipTimingChange(l,shot,comps,kind,0)).toMatchObject({start:0,in:0,out:null});
    expect(assetClipTimingChange(l,shot,comps,'move',NaN)).toBeNull();
  });
  it('displays a following placement as an inclusive shot interval', () => {
    const {shot,l,comps} = rig(); expect(assetTiming(l,shot,comps)).toEqual({start:1,hold:24,end:24,follow:true});
  });
  it('Hold and End describe exactly the same finite visibility interval', () => {
    const {shot,l,comps} = rig(); l.start = l.in = 4;
    Object.assign(l,assetTimingChange(l,shot,comps,'hold',8));
    expect(assetTiming(l,shot,comps)).toEqual({start:5,hold:8,end:12,follow:false});
    Object.assign(l,assetTimingChange(l,shot,comps,'end',10));
    expect(assetTiming(l,shot,comps)).toEqual({start:5,hold:6,end:10,follow:false});
  });
  it('moving a trimmed instance preserves its source phase and local animation keys', () => {
    const {shot,l,comps} = rig(); l.start = 2; l.in = 5; l.out = 13;
    const patch = assetTimingChange(l,shot,comps,'start',10)!;
    expect(patch).toMatchObject({start:6,in:9,out:17});
    expect(patch.in-patch.start).toBe(l.in-l.start);
  });
  it('clamps to at least one frame and honors fixed shot duration', () => {
    const {shot,l,comps} = rig(); shot.duration = 12; l.in = 4; l.out = 8;
    expect(assetTimingChange(l,shot,comps,'start',100)).toMatchObject({in:8,out:12});
    expect(assetTimingChange(l,shot,comps,'hold',-9)).toMatchObject({in:4,out:5});
    expect(assetTimingChange(l,shot,comps,'end',100)).toMatchObject({out:12});
  });
  it('restores automatic ending and keeps an animated source playing for an extended hold', () => {
    const {shot,l,comps} = rig(); l.out = 10; l.play = 'once';
    expect(assetTimingChange(l,shot,comps,'shot')).toMatchObject({out:null,play:'loop'});
    expect(assetTimingChange(l,shot,comps,'hold',20)?.play).toBe('loop');
    l.play = 'single'; expect(assetTimingChange(l,shot,comps,'hold',20)?.play).toBe('single');
  });
  it('rejects incomplete/nonfinite input and bounds oversized intervals', () => {
    const {shot,l,comps} = rig();
    expect(assetTimingChange(l,shot,comps,'start',NaN)).toBeNull();
    expect(assetTimingChange(l,shot,comps,'end',Infinity)).toBeNull();
    expect(assetTimingChange(l,shot,comps,'hold')).toBeNull();
    expect(assetTimingChange(l,shot,comps,'end',2e9)?.out).toBe(1_000_000);
  });
});
