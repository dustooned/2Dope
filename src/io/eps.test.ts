import { describe, expect, it } from 'vitest';
import { epsToSvg } from './eps';
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
