import { makeCanvas } from '../brush/raster';
import { paintDrawing, type Drawing } from '../core/project';

export interface OnionSettings {
  enabled: boolean;
  /** Distinct previous drawings to show. */
  before: number;
  /** Distinct next drawings to show. */
  after: number;
  /** Opacity of the nearest ghost (0..1). */
  opacity: number;
  /** Each further ghost is this fraction of the one before it. */
  falloff: number;
  tint: boolean;
  beforeColor: string;
  afterColor: string;
  /** Keep onion skins visible while scrubbing or playing. */
  whileScrubbing: boolean;
  /** Only ghost drawings marked as key poses. */
  keysOnly: boolean;
}

export const DEFAULT_ONION: OnionSettings = {
  enabled: true,
  before: 2,
  after: 1,
  opacity: 0.4,
  falloff: 0.55,
  tint: true,
  beforeColor: '#2f7bff',
  afterColor: '#ff3b5c',
  whileScrubbing: true,
  keysOnly: false,
};

const MAX_CACHE = 8;

/**
 * Tinted ghost images, cached by drawing, revision and color so a render frame is just a few
 * drawImage calls. The oldest entries are dropped past MAX_CACHE (each is one full-size canvas).
 */
export class OnionCache {
  private readonly map = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {}

  clear(): void {
    this.map.clear();
  }

  ghost(d: Drawing, color: string | null): HTMLCanvasElement {
    const key = `${d.id}|${d.rev}|${color ?? '-'}`;
    const hit = this.map.get(key);
    if (hit) {
      // refresh recency
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const c = makeCanvas(this.w, this.h);
    const g = c.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    paintDrawing(g, d);
    if (color) {
      // Recolor everything drawn, keeping its alpha.
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, this.w, this.h);
    }
    this.map.set(key, c);
    while (this.map.size > MAX_CACHE) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    return c;
  }
}
