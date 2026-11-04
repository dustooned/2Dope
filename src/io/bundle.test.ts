import { describe, expect, it } from 'vitest';
import { BundleQueue, bundleRenderBytes, planBundle, type BundlePlan, type BundleStep } from './bundle';
import { compLayer, drawingsLayer, newComp } from '../core/comp';
import { newEffect } from '../core/effects';
import type { Project } from '../core/project';
import { readZip } from './zip';
const comp = newComp('shot', 'Shot', 100, 100, 24); comp.duration = 240; comp.layers.push(drawingsLayer('l', 'Artwork', [{ drawing: 'd', length: 240 }], 100, 100));
const project = { name: 'Student shot', comp, main: comp.id, comps: new Map([[comp.id, comp]]) } as unknown as Project;
const plan = (): BundlePlan => planBundle(project, { start: 24, end: 240, poster: 0, project: true, video: { format: 'mp4', size: '1080p', quality: 'high', background: 'white' } }, false);
describe('atomic hand-in bundles', () => {
  it('clamps poster and labels GIF as only the first six seconds of the range', () => { const p = plan(); expect(p.poster).toBe(24); expect(p.gifEnd).toBe(168); expect(p.frames).toBe(216); expect(p.duration).toBe(9); });
  it('refuses invalid ranges and WebM instead of renaming it MP4', () => { expect(() => planBundle(project, { start: 10, end: 10, poster: 10, project: false, video: plan().video }, false)).toThrow('nonempty'); expect(() => planBundle(project, { start: 0, end: 20, poster: 0, project: false, video: { ...plan().video, format: 'webm' } }, false)).toThrow('MP4'); });
  it('keeps an explicitly selected export shot when the editor switches to another asset', () => {
    const asset = newComp('other', 'Other asset', 50, 50, 12); asset.asset = true; asset.duration = 12;
    const p = { ...project, activeComp: asset.id, comp: asset, comps: new Map([...project.comps, [asset.id, asset]]) } as unknown as Project;
    expect(planBundle(p, { comp: 'shot', start: 0, end: 240, poster: 0, project: false, video: plan().video }, false).comp).toBe('shot');
    expect(() => planBundle(p, { comp: 'missing', start: 0, end: 20, poster: 0, project: false, video: plan().video }, false)).toThrow('no longer available');
  });
  it('reserves nested and padded effect surfaces rather than one flat scratch page', () => {
    const c = newComp('c', 'Shot', 100, 100, 24), nested = newComp('n', 'Nested', 100, 100, 24), layer = drawingsLayer('art', 'Art', [{ drawing: 'd', length: 24 }], 100, 100);
    nested.layers.push(layer); const p = { comps: new Map([[c.id, c], [nested.id, nested]]), width: 100, height: 100 };
    const flat = bundleRenderBytes(p, c.id, 100, 100); c.layers.push(compLayer('placement', 'Nested', nested, c)); const deep = bundleRenderBytes(p, c.id, 100, 100); expect(deep).toBeGreaterThan(flat);
    layer.effects = [newEffect('shadow', 'shadow', 1)]; expect(bundleRenderBytes(p, c.id, 100, 100)).toBeGreaterThan(deep);
    nested.layers.push(compLayer('cycle', 'Cycle', c, nested)); expect(() => bundleRenderBytes(p, c.id, 100, 100)).toThrow('cyclic');
  });
  it('runs serially, retains completed files after failure, and retries only the failed/remaining steps', async () => {
    const calls: BundleStep[] = []; let fail = true; const queue = new BundleQueue(plan(), async step => { calls.push(step); if (step === 'gif' && fail) throw new Error('GIF failed'); return new Blob([step]); });
    await expect(queue.run(new AbortController().signal, () => {})).rejects.toThrow('GIF failed'); expect([...queue.completed.keys()]).toEqual(['video', 'poster']);
    await expect(queue.archive(false, new AbortController().signal)).rejects.toThrow('incomplete'); fail = false; const zip = await queue.run(new AbortController().signal, () => {});
    expect(calls).toEqual(['video', 'poster', 'gif', 'gif', 'project']); const files = await readZip(new Uint8Array(await zip.arrayBuffer())); expect(files.size).toBe(5); const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))); expect(manifest.complete).toBe(true); expect(manifest.gif.seconds).toBe(6); expect(manifest.range).toEqual({ start: 25, end: 240 });
  });
  it('explicit partial save includes a missing-files manifest', async () => {
    const queue = new BundleQueue(plan(), async step => { if (step === 'poster') throw new Error('poster failed'); return new Blob(['mp4']); }); await expect(queue.run(new AbortController().signal, () => {})).rejects.toThrow();
    const zip = await queue.archive(true, new AbortController().signal), files = await readZip(new Uint8Array(await zip.arrayBuffer())), manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
    expect(manifest.complete).toBe(false); expect(manifest.missing).toEqual(['poster', 'gif', 'project']);
  });
  it('cancellation clears staged files and never creates a complete ZIP', async () => {
    const abort = new AbortController(), queue = new BundleQueue(plan(), async step => { if (step === 'gif') abort.abort(); return new Blob([step]); });
    await expect(queue.run(abort.signal, () => {})).rejects.toThrow('cancelled'); expect(queue.completed.size).toBe(0);
  });
  it('accounts for copies and ZIP allocation before retaining a file', async () => {
    const p = plan(); p.cap = 65536 + 299; const queue = new BundleQueue(p, async () => new Blob([new Uint8Array(100)])); await expect(queue.run(new AbortController().signal, () => {})).rejects.toThrow('memory limit'); expect(queue.completed.size).toBe(0);
  });
});
