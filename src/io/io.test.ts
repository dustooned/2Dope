import { describe, expect, it } from 'vitest';
import { PRESETS } from '../core/brush';
import { hashBytes } from './hash';
import { assetPaths, parseProjectFile, SCHEMA, SchemaError, stringifyProjectFile, validateProjectFile, type ProjectFile } from './schema';
import { crc32, readZip, safeName, writeZip, ZipError } from './zip';

const bytes = (s: string) => new TextEncoder().encode(s);

function sample(): ProjectFile {
  return {
    format: '2dope',
    schema: SCHEMA,
    savedBy: '2Dope test',
    name: 'Bounce',
    created: '2026-10-10T00:00:00.000Z',
    modified: '2026-10-10T00:00:00.000Z',
    canvas: { width: 1920, height: 1080 },
    fps: 12,
    layers: [
      {
        id: 'layer1',
        type: 'drawing',
        name: 'Drawing',
        exposures: [
          { drawing: 'd1', length: 2 },
          { drawing: 'd2', length: 1 },
        ],
      },
    ],
    drawings: {
      d1: { num: 1, line: 'assets/abc-1.png', fill: null, vectors: [] },
      d2: {
        num: 2,
        line: null,
        fill: 'assets/def-2.png',
        vectors: [
          {
            id: 's1',
            tool: 'pen',
            brush: PRESETS[1]!,
            color: '#1d1d24',
            seed: 123,
            points: [
              { x: 1, y: 2, pressure: 0.5, tiltX: 0, tiltY: 0, t: 0 },
              { x: 3, y: 4, pressure: 0.7, tiltX: 1, tiltY: 2, t: 16 },
            ],
          },
        ],
      },
    },
  };
}

describe('zip', () => {
  it('round-trips files byte for byte', async () => {
    const files = [
      { name: 'project.json', data: bytes('{"a":1}') },
      { name: 'assets/x.png', data: new Uint8Array([0, 1, 2, 255, 254, 3]) },
      { name: 'empty.bin', data: new Uint8Array() },
    ];
    const z = await readZip(writeZip(files));
    expect([...z.keys()]).toEqual(files.map((f) => f.name));
    for (const f of files) expect([...z.get(f.name)!]).toEqual([...f.data]);
  });

  it('is deterministic (same input, same bytes)', () => {
    const f = [{ name: 'a.txt', data: bytes('hello') }];
    expect([...writeZip(f)]).toEqual([...writeZip(f)]);
  });

  it('reads DEFLATE entries made by other tools', async () => {
    const payload = bytes('hello hello hello hello hello hello'.repeat(20));
    const cs = new CompressionStream('deflate-raw');
    const comp = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(cs)).arrayBuffer());
    // build a zip with method 8 by hand
    const name = bytes('deflated.txt');
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(payload), true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, payload.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(payload), true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, payload.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, 0, true);
    cd.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, cd.length, true);
    ev.setUint32(16, local.length + comp.length, true);
    const zip = new Uint8Array([...local, ...comp, ...cd, ...end]);
    const out = await readZip(zip);
    expect([...out.get('deflated.txt')!]).toEqual([...payload]);
  });

  it('rejects corrupt data (checksum), unsafe names and non-zips', async () => {
    const z = writeZip([{ name: 'a.txt', data: bytes('hello world') }]);
    const bad = z.slice();
    bad[37] = bad[37]! ^ 0xff; // flip a data byte
    await expect(readZip(bad)).rejects.toThrow(ZipError);
    await expect(readZip(bytes('this is not a zip file at all, no way'))).rejects.toThrow(ZipError);
    expect(() => writeZip([{ name: '../evil.txt', data: bytes('x') }])).toThrow(ZipError);
    for (const n of ['../a', '/abs', 'a/../b', 'C:\\x', 'a\\b', '']) expect(safeName(n)).toBe(false);
    for (const n of ['project.json', 'assets/a.png', 'a/b/c.txt']) expect(safeName(n)).toBe(true);
  });

  it('refuses a zip-slip name even when the archive was made elsewhere', async () => {
    const z = writeZip([{ name: 'ok.txt', data: bytes('x') }]);
    const evil = bytes('../zz.txt');
    // rewrite both name copies to a same-length unsafe name
    const text = new TextDecoder('latin1').decode(z).replaceAll('ok.txt', '../zz.t');
    void evil;
    const patched = Uint8Array.from(text, (c) => c.charCodeAt(0));
    await expect(readZip(patched)).rejects.toThrow(ZipError);
  });
});

