import { parsePath, writePath } from './pathgeometry';
import type { StrokeRecord } from './stroke';

/** A duplicated drawing keeps stroke IDs, so correspondence stays stable as points move. */
export function tweenStrokes(current: StrokeRecord[], next: StrokeRecord[], t: number): StrokeRecord[] {
  const targets = new Map(next.map(stroke => [stroke.id, stroke]));
  const mix = (a: number, b: number) => a + (b - a) * t;
  return current.map(stroke => {
    const end = targets.get(stroke.id);
    if (!end || end === stroke || stroke.clips?.length || end.clips?.length) return stroke;
    if (stroke.shape && end.shape) {
      const from = stroke.shape, to = end.shape;
      try {
        const a = parsePath(from.path), b = parsePath(to.path);
        if (a.length !== b.length || a.some((node, i) => node.cmd !== b[i]!.cmd)) return stroke;
        const path = writePath(a.map((node, i) => ({
          cmd: node.cmd,
          values: node.values.map((v, j) => node.cmd === 'A' && (j === 3 || j === 4) ? v : mix(v, b[i]!.values[j]!)),
        })));
        return { ...stroke, shape: { ...from, path, width: mix(from.width, to.width), matrix: [
          mix(from.matrix[0], to.matrix[0]), mix(from.matrix[1], to.matrix[1]), mix(from.matrix[2], to.matrix[2]),
          mix(from.matrix[3], to.matrix[3]), mix(from.matrix[4], to.matrix[4]), mix(from.matrix[5], to.matrix[5]),
        ] } };
      } catch {
        return stroke;
      }
    }
    if (stroke.shape || end.shape || stroke.tool !== 'pen' || end.tool !== 'pen' || stroke.points.length !== end.points.length) return stroke;
    return { ...stroke, points: stroke.points.map((point, i) => {
      const to = end.points[i]!;
      return { ...point, x: mix(point.x, to.x), y: mix(point.y, to.y), w: mix(point.w ?? 1, to.w ?? 1) };
    }) };
  });
}
