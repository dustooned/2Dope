/**
 * Canvas view: zoom, pan, rotate and mirror. View state never changes the drawing; it is not
 * exported. Screen = translate(x, y) · rotate(rot) · scale(zoom · flip, zoom) · document.
 */
export class Viewport {
  x = 0;
  y = 0;
  zoom = 1;
  /** Degrees. */
  rot = 0;
  flipped = false;

  static readonly MIN_ZOOM = 0.05;
  static readonly MAX_ZOOM = 32;

  matrix(): DOMMatrix {
    return new DOMMatrix()
      .translate(this.x, this.y)
      .rotate(this.rot)
      .scale(this.zoom * (this.flipped ? -1 : 1), this.zoom);
  }

  screenToDoc(sx: number, sy: number): DOMPoint {
    return this.matrix().inverse().transformPoint(new DOMPoint(sx, sy));
  }

  docToScreen(dx: number, dy: number): DOMPoint {
    return this.matrix().transformPoint(new DOMPoint(dx, dy));
  }

  /** Move the view so document point `d` lands on screen point (sx, sy). */
  anchor(d: DOMPoint, sx: number, sy: number): void {
    this.x = 0;
    this.y = 0;
    const p = this.docToScreen(d.x, d.y);
    this.x = sx - p.x;
    this.y = sy - p.y;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const d = this.screenToDoc(sx, sy);
    this.zoom = Math.min(Viewport.MAX_ZOOM, Math.max(Viewport.MIN_ZOOM, this.zoom * factor));
    this.anchor(d, sx, sy);
  }

  /** Set an absolute rotation (snaps near 0) around screen point (sx, sy). */
  setRotationAt(sx: number, sy: number, deg: number): void {
    const d = this.screenToDoc(sx, sy);
    this.rot = snapRotation(deg);
    this.anchor(d, sx, sy);
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Fit the page in the view; `top` is kept clear (floating bars over the top of the canvas). */
  fit(docW: number, docH: number, viewW: number, viewH: number, margin = 40, top = 0, bottom = 0): void {
    this.rot = 0;
    const z = Math.min((viewW - margin * 2) / docW, (viewH - margin * 2 - top - bottom) / docH);
    this.zoom = Math.min(Viewport.MAX_ZOOM, Math.max(Viewport.MIN_ZOOM, z));
    this.anchor(new DOMPoint(docW / 2, docH / 2), viewW / 2, top + (viewH - top - bottom) / 2);
  }

  actualSize(docW: number, docH: number, viewW: number, viewH: number): void {
    this.zoom = 1;
    this.center(docW, docH, viewW, viewH);
  }

  center(docW: number, docH: number, viewW: number, viewH: number): void {
    this.anchor(new DOMPoint(docW / 2, docH / 2), viewW / 2, viewH / 2);
  }

  toggleFlip(viewW: number, viewH: number): void {
    const d = this.screenToDoc(viewW / 2, viewH / 2);
    this.flipped = !this.flipped;
    this.anchor(d, viewW / 2, viewH / 2);
  }

  resetRotation(viewW: number, viewH: number): void {
    const d = this.screenToDoc(viewW / 2, viewH / 2);
    this.rot = 0;
    this.anchor(d, viewW / 2, viewH / 2);
  }
}

/** Normalize to -180..180 and snap near 0. */
export function snapRotation(deg: number): number {
  let r = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (Math.abs(r) < 3) r = 0;
  return r;
}
