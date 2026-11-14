import { describe, expect, it } from 'vitest';
import { epsTextFromBytes, epsToSvg } from './eps';
const eps = (body: string) => `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 10 20 110 70\n%%EndComments\n${body}\nshowpage`;
describe('bounded EPS path import', () => {
  it('keeps curves, colours and the bottom-left EPS coordinate system', () => {
    const svg = epsToSvg(eps('1 0.5 0 setrgbcolor 10 20 moveto 20 20 30 40 40 50 curveto closepath fill'));
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain('matrix(1 0 0 -1 -10 70)');
    expect(svg).toContain('C20 20 30 40 40 50Z');
    expect(svg).toContain('fill="#ff8000"');
  });
  it('restores the graphics state and supports common short path operators', () => {
    const svg = epsToSvg(eps('q 2 3 translate 0 0 1 RG 3 w 10 20 m 30 40 l S Q 0.5 g 10 20 m 30 40 l 50 20 l h f'));
    expect(svg).toContain('matrix(1 0 0 1 2 3)');
    expect(svg).toContain('stroke="#0000ff" stroke-width="3"');
    expect(svg).toContain('fill="#808080"');
  });
  it('refuses executable programs and unsupported appearances rather than silently losing them', () => {
    expect(() => epsToSvg(eps('(hello) show'))).toThrow(/unsupported/);
    expect(() => epsToSvg(eps('0 0 m 10 10 l clip'))).toThrow(/clip/);
    expect(() => epsToSvg(eps('10 m'))).toThrow(/operands/);
    expect(() => epsToSvg(eps('0 0 m 10 10 l unknownPaint'))).toThrow(/unknownPaint/);
  });
});

describe('EPS file bytes', () => {
  const ascii = (s: string) => new TextEncoder().encode(s);
  /** A DOS EPS binary: 30-byte header, a fake binary preview, then the PostScript section. */
  const dos = (ps: string, preview = new Uint8Array([0xff, 0xd8, 0x00, 0xe9, 0x80])) => {
    const body = ascii(ps), out = new Uint8Array(30 + preview.length + body.length), v = new DataView(out.buffer);
    out.set([0xc5, 0xd0, 0xd3, 0xc6]); v.setUint32(4, 30 + preview.length, true); v.setUint32(8, body.length, true);
    out.set(preview, 30); out.set(body, 30 + preview.length); return out;
  };
  it('reads the PostScript section of a DOS EPS binary and imports a plain body', () => {
    const text = epsTextFromBytes(dos(eps('0 0 1 setrgbcolor 10 20 m 30 40 l 50 20 l h f')));
    expect(text.startsWith('%!PS-Adobe')).toBe(true);
    expect(epsToSvg(text)).toContain('fill="#0000ff"');
  });
  it('reads plain EPS bytes as ISO-8859-1 so high bytes stay one character each', () => {
    const bytes = new Uint8Array([...ascii('%!PS-Adobe-3.0 EPSF-3.0\n%'), 0xe9, 0xff]);
    expect(epsTextFromBytes(bytes).endsWith('%éÿ')).toBe(true);
  });
  it('names Illustrator and CorelDRAW EPS instead of failing on their procedures', () => {
    expect(() => epsToSvg(epsTextFromBytes(dos(eps('Adobe_AGM_Utils begin 10 20 m 30 40 l S'))))).toThrow(/saved by Adobe Illustrator.*Export an SVG/);
    expect(() => epsToSvg(eps('userdict /Adobe_CoolType_Core 2 dict dup begin'))).toThrow(/Adobe Illustrator/);
    expect(() => epsToSvg(eps('wCorel17Dict begin @BeginSysCorelDict'))).toThrow(/saved by CorelDRAW/);
  });
  it('refuses a truncated DOS header or a section past the end of the file', () => {
    expect(() => epsTextFromBytes(new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 1, 2]))).toThrow(/incomplete/);
    const cut = dos(eps('10 20 m 30 40 l S')); expect(() => epsTextFromBytes(cut.subarray(0, cut.length - 5))).toThrow(/incomplete/);
    const zero = dos(eps('S')); new DataView(zero.buffer).setUint32(8, 0, true); expect(() => epsTextFromBytes(zero)).toThrow(/incomplete/);
  });
});
