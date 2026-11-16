import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offlinePlugin } from './offline-plugin.mjs';

function build(files: Record<string, string>): { sw: string; version: string; list: string[] } {
  const dir = mkdtempSync(join(tmpdir(), '2dope-sw-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    const plugin = offlinePlugin() as unknown as { configResolved(c: unknown): void; closeBundle(): void };
    plugin.configResolved({ build: { outDir: dir } });
    plugin.closeBundle();
    const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
    return { sw, version: /VERSION = '([0-9a-f]+)'/.exec(sw)![1]!, list: JSON.parse(/const FILES = (\[.*\]);/.exec(sw)![1]!) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('offline plugin', () => {
  const base = { 'index.html': '<html>', 'assets/app-1.js': 'a', 'assets/lazy-2.js': 'b', 'fonts/f.ttf': 'f', '404.html': 'nope', 'sw.js': 'old' };
  it('precaches every emitted file but not the worker itself or the 404 page', () => {
    const { list } = build(base);
    expect(list).toEqual(['./', 'assets/app-1.js', 'assets/lazy-2.js', 'fonts/f.ttf', 'index.html']);
  });
  it('changes the cache version when any file changes, and only then', () => {
    const a = build(base).version;
    expect(build(base).version).toBe(a);
    expect(build({ ...base, 'assets/lazy-2.js': 'changed' }).version).not.toBe(a);
  });
  it('fills in the template (no placeholders left)', () => {
    const { sw } = build(base);
    expect(sw).not.toMatch(/__VERSION__|__FILES__/);
    expect(sw).toContain('ignoreVary: true');
  });
});
