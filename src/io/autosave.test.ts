import { describe, expect, it } from 'vitest';
import { PRESETS } from '../core/brush';
import { Autosaver, DEFAULTS, type Clock } from './autosave';
import { hasContent, MemoryStore, unreferencedAssets, versionsToPrune, type VersionRecord } from './persist';
import type { Capture } from './projectio';
import { FORMAT, parseProjectFile, SCHEMA, type ProjectFile } from './schema';

/** A manual clock so debounce and timers are deterministic. */
class FakeClock implements Clock {
  t = 1_000_000;
  private timers: { id: number; at: number; fn: () => void }[] = [];
  private next = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.next++;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((x) => x.id !== id);
  }
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
      await Promise.resolve();
    }
    this.t = end;
  }
}

function file(frames: number, asset?: string): ProjectFile {
  return {
    format: FORMAT,
    schema: SCHEMA,
    savedBy: 'test',
    name: 'T',
    created: '2026-10-10T00:00:00.000Z',
    modified: '2026-10-10T00:00:00.000Z',
    canvas: { width: 100, height: 100 },
    fps: 12,
    layers: [{ id: 'layer1', type: 'drawing', name: 'Drawing', exposures: [{ drawing: 'd1', length: frames }] }],
    drawings: { d1: { num: 1, line: asset ?? null, fill: null, vectors: [] } },
  };
}

/** A capture whose content we control; counts how often it encoded. */
function fakeCapture(state: { frames: number; asset?: string; encoded: number }): () => Capture {
  return () => {
    const frames = state.frames;
    const asset = state.asset;
    return {
      async settle() {
        state.encoded++;
        const assets = new Map<string, Uint8Array>();
        if (asset) assets.set(asset, new Uint8Array([1, 2, 3]));
        return { file: file(frames, asset), assets, commit() {} };
      },
    };
  };
}

describe('autosave', () => {
  it('debounces rapid changes into one save and stores a readable project', async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const state = { frames: 3, asset: 'assets/a-1.png', encoded: 0 };
    const a = new Autosaver(store, fakeCapture(state), () => false, DEFAULTS, clock);
    for (let i = 0; i < 10; i++) {
      a.markDirty();
      await clock.advance(200);
    }
    expect(state.encoded).toBe(0); // still debouncing... until maxWait
    await clock.advance(6000);
    await a.idle();
    expect(state.encoded).toBeGreaterThanOrEqual(1);
    expect(a.state).toBe('saved');
    const rec = await store.getAutosave();
    expect(parseProjectFile(rec!.json).layers[0]!.exposures[0]!.length).toBe(3);
    expect(store.assets.has('assets/a-1.png')).toBe(true);
  });

  it('waits while the user is mid-stroke', async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const state = { frames: 1, encoded: 0 };
    let busy = true;
    const a = new Autosaver(store, fakeCapture(state), () => busy, DEFAULTS, clock);
    a.markDirty();
    await clock.advance(3000);
    expect(state.encoded).toBe(0);
    busy = false;
    await clock.advance(3000);
    await a.idle();
    expect(state.encoded).toBe(1);
  });

  it('does nothing when nothing changed since the last save', async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const state = { frames: 2, encoded: 0 };
    const a = new Autosaver(store, fakeCapture(state), () => false, DEFAULTS, clock);
    a.markDirty();
    await a.flush();
    await a.flush();
    expect(state.encoded).toBe(1);
  });

  it('reports storage errors and keeps the previous good save', async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const state = { frames: 2, asset: 'assets/a-1.png', encoded: 0 };
    const a = new Autosaver(store, fakeCapture(state), () => false, DEFAULTS, clock);
    a.markDirty();
    await a.flush();
    const good = (await store.getAutosave())!.json;
    state.frames = 9;
    store.putAutosave = async () => {
      throw new Error('QuotaExceededError');
    };
    a.markDirty();
    await a.flush();
    expect(a.state).toBe('error');
    expect(a.error).toMatch(/Quota/);
    expect((await store.getAutosave())!.json).toBe(good);
  });

  it('a version captures the state at call time, even if the project changes right after', async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const state = { frames: 4, encoded: 0 };
    const a = new Autosaver(store, fakeCapture(state), () => false, DEFAULTS, clock);
    const p = a.saveVersion('Before clear', true);
    state.frames = 1; // the destructive edit happens immediately after
    const v = (await p)!;
    expect(parseProjectFile(v.json).layers[0]!.exposures[0]!.length).toBe(4);
  });

  it('keeps only the newest automatic versions and never prunes manual ones', async () => {
    const list: VersionRecord[] = [];
    for (let i = 0; i < 14; i++) list.push({ id: `a${i}`, name: 'Automatic', auto: true, at: i, json: '' });
    list.push({ id: 'm1', name: 'Mine', auto: false, at: -5, json: '' });
    const prune = versionsToPrune(list, 10);
    expect(prune.sort()).toEqual(['a0', 'a1', 'a2', 'a3']);
    expect(prune).not.toContain('m1');
  });

  it('garbage-collects only assets nothing refers to', async () => {
    const store = new MemoryStore();
    await store.putAutosave({ json: JSON.stringify(file(1, 'assets/keep-1.png')), savedAt: 1 });
    const ver: VersionRecord = { id: 'v', name: 'v', auto: false, at: 1, json: JSON.stringify(file(1, 'assets/ver-1.png')) };
    const dead = unreferencedAssets(['assets/keep-1.png', 'assets/ver-1.png', 'assets/old-1.png'], await store.getAutosave(), [ver]);
    expect(dead).toEqual(['assets/old-1.png']);
  });

  it('automatic restore points need both time and changes', async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const state = { frames: 1, encoded: 0 };
    const a = new Autosaver(store, fakeCapture(state), () => false, DEFAULTS, clock);
    await a.maybeAutoVersion();
    expect(await store.listVersions()).toHaveLength(0); // nothing changed
    a.markDirty();
    await clock.advance(DEFAULTS.versionEveryMs - 1000);
    await a.maybeAutoVersion();
    expect(await store.listVersions()).toHaveLength(0); // too soon
    await clock.advance(2000);
    await a.maybeAutoVersion();
    await a.idle();
    expect(await store.listVersions()).toHaveLength(1);
  });
});

describe('hasContent', () => {
  it('ignores an untouched new project and notices drawings, frames and vectors', () => {
    expect(hasContent(file(1))).toBe(false);
    expect(hasContent(file(2))).toBe(true);
    expect(hasContent(file(1, 'assets/x-1.png'))).toBe(true);
    const v = file(1);
    v.drawings.d1!.vectors = [
      { id: 's', tool: 'pen', brush: PRESETS[0]!, color: '#000000', seed: 1, points: [{ x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 0 }] },
    ];
    expect(hasContent(v)).toBe(true);
  });
});
