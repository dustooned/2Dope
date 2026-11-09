/**
 * A caption as an SVG file: the balloon (fill, ink, tails, joined balloons) and the letters as real
 * shapes from the font's outlines, so it opens in any vector app and scales cleanly. Page units:
 * the SVG is the project page, with the caption where it sits on its layer's page.
 */
import type { Project } from '../core/project';
import type { Pt } from '../lettering/geometry';
import { captionAt, captionBalloon, captionLetters, captionLinks } from '../view/caption';
import { captionFontsReady } from '../view/captionfonts';
import { baselineOffset, glyphFontReady, glyphOf } from '../view/captionglyphs';
import { familyName } from '../lettering/fonts';
import type { CaptionSpec } from '../lettering/spec';

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const poly = (pts: Pt[], close = true) => pts.length ? `M${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}${close ? 'Z' : ''}` : '';

/** The SVG text of a caption at a layer frame (fonts are loaded first). */
export async function captionSvg(project: Project, c: CaptionSpec, frame: number): Promise<string> {
  const W = project.width, H = project.height;
  await captionFontsReady(project);
  // every face the letters use, as outlines
  const faces = new Set<string>();
  const pieces = captionLetters(c, frame, W, H);
  for (const p of pieces) for (const l of p.letters) faces.add(`${l.bold ? 1 : 0}${l.italic ? 1 : 0}`);
  const fonts = new Map<string, Awaited<ReturnType<typeof glyphFontReady>>>();
  for (const f of faces) fonts.set(f, await glyphFontReady(project, c.font, f[0] === '1', f[1] === '1'));

  const { lay, shapes } = captionBalloon(c, frame, W, H), size = lay.size;
  const links = captionLinks(c, frame, W, H);
  const out: string[] = [];
  const balloonA = captionAt(c, 'balloonOpacity', frame) / 100, textA = captionAt(c, 'textOpacity', frame) / 100;
  if (c.style !== 'sfx' && balloonA > 0) {
    const union = [shapes.outline, ...shapes.joined, ...links.flatMap((k) => [k.outline, k.neck])];
    const closed = [...union, ...shapes.seams];
    const g: string[] = [];
    if (c.underFill) {
      const dx = c.underFill.dx * size, dy = c.underFill.dy * size;
      g.push(`<g fill="${esc(c.underFill.color)}" transform="translate(${n(dx)} ${n(dy)})">${closed.map((s) => `<path d="${poly(s)}"/>`).join('')}${shapes.bubbles.map((b) => `<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.r)}"/>`).join('')}</g>`);
    }
    g.push(`<g fill="${esc(c.fill)}">${closed.map((s) => `<path d="${poly(s)}"/>`).join('')}</g>`);
    if (c.inkWidth > 0) {
      // as on the canvas: pieces that share one outline (and closed tails) are inked twice as wide,
      // shown only outside the balloon; a lone balloon is inked along its edge
      const dash = c.style === 'whisper' ? ` stroke-dasharray="${n(size * 0.45)} ${n(size * 0.3)}"` : '';
      const ink = (w: number, extra = '', dashed = true) => `fill="none" stroke="${esc(c.ink)}" stroke-width="${n(w)}" stroke-linejoin="round" stroke-linecap="round"${dashed ? dash : ''}${extra}`;
      if (union.length > 1 || shapes.seams.length) g.push(`<mask id="outside" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${union.map((s) => `<path d="${poly(s)}" fill="#000"/>`).join('')}</mask>`);
      if (union.length > 1) g.push(`<g ${ink(c.inkWidth * size * 2, ' mask="url(#outside)"')}>${union.map((s) => `<path d="${poly(s)}"/>`).join('')}</g>`);
      else g.push(`<path ${ink(c.inkWidth * size)} d="${poly(shapes.outline)}"/>`);
      if (shapes.seams.length) g.push(`<g ${ink(c.inkWidth * size * 2, ' mask="url(#outside)"', false)}>${shapes.seams.map((s) => `<path d="${poly(s)}"/>`).join('')}</g>`);
    }
    if (shapes.bubbles.length) g.push(`<g fill="${esc(c.fill)}"${c.inkWidth > 0 ? ` stroke="${esc(c.ink)}" stroke-width="${n(c.inkWidth * size)}"` : ''}>${shapes.bubbles.map((b) => `<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.r)}"/>`).join('')}</g>`);
    if (c.inkWidth > 0 && shapes.zigzags.length) g.push(`<g fill="none" stroke="${esc(c.ink)}" stroke-linejoin="round" stroke-linecap="round">${shapes.zigzags.map((z, i) => `<path d="${poly(z, false)}" stroke-width="${n(c.inkWidth * size * (shapes.zigzagWidths[i] ?? 1))}"/>`).join('')}</g>`);
    out.push(`<g id="balloon"${balloonA < 1 ? ` opacity="${n(balloonA)}"` : ''}>${g.join('')}</g>`);
  }
  if (textA > 0) {
    const letters: string[] = [];
    let missing = false;
    for (const p of pieces) {
      const cap = p.caption;
      for (const l of p.letters) {
        if (l.ch === ' ' || !l.ch.trim()) continue;
        const f = fonts.get(`${l.bold ? 1 : 0}${l.italic ? 1 : 0}`);
        if (!f) { missing = true; continue; }
        const gl = glyphOf(f, familyName(c.font, l.bold, l.italic), l.ch, p.size);
        const d = gl.contours.map((s) => poly(s)).join('');
        if (!d) continue;
        const dx = l.centred ? -gl.advance / 2 : 0, dy = baselineOffset(f, p.size);
        const turn = l.angle ? ` rotate(${n((l.angle * 180) / Math.PI)})` : '';
        const outline = cap.textOutline && cap.textOutlineWidth > 0 ? ` stroke="${esc(cap.textOutline)}" stroke-width="${n(cap.textOutlineWidth * p.size * 2)}" stroke-linejoin="round" paint-order="stroke"` : '';
        letters.push(`<path transform="translate(${n(l.x)} ${n(l.y)})${turn} translate(${n(dx)} ${n(dy)})" fill="${esc(l.color ?? cap.textColor)}" fill-rule="nonzero"${outline} d="${d}"><title>${esc(l.ch)}</title></path>`);
      }
    }
    out.push(`<g id="letters"${textA < 1 ? ` opacity="${n(textA)}"` : ''}>${letters.join('')}</g>`);
    // a font whose outlines cannot be read (WOFF2): the words as text instead, so nothing is lost
    if (missing) out.push(`<text x="${n(c.x)}" y="${n(c.y)}" text-anchor="middle" dominant-baseline="middle" font-size="${n(size)}" fill="${esc(c.textColor)}">${esc(c.text)}</text>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${out.join('\n')}\n</svg>\n`;
}
