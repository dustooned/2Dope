/** The few parts of fontkit 2Dope uses (only for WOFF2 fonts, which opentype.js cannot read). */
declare module 'fontkit' {
  export interface Glyph {
    advanceWidth: number;
    path: { commands: { command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'; args: number[] }[] };
  }
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    glyphForCodePoint(cp: number): Glyph;
  }
  export function create(buffer: Uint8Array): Font | { fonts: Font[] };
}