describe('hash', () => {
  it('is stable, content-sensitive and length-aware', () => {
    expect(hashBytes(bytes('abc'))).toBe(hashBytes(bytes('abc')));
    expect(hashBytes(bytes('abc'))).not.toBe(hashBytes(bytes('abd')));
    expect(hashBytes(new Uint8Array(10))).not.toBe(hashBytes(new Uint8Array(11)));
    expect(hashBytes(bytes('abc'))).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});

describe('project schema', () => {
  it('round-trips a valid project through stringify and parse', () => {
    const p = sample();
    const again = parseProjectFile(stringifyProjectFile(p));
    expect(again.layers[0]!.exposures).toEqual(p.layers[0]!.exposures);
    expect(again.drawings.d2!.vectors[0]!.points).toHaveLength(2);
    expect(assetPaths(again)).toEqual(new Set(['assets/abc-1.png', 'assets/def-2.png']));
  });

  it('refuses files from a newer schema with a helpful message', () => {
    const p = { ...sample(), schema: SCHEMA + 1 };
    expect(() => validateProjectFile(p)).toThrow(/newer version/);
  });

  it('refuses things that are not projects', () => {
    expect(() => parseProjectFile('not json')).toThrow(SchemaError);
    expect(() => validateProjectFile({})).toThrow(SchemaError);
    expect(() => validateProjectFile({ ...sample(), format: 'other' })).toThrow(SchemaError);
  });

  it('catches broken references and bad numbers', () => {
    const missing = sample();
    missing.layers[0]!.exposures.push({ drawing: 'nope', length: 1 });
    expect(() => validateProjectFile(missing)).toThrow(/missing drawing/);
    const zero = sample();
    zero.layers[0]!.exposures[0]!.length = 0;
    expect(() => validateProjectFile(zero)).toThrow(SchemaError);
    const huge = sample();
    huge.canvas.width = 100000;
    expect(() => validateProjectFile(huge)).toThrow(SchemaError);
    const fps = sample();
    fps.fps = 0;
    expect(() => validateProjectFile(fps)).toThrow(SchemaError);
  });

  it('keeps a drawing role when valid and ignores unknown ones (additive field, no schema bump)', () => {
    const p = sample();
    p.drawings.d1!.role = 'key';
    expect(validateProjectFile(p).drawings.d1!.role).toBe('key');
    const odd = sample() as unknown as { drawings: { d1: { role: string } } };
    odd.drawings.d1.role = 'hero-pose';
    expect(validateProjectFile(odd).drawings.d1!.role).toBeUndefined();
    expect(validateProjectFile(sample()).drawings.d2!.role).toBeUndefined();
  });

  it('refuses asset paths that could escape the archive', () => {
    for (const bad of ['../x.png', 'assets/../x.png', '/etc/passwd', 'assets/a.exe', 'assets/a/b.png']) {
      const p = sample();
      p.drawings.d1!.line = bad;
      expect(() => validateProjectFile(p), bad).toThrow(SchemaError);
    }
  });

  it('fills in missing brush fields from the default brush and rejects bad strokes', () => {
    const p = sample() as unknown as { drawings: { d2: { vectors: { brush: Record<string, unknown>; color: string }[] } } };
    delete p.drawings.d2.vectors[0]!.brush.tiltShade;
    delete p.drawings.d2.vectors[0]!.brush.flowDyn;
    const ok = validateProjectFile(p);
    expect(ok.drawings.d2!.vectors[0]!.brush.tiltShade).toBeTruthy();
    expect(ok.drawings.d2!.vectors[0]!.brush.flowDyn.control).toBeTruthy();
    p.drawings.d2.vectors[0]!.color = 'red';
    expect(() => validateProjectFile(p)).toThrow(/#rrggbb/);
  });
});
