/**
 * Make a caption from a drawing: the drawn balloon (its largest closed vector line, or the outer
 * edge of what is painted) becomes a live caption balloon with the same shape, place and size, and
 * a spike on it becomes the tail. The drawing is kept, hidden. One Undo step; then type the words.
 */
import type { App } from './app';
import { apply, drawingOf, worldMatrix, type DrawingsLayer, type Mat } from './core/comp';
import { readBalloon, type Pt, type ReadBalloon } from './lettering/geometry';
import { outerContour } from './lettering/trace';

/** Points along an SVG path (a vector shape), in the drawing's page units. */
function samplePath(d: string, m: Readonly<Mat>): Pt[] {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;visibility:hidden';
  host.append(p); document.body.append(host);
  try {
    const len = p.getTotalLength(), out: Pt[] = [];
    for (let i = 0; i < 200; i++) { const q = p.getPointAtLength((i / 200) * len); out.push({ x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] }); }
    return out;
  } catch { return []; } finally { host.remove(); }
}

/** The balloon a drawing shows (page units of its layer), or null when there is no closed shape. */
function readDrawnBalloon(app: App, l: DrawingsLayer): ReadBalloon | null {
  const id = drawingOf(l, app.frame), d = id ? app.project.drawings.get(id) : null;
  if (!d) return null;
  // vector lines first: the biggest closed one that reads as a balloon
  let best: { b: ReadBalloon; area: number } | null = null;
  for (const v of d.vectors) {
    const pts = v.shape?.path ? samplePath(v.shape.path, v.shape.matrix) : v.points.map(p => ({ x: p.x, y: p.y }));
    const b = pts.length >= 8 ? readBalloon(pts) : null;
    if (b && (!best || b.width * b.height > best.area)) best = { b, area: b.width * b.height };
  }
  if (best) return best.b;
  // painted pixels: trace the outer edge of the biggest painted shape (at most 400 cells across)
  const W = d.line.width, H = d.line.height, s = Math.min(1, 400 / Math.max(W, H)), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(s, s);
  if (d.fill) g.drawImage(d.fill, 0, 0);
  g.drawImage(d.line, 0, 0);
  const px = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = px[i * 4 + 3]! > 40 ? 1 : 0;
  const edge = outerContour(mask, w, h);
  return edge.length >= 16 ? readBalloon(edge.map(p => ({ x: p.x / s, y: p.y / s }))) : null;
}

/** Turn the active drawing layer's balloon into a caption. Returns the caption layer's id. */
export function captionFromDrawing(app: App, layerId = app.project.activeLayer): string | null {
  const comp = app.project.comp, l = comp.layers.find(x => x.id === layerId);
  if (l?.kind !== 'drawings' || l.caption || l.locked || l.guide || l.notes) { app.onNotice?.('Select a drawing layer with a balloon drawn on it.'); return null; }
  const b = readDrawnBalloon(app, l);
  if (!b) { app.onNotice?.('No balloon found: draw a closed balloon shape (with Vector or a brush), then try again.'); return null; }
  // into the shot's space (the drawing layer may be moved, turned or scaled)
  const m = worldMatrix(comp, l, app.frame), at = (p: Pt) => { const [x, y] = apply(m, [p.x, p.y]); return { x, y }; };
  const centre = at(b.centre), sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
  const id = app.letters.create(centre, b.style, false, false);
  if (!id) return null;
  const tip = b.tail ? at(b.tail) : null;
  app.editor.edit('Make caption from drawing', cc => {
    const cap = cc.layers.find(x => x.id === id), src = cc.layers.find(x => x.id === layerId);
    if (cap?.kind !== 'drawings' || !cap.caption) return;
    cap.name = `Caption · ${l.name}`.slice(0, 60);
    cap.caption = {
      ...cap.caption,
      shape: b.shape,
      // the balloon keeps the drawn size; it grows only if the words need more room
      minSize: [Math.round((b.width * sx) / 2), Math.round((b.height * sy) / 2)],
      ...(b.outline ? { look: { outline: b.outline, wobble: 0 } } : {}),
      tails: tip ? [{ x: tip.x, y: tip.y, join: b.style === 'thought' ? 'bubbles' : 'merged', width: 1.2 }] : [],
    };
    if (src) src.visible = false;
  });
  app.history.combine(2, 'Make caption from drawing');
  app.onNotice?.(`Made a ${b.style === 'custom' ? 'custom' : b.style} caption from “${l.name}” (kept, hidden). Type its words.`);
  app.letters.onEdit?.(id, false);
  return id;
}
