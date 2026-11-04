/** Authoring metadata. The saved transparent drawing, not this text, is rendered on load. */
export interface TitleSpec {
  v: 1; text: string; font: 'system-ui'; size: number; weight: 400 | 700;
  align: 'left' | 'center' | 'right'; fill: string; stroke: string | null; strokeWidth: number;
}
export function readTitle(input: unknown): TitleSpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid title metadata.');
  const t = input as Record<string, unknown>, color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (Object.keys(t).some(k => !['v', 'text', 'font', 'size', 'weight', 'align', 'fill', 'stroke', 'strokeWidth'].includes(k)) || t.v !== 1 || t.font !== 'system-ui') throw new Error('Unsupported title format.');
  const text = typeof t.text === 'string' ? t.text.replace(/\r\n?/g, '\n') : '';
  if (!text.trim() || [...text].length > 280 || text.split('\n').length > 4) throw new Error('Use 1–280 characters and up to four lines.');
  if (typeof t.size !== 'number' || !Number.isFinite(t.size) || t.size < 8 || t.size > 512) throw new Error('Title size must be 8–512 pixels.');
  if (t.weight !== 400 && t.weight !== 700 || !['left', 'center', 'right'].includes(String(t.align)) || !color(t.fill) || t.stroke !== null && !color(t.stroke) || typeof t.strokeWidth !== 'number' || !Number.isFinite(t.strokeWidth) || t.strokeWidth < 0 || t.strokeWidth > 16) throw new Error('Invalid title appearance.');
  return { v: 1, text, font: 'system-ui', size: t.size, weight: t.weight as 400 | 700, align: t.align as TitleSpec['align'], fill: t.fill as string, stroke: t.stroke as string | null, strokeWidth: t.strokeWidth };
}
export function defaultTitle(): TitleSpec { return { v: 1, text: 'Title', font: 'system-ui', size: 64, weight: 700, align: 'center', fill: '#222222', stroke: null, strokeWidth: 0 }; }
/** Same layout for the bounded preview and the committed page. Never called during playback. */
export function paintTitle(g: CanvasRenderingContext2D, input: TitleSpec, width: number, height: number): void {
  const t = readTitle(input), lines = t.text.split('\n'), leading = t.size * 1.2, margin = Math.min(32, width * .05);
  g.save();
  try {
    g.font = `${t.weight} ${t.size}px system-ui`; g.textAlign = t.align; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = t.fill; g.lineWidth = t.strokeWidth; if (t.stroke) g.strokeStyle = t.stroke;
    const x = t.align === 'left' ? margin : t.align === 'right' ? width - margin : width / 2;
    lines.forEach((line, i) => { const y = height / 2 + (i - (lines.length - 1) / 2) * leading; if (t.stroke && t.strokeWidth) g.strokeText(line, x, y); g.fillText(line, x, y); });
  } finally { g.restore(); }
}
