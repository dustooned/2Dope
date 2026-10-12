/** Colour maths for the colour panel: hex <-> RGB <-> HSV (h 0..360, s and v 0..1). Pure. */

export interface HSV {
  h: number;
  s: number;
  v: number;
}

/** "#abc", "abc", "#AABBCC" -> "#aabbcc"; null when it is not a colour. */
export function normalizeHex(s: string): string | null {
  let t = s.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(t)) t = t.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt((normalizeHex(hex) ?? '#000000').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `#${((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1)}`;
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export const hexToHsv = (hex: string): HSV => rgbToHsv(...hexToRgb(hex));
export const hsvToHex = (c: HSV): string => rgbToHex(...hsvToRgb(c));

/** Put `c` first in a recent-colours list (no repeats, at most `max`). */
export function pushRecent(list: readonly string[], c: string, max = 12): string[] {
  const hex = normalizeHex(c);
  if (!hex) return list.slice(0, max);
  return [hex, ...list.filter((x) => x !== hex)].slice(0, max);
}
