import { describe, expect, it } from 'vitest';
import { readOra } from './ora';
import { writeZip } from './zip';

const enc = (s: string) => new TextEncoder().encode(s);

describe('OpenRaster reader', () => {
  it('reads the stack: size, layers bottom first, names, place, opacity, hidden and blend', async () => {
    const stack = `<?xml version="1.0"?><image w="640" h="360"><stack>
      <layer name="Ink &amp; lines" src="data/ink.png" x="10" y="20" opacity="0.5" composite-op="svg:multiply"/>
      <stack visibility="hidden"><layer name="Old sketch" src="data/sketch.png"/></stack>
      <layer name="Paper" src="data/paper.png" visibility="visible"/>
    </stack></image>`;
    const zip = writeZip([
      { name: 'mimetype', data: enc('image/openraster') },
      { name: 'stack.xml', data: enc(stack) },
      { name: 'data/ink.png', data: new Uint8Array([1]) },
      { name: 'data/sketch.png', data: new Uint8Array([2]) },
      { name: 'data/paper.png', data: new Uint8Array([3]) },
    ]);
    const o = await readOra(zip);
    expect([o.width, o.height]).toEqual([640, 360]);
    expect(o.layers.map((l) => l.name)).toEqual(['Paper', 'Old sketch', 'Ink & lines']);
    expect(o.layers[2]).toMatchObject({ x: 10, y: 20, opacity: 0.5, blend: 'multiply', visible: true });
    expect(o.layers[1]!.visible).toBe(false);
    expect([...o.layers[0]!.png]).toEqual([3]);
  });

  it('refuses a ZIP that is not OpenRaster', async () => {
    await expect(readOra(writeZip([{ name: 'a.txt', data: enc('hi') }]))).rejects.toThrow(/OpenRaster/);
  });
});
