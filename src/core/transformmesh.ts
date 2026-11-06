import { applyPoint, invert, type Mat } from './selxform';

export type TransformMode = 'uniform' | 'freeform' | 'distort' | 'warp';
export type Point = [number, number];
export type Bounds = { x0: number; y0: number; x1: number; y1: number };
export interface Deformation {
  points: Point[];
  forward(x: number, y: number): Point;
  inverse(x: number, y: number): Point | null;
}

export function transformNodes(box: Bounds, size: 2 | 3): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    points.push([box.x0 + x * (box.x1 + 1 - box.x0) / (size - 1), box.y0 + y * (box.y1 + 1 - box.y0) / (size - 1)]);
  }
  return points;
}

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const corners = [0, 1, 3, 2] as const;
const triangles = [[0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [3, 4, 7], [3, 7, 6], [4, 5, 8], [4, 8, 7]] as const;

export function validTransformNodes(nodes: Point[]): boolean {
  if (nodes.length === 9) return triangles.every(([a, b, c]) => cross(nodes[a]!, nodes[b]!, nodes[c]!) > 0.01);
  return corners.every((a, i) => cross(nodes[a]!, nodes[corners[(i + 1) % 4]!]!, nodes[corners[(i + 2) % 4]!]!) > 0.01);
}

function perspective(nodes: Point[]) {
  const [p, q, r, s] = nodes as [Point, Point, Point, Point];
  const ax = q[0] - s[0], ay = q[1] - s[1], bx = r[0] - s[0], by = r[1] - s[1];
  const dx = p[0] - q[0] - r[0] + s[0], dy = p[1] - q[1] - r[1] + s[1];
  const det = ax * by - ay * bx;
  const u = (dx * by - dy * bx) / det, v = (ax * dy - ay * dx) / det;
  const a = q[0] * (1 + u) - p[0], b = r[0] * (1 + v) - p[0];
  const c = q[1] * (1 + u) - p[1], d = r[1] * (1 + v) - p[1];
  return {
    forward(x: number, y: number): Point {
      const w = 1 + u * x + v * y;
      return [(a * x + b * y + p[0]) / w, (c * x + d * y + p[1]) / w];
    },
    inverse(x: number, y: number): Point | null {
      const A = a - u * x, B = b - v * x, C = c - u * y, D = d - v * y;
      const den = A * D - B * C;
      if (Math.abs(den) < 1e-9) return null;
      const s = x - p[0], t = y - p[1];
      return [(s * D - t * B) / den, (t * A - s * C) / den];
    },
  };
}

function mesh(nodes: Point[]) {
  const uv = transformNodes({ x0: 0, y0: 0, x1: 0, y1: 0 }, 3);
  const mapping = (from: Point[], to: Point[]) => {
    const cells = triangles.map(([i, j, k]) => {
      const a = from[i]!, b = from[j]!, c = from[k]!;
      const det = cross(a, b, c);
      return { a, b, c, det, p: to[i]!, q: to[j]!, r: to[k]! };
    });
    return (x: number, y: number): Point | null => {
      for (const { a, b, c, det, p, q, r } of cells) {
        const dx = x - a[0], dy = y - a[1];
        const u = (dx * (c[1] - a[1]) - dy * (c[0] - a[0])) / det;
        const v = ((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / det;
        if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
          return [p[0] + u * (q[0] - p[0]) + v * (r[0] - p[0]), p[1] + u * (q[1] - p[1]) + v * (r[1] - p[1])];
      }
      return null;
    };
  };
  return { forward: mapping(uv, nodes), inverse: mapping(nodes, uv) };
}

/** The cage is defined in selection space, so affine options can still act on it as a whole. */
export function deformation(box: Bounds, nodes: Point[], affine: Mat): Deformation {
  const w = box.x1 + 1 - box.x0, h = box.y1 + 1 - box.y0;
  const local = nodes.length === 9 ? mesh(nodes) : perspective(nodes);
  const back = invert(affine)!;
  return {
    points: nodes.map(([x, y]) => applyPoint(affine, x, y)),
    forward(x, y) {
      const p = local.forward(Math.max(0, Math.min(1, (x - box.x0) / w)), Math.max(0, Math.min(1, (y - box.y0) / h)));
      return p ? applyPoint(affine, ...p) : applyPoint(affine, x, y);
    },
    inverse(x, y) {
      const p = local.inverse(...applyPoint(back, x, y));
      if (!p || p[0] < -1e-8 || p[0] > 1 + 1e-8 || p[1] < -1e-8 || p[1] > 1 + 1e-8) return null;
      return [box.x0 + p[0] * w, box.y0 + p[1] * h];
    },
  };
}
