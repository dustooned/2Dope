/**
 * Layer effects (After Effects style): an ordered stack on a drawings layer, each aimed at the
 * layer's Line, its Fill, or the whole layer. Effects belong to the layer, not to its drawings,
 * so the drawings stay clean and one drawing can look different on different layers.
 *
 * Randomness is seeded (the effect's seed and the held frame), so playback, scrubbing, undo and
 * every export give the same pixels. `hold` makes the pattern change every N frames: line boil
 * on twos or threes, the way hand-drawn boil looks.
 */

import { PALETTES, DITHER_METHODS, type DitherMethod, type PaletteId } from './dither';
import { valueAt, type Interp, type Key, type Prop, type Side } from './anim';

export type EffectType = 'boil' | 'roughen' | 'grain' | 'blur' | 'texture' | 'turbulence' | 'dither' | 'shadow' | 'glow' | 'dirblur' | 'radialblur' | 'posterize' | 'mosaic' | 'edges' | 'threshold' | 'twirl' | 'mirror' | 'offset' | 'wave' | 'fringe' | 'tv' | 'vignette' | 'echo' | 'motionblur' | 'fill' | 'outline' | 'blinds' | 'kaleido' | 'soundwave';

/** Effects added in format 10: older readers drop unknown effect types, so saving one needs reader 10. */
export const FORMAT10_EFFECTS: readonly EffectType[] = ['fill', 'outline', 'blinds', 'kaleido', 'soundwave'];
/** What an effect works on: Ink, Colour, the whole layer, or (captions only) the letters. */
export type EffectTarget = 'line' | 'fill' | 'layer' | 'text';
export const MAX_LAYER_EFFECTS = 16;
export type TextureStyle = 'paper' | 'hatch' | 'dots' | 'weave';
export interface EffectStyleOrigin { v: 1; name: string; effects: LayerEffect[] }

export interface LayerEffect {
  id: string;
  type: EffectType;
  on: boolean;
  target: EffectTarget;
  /**
   * The strength. Boil and turbulence: how far pixels move, in document pixels. Grain and
   * texture: how much of the paint it eats away, in percent.
   */
  amount: number;
  /** The scale, in document pixels: boil wobble, grain speck, texture cell, turbulence swirl. */
  size: number;
  /** A new pattern every this many frames (1 = every frame). Texture never changes. */
  hold: number;
  seed: number;
  /** Texture only: which pattern. */
  style?: TextureStyle;
  /** Dither only: the colours, the method, and grey-first. (Amount is the mix, size the pixel size.) */
  palette?: PaletteId;
  method?: DitherMethod;
  gray?: boolean;
  /** The kind's further settings (direction, colour, centre...), by `EffectDef.extras` key; missing = default. */
  params?: Record<string, number | string | boolean>;
  /**
   * Keyframed settings (in layer time), by setting: `amount`, `size` or a numeric `params` key. A
   * setting without keys keeps its still value. Older builds ignore this (the still values stay).
   */
  keys?: Record<string, Prop<number>>;
}

/** A further setting of an effect kind, stored in `LayerEffect.params`. */
export type ExtraDef =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; unit: string; def: number }
  | { key: string; label: string; kind: 'choice'; options: { id: string; label: string }[]; def: string }
  | { key: string; label: string; kind: 'color'; def: string }
  | { key: string; label: string; kind: 'toggle'; def: boolean }
  /** One of the project's Assets (its first frame), by its comp id; '' = none. */
  | { key: string; label: string; kind: 'asset'; def: string };

export const TEXTURE_STYLES: { id: TextureStyle; label: string }[] = [
  { id: 'paper', label: 'Paper' },
  { id: 'hatch', label: 'Hatch' },
  { id: 'dots', label: 'Dots' },
  { id: 'weave', label: 'Canvas' },
];

export interface EffectDef {
  id: EffectType;
  label: string;
  hint: string;
  target: EffectTarget;
  amount: number;
  size: number;
  hold: number;
  amountRange: readonly [number, number];
  sizeRange: readonly [number, number];
  amountLabel: string;
  sizeLabel: string;
  amountUnit: string;
  sizeUnit: string;
  /** Whether the pattern can change over time (shows the Changes control). */
  animated: boolean;
  /** The pattern comes from the seed (shows New pattern); default: when animated. */
  seeded?: boolean;
  /** Further settings (Advanced). */
  extras?: ExtraDef[];
  /** How far the effect can reach past the art, in document pixels (the layer is padded by it). */
  pad?: (e: LayerEffect) => number;
  /** The result changes from frame to frame even without keys (colour cycling, spin, sound). */
  frameDependent?: (e: LayerEffect) => boolean;
}

export const EFFECT_TYPES: EffectDef[] = [
  { id: 'boil', label: 'Line boil', hint: 'Lines wiggle a little every few frames, like hand-drawn animation', target: 'line', amount: 1.6, size: 22, hold: 2, amountRange: [0, 16], sizeRange: [4, 160], amountLabel: 'Amount', sizeLabel: 'Size', amountUnit: ' px', sizeUnit: ' px', animated: true },
  { id: 'roughen', label: 'Roughen edges', hint: 'Edges crumble and break up a little, like dry ink or a photocopy (roughen edges)', target: 'line', amount: 3, size: 34, hold: 2, amountRange: [0, 20], sizeRange: [8, 160], amountLabel: 'Roughness', sizeLabel: 'Size', amountUnit: ' px', sizeUnit: ' px', animated: true },
  { id: 'turbulence', label: 'Ripple', hint: 'Swirling, rippling warp: heat haze, water, wobbly shapes (turbulent displace)', target: 'layer', amount: 6, size: 90, hold: 2, amountRange: [0, 40], sizeRange: [8, 300], amountLabel: 'Amount', sizeLabel: 'Size', amountUnit: ' px', sizeUnit: ' px', animated: true },
  { id: 'grain', label: 'Film grain', hint: 'Tiny specks in the paint that change every frame, like old film (noise)', target: 'layer', amount: 35, size: 2, hold: 1, amountRange: [0, 100], sizeRange: [1, 16], amountLabel: 'Strength', sizeLabel: 'Speck', amountUnit: '%', sizeUnit: ' px', animated: true },
  { id: 'blur', label: 'Gaussian blur', hint: 'Softens the layer like a camera out of focus, or a dreamy glow (Gaussian blur)', target: 'layer', amount: 6, size: 0, hold: 1, amountRange: [0, 40], sizeRange: [0, 0], amountLabel: 'Blur', sizeLabel: 'Size', amountUnit: ' px', sizeUnit: ' px', animated: false },
  { id: 'echo', label: 'Echo', hint: 'Leave fading copies of earlier artwork frames behind the current layer.', target: 'layer', amount: 45, size: 3, hold: 1, amountRange: [0, 100], sizeRange: [1, 6], amountLabel: 'Fade per copy', sizeLabel: 'Copies', amountUnit: '%', sizeUnit: '', animated: false,
    extras: [{ key: 'spacing', label: 'Frame spacing', kind: 'range', min: 1, max: 12, step: 1, unit: ' frames', def: 1 }] },
  { id: 'motionblur', label: 'Motion blur', hint: 'Smear the current drawing along the layer’s animated movement, rotation and scale.', target: 'layer', amount: 50, size: 5, hold: 1, amountRange: [0, 100], sizeRange: [2, 6], amountLabel: 'Shutter', sizeLabel: 'Samples', amountUnit: '% of frame', sizeUnit: '', animated: false },
  { id: 'shadow', label: 'Drop shadow', hint: 'A shadow behind the art, offset and softened, like a sticker or a cut-out (drop shadow)', target: 'layer', amount: 5, size: 0, hold: 1, amountRange: [0, 120], sizeRange: [0, 100], amountLabel: 'Distance', sizeLabel: 'Softness', amountUnit: ' px', sizeUnit: ' px', animated: false,
    extras: [
      { key: 'angle', label: 'Direction', kind: 'range', min: 0, max: 360, step: 5, unit: '\u00b0', def: 135 },
      { key: 'opacity', label: 'Opacity', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'color', label: 'Colour', kind: 'color', def: '#000000' },
      { key: 'only', label: 'Shadow only', kind: 'toggle', def: false },
    ],
    pad: (e) => e.amount + 1.5 * e.size + 2 },
  { id: 'glow', label: 'Glow', hint: 'The bright parts shine and bloom into their surroundings (glow)', target: 'layer', amount: 10, size: 0, hold: 1, amountRange: [0, 100], sizeRange: [0, 0], amountLabel: 'Radius', sizeLabel: 'Size', amountUnit: ' px', sizeUnit: ' px', animated: false,
    extras: [
      { key: 'threshold', label: 'Threshold', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 60 },
      { key: 'intensity', label: 'Intensity', kind: 'range', min: 0, max: 4, step: 0.1, unit: '\u00d7', def: 1 },
      { key: 'composite', label: 'Original', kind: 'choice', options: [{ id: 'top', label: 'On top' }, { id: 'behind', label: 'Behind' }, { id: 'none', label: 'Glow only' }], def: 'top' },
    ],
    pad: (e) => 1.5 * e.amount + 2 },
  { id: 'dirblur', label: 'Directional blur', hint: 'Streaks along one direction, like something moving fast (directional blur)', target: 'layer', amount: 10, size: 0, hold: 1, amountRange: [0, 100], sizeRange: [0, 0], amountLabel: 'Length', sizeLabel: 'Size', amountUnit: ' px', sizeUnit: ' px', animated: false,
    extras: [{ key: 'angle', label: 'Direction', kind: 'range', min: 0, max: 180, step: 5, unit: '\u00b0', def: 0 }],
    pad: (e) => e.amount / 2 + 2 },
  { id: 'radialblur', label: 'Radial blur', hint: 'Spins around a centre or zooms out from it: impacts, speed, a dizzy look (radial blur)', target: 'layer', amount: 10, size: 0, hold: 1, amountRange: [0, 100], sizeRange: [0, 0], amountLabel: 'Amount', sizeLabel: 'Size', amountUnit: '', sizeUnit: ' px', animated: false,
    extras: [
      { key: 'mode', label: 'Type', kind: 'choice', options: [{ id: 'spin', label: 'Spin' }, { id: 'zoom', label: 'Zoom' }], def: 'spin' },
      { key: 'cx', label: 'Centre across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cy', label: 'Centre down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
    ] },
  { id: 'posterize', label: 'Posterize', hint: 'Fewer shades of each colour: flat, poster-like bands (posterize)', target: 'layer', amount: 6, size: 0, hold: 1, amountRange: [2, 32], sizeRange: [0, 0], amountLabel: 'Levels', sizeLabel: 'Size', amountUnit: '', sizeUnit: '', animated: false },
  { id: 'mosaic', label: 'Mosaic', hint: 'Big square blocks of colour, like a censored or low-res picture (mosaic)', target: 'layer', amount: 10, size: 10, hold: 1, amountRange: [1, 200], sizeRange: [1, 200], amountLabel: 'Blocks across', sizeLabel: 'Blocks down', amountUnit: '', sizeUnit: '', animated: false,
    extras: [{ key: 'sharp', label: 'Sharp colours', kind: 'toggle', def: false }, { key: 'hard', label: 'Hard edges', kind: 'toggle', def: false }] },
  { id: 'edges', label: 'Find edges', hint: 'Only the outlines stay, like a pencil tracing of the picture (find edges)', target: 'layer', amount: 0, size: 0, hold: 1, amountRange: [0, 100], sizeRange: [0, 0], amountLabel: 'Mix with original', sizeLabel: 'Size', amountUnit: '%', sizeUnit: '', animated: false,
    extras: [{ key: 'invert', label: 'Invert', kind: 'toggle', def: false }] },
  { id: 'threshold', label: 'Threshold', hint: 'Every colour becomes black or white, like a photocopy (threshold)', target: 'layer', amount: 128, size: 0, hold: 1, amountRange: [0, 255], sizeRange: [0, 0], amountLabel: 'Level', sizeLabel: 'Size', amountUnit: '', sizeUnit: '', animated: false },
  { id: 'twirl', label: 'Twirl', hint: 'Swirls the middle around like water going down a drain (twirl)', target: 'layer', amount: 90, size: 30, hold: 1, amountRange: [-720, 720], sizeRange: [1, 100], amountLabel: 'Angle', sizeLabel: 'Radius', amountUnit: '\u00b0', sizeUnit: '%', animated: false,
    extras: [
      { key: 'cx', label: 'Centre across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cy', label: 'Centre down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
    ] },
  { id: 'mirror', label: 'Mirror', hint: 'One half reflects onto the other, like a fold or a kaleidoscope (mirror)', target: 'layer', amount: 0, size: 0, hold: 1, amountRange: [0, 360], sizeRange: [0, 0], amountLabel: 'Angle', sizeLabel: 'Size', amountUnit: '\u00b0', sizeUnit: '', animated: false,
    extras: [
      { key: 'cx', label: 'Centre across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cy', label: 'Centre down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
    ] },
  { id: 'offset', label: 'Offset', hint: 'Slides the picture and wraps it round the edges: tiling and scrolling backgrounds (offset)', target: 'layer', amount: 0, size: 0, hold: 1, amountRange: [0, 100], sizeRange: [0, 0], amountLabel: 'Mix with original', sizeLabel: 'Size', amountUnit: '%', sizeUnit: '', animated: false,
    extras: [
      { key: 'x', label: 'Shift across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'y', label: 'Shift down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
    ] },
  { id: 'wave', label: 'Wave warp', hint: 'Waves run through the picture: water, flags, heat haze (wave warp)', target: 'layer', amount: 10, size: 40, hold: 1, amountRange: [0, 100], sizeRange: [1, 500], amountLabel: 'Height', sizeLabel: 'Width', amountUnit: ' px', sizeUnit: ' px', animated: true, seeded: false,
    extras: [
      { key: 'shape', label: 'Wave', kind: 'choice', options: [{ id: 'sine', label: 'Smooth' }, { id: 'triangle', label: 'Triangle' }, { id: 'square', label: 'Square' }, { id: 'saw', label: 'Saw' }], def: 'sine' },
      { key: 'angle', label: 'Direction', kind: 'range', min: 0, max: 360, step: 5, unit: '\u00b0', def: 90 },
      { key: 'speed', label: 'Speed', kind: 'range', min: -5, max: 5, step: 0.1, unit: ' waves/s', def: 1 },
      { key: 'phase', label: 'Phase', kind: 'range', min: 0, max: 360, step: 5, unit: '\u00b0', def: 0 },
      { key: 'pin', label: 'Pin the edges', kind: 'toggle', def: false },
    ],
    pad: (e) => e.amount + 2 },
  { id: 'fringe', label: 'Fringe', hint: 'Fading copies trail off one side of the art, like an echo or a smear (fringe)', target: 'layer', amount: 8, size: 4, hold: 1, amountRange: [0, 40], sizeRange: [1, 8], amountLabel: 'Offset', sizeLabel: 'Copies', amountUnit: ' px', sizeUnit: '', animated: false,
    extras: [
      { key: 'dir', label: 'Direction', kind: 'choice', options: [['0', '\u2191'], ['45', '\u2197'], ['90', '\u2192'], ['135', '\u2198'], ['180', '\u2193'], ['225', '\u2199'], ['270', '\u2190'], ['315', '\u2196']].map(([id, label]) => ({ id: id!, label: label! })), def: '90' },
      { key: 'falloff', label: 'Falloff', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 70 },
    ],
    pad: (e) => e.amount + 2 },
  { id: 'tv', label: 'Retro TV', hint: 'An old TV or VHS tape: static, colour that slips off the lines, rolling picture (analog signal)', target: 'layer', amount: 100, size: 24, hold: 1, amountRange: [0, 100], sizeRange: [4, 120], amountLabel: 'Strength', sizeLabel: 'Noise size', amountUnit: '%', sizeUnit: ' px', animated: true,
    extras: [
      { key: 'static', label: 'Static', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 6 },
      { key: 'chromaLoss', label: 'Chroma loss', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 30 },
      { key: 'chromaShift', label: 'Chroma shift', kind: 'range', min: 0, max: 8, step: 0.5, unit: ' px', def: 2 },
      { key: 'phase', label: 'Phase offset', kind: 'range', min: 0, max: 360, step: 15, unit: '\u00b0', def: 0 },
      { key: 'scanBlur', label: 'Scanline blur', kind: 'range', min: 0, max: 8, step: 1, unit: ' px', def: 0 },
      { key: 'roll', label: 'Roll', kind: 'range', min: -4, max: 4, step: 0.5, unit: ' rows/frame', def: 0 },
      { key: 'speed', label: 'Distortion speed', kind: 'range', min: 0, max: 8, step: 0.5, unit: '', def: 2 },
    ] },
  { id: 'vignette', label: 'Vignette', hint: 'Darker (or lighter) towards the edges of the frame, like an old lens (vignette)', target: 'layer', amount: 50, size: 60, hold: 1, amountRange: [-100, 100], sizeRange: [1, 100], amountLabel: 'Amount', sizeLabel: 'Size', amountUnit: '%', sizeUnit: '%', animated: false,
    extras: [
      { key: 'softness', label: 'Softness', kind: 'range', min: 1, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'round', label: 'Roundness', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cx', label: 'Centre across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cy', label: 'Centre down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
    ] },
  { id: 'texture', label: 'Texture', hint: 'Paper, hatching, dots or canvas weave in the paint (best on the Fill)', target: 'fill', amount: 60, size: 14, hold: 1, amountRange: [0, 100], sizeRange: [3, 80], amountLabel: 'Strength', sizeLabel: 'Scale', amountUnit: '%', sizeUnit: ' px', animated: false },
  { id: 'dither', label: 'Retro pixels', hint: 'Old-console look: chunky pixels and a few colours, mixed with a dot pattern (dither)', target: 'layer', amount: 100, size: 2, hold: 1, amountRange: [0, 100], sizeRange: [1, 16], amountLabel: 'Mix', sizeLabel: 'Pixel size', amountUnit: '%', sizeUnit: ' px', animated: false,
    extras: [
      { key: 'tr', label: 'Red threshold', kind: 'range', min: -100, max: 100, step: 1, unit: '', def: 0 },
      { key: 'tg', label: 'Green threshold', kind: 'range', min: -100, max: 100, step: 1, unit: '', def: 0 },
      { key: 'tb', label: 'Blue threshold', kind: 'range', min: -100, max: 100, step: 1, unit: '', def: 0 },
      { key: 'hard', label: 'Hard edges', kind: 'toggle', def: false },
    ] },
  { id: 'fill', label: 'Fill', hint: 'Recolour everything visible, keeping its shape and soft edges (fill)', target: 'layer', amount: 100, size: 0, hold: 1, amountRange: [0, 100], sizeRange: [0, 0], amountLabel: 'Opacity', sizeLabel: 'Size', amountUnit: '%', sizeUnit: '', animated: false, seeded: false,
    extras: [
      { key: 'color', label: 'Colour', kind: 'color', def: '#e24b4a' },
      { key: 'mode', label: 'Mode', kind: 'choice', options: [{ id: 'replace', label: 'Replace' }, { id: 'tint', label: 'Tint (keep shading)' }, { id: 'multiply', label: 'Multiply' }], def: 'replace' },
    ] },
  { id: 'outline', label: 'Outline', hint: 'Coloured lines around the edge of the art: one, or many that repeat and cycle colours (stroke)', target: 'layer', amount: 4, size: 0, hold: 1, amountRange: [0, 60], sizeRange: [0, 20], amountLabel: 'Width', sizeLabel: 'Softness', amountUnit: ' px', sizeUnit: ' px', animated: false, seeded: false,
    extras: [
      { key: 'color', label: 'Colour', kind: 'color', def: '#000000' },
      { key: 'position', label: 'Position', kind: 'choice', options: [{ id: 'outside', label: 'Outside' }, { id: 'centre', label: 'Centre' }, { id: 'inside', label: 'Inside' }], def: 'outside' },
      { key: 'mode', label: 'Mode', kind: 'choice', options: [{ id: 'around', label: 'Around' }, { id: 'trail', label: 'Trail' }], def: 'around' },
      { key: 'count', label: 'Lines', kind: 'range', min: 1, max: 24, step: 1, unit: '', def: 1 },
      { key: 'every', label: 'Trail spacing', kind: 'range', min: 1, max: 12, step: 1, unit: ' frames', def: 2 },
      { key: 'gap', label: 'Gap', kind: 'range', min: 0, max: 60, step: 1, unit: ' px', def: 4 },
      { key: 'taper', label: 'Taper', kind: 'range', min: 0, max: 100, step: 5, unit: '%', def: 0 },
      { key: 'fade', label: 'Fade out', kind: 'range', min: 0, max: 100, step: 5, unit: '%', def: 0 },
      { key: 'palette', label: 'Colours', kind: 'choice', options: [{ id: 'one', label: 'One colour' }, { id: 'rainbow', label: 'Rainbow' }, { id: 'fire', label: 'Fire' }, { id: 'neon', label: 'Neon' }, { id: 'mono', label: 'Mono' }, { id: 'custom', label: 'Custom (4)' }], def: 'one' },
      { key: 'color2', label: 'Colour 2', kind: 'color', def: '#ffffff' },
      { key: 'color3', label: 'Colour 3', kind: 'color', def: '#378add' },
      { key: 'color4', label: 'Colour 4', kind: 'color', def: '#e24b4a' },
      { key: 'cycle', label: 'Cycle', kind: 'range', min: -20, max: 20, step: 0.5, unit: ' lines/s', def: 0 },
      { key: 'shift', label: 'Colour offset', kind: 'range', min: 0, max: 24, step: 0.1, unit: '', def: 0 },
      { key: 'paint', label: 'Paint', kind: 'choice', options: [{ id: 'solid', label: 'Solid' }, { id: 'gradient', label: 'Gradient' }, { id: 'hatch', label: 'Hatch' }, { id: 'dots', label: 'Dots' }, { id: 'weave', label: 'Canvas' }, { id: 'picture', label: 'Picture' }], def: 'solid' },
      { key: 'paintScale', label: 'Paint size', kind: 'range', min: 2, max: 64, step: 1, unit: ' px', def: 6 },
      { key: 'picture', label: 'Picture', kind: 'asset', def: '' },
      { key: 'pictureSize', label: 'Picture size', kind: 'range', min: 5, max: 400, step: 5, unit: '%', def: 100 },
      { key: 'accent', label: 'Line to change', kind: 'range', min: 0, max: 24, step: 1, unit: '', def: 0 },
      { key: 'accentEvery', label: 'Repeat every', kind: 'range', min: 0, max: 12, step: 1, unit: ' lines', def: 0 },
      { key: 'accentColor', label: 'Its colour', kind: 'color', def: '#ffd23f' },
      { key: 'accentWidth', label: 'Its width', kind: 'range', min: 25, max: 400, step: 5, unit: '%', def: 100 },
      { key: 'corners', label: 'Corners', kind: 'choice', options: [{ id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }], def: 'round' },
      { key: 'blend', label: 'Blend', kind: 'choice', options: [{ id: 'normal', label: 'Normal' }, { id: 'add', label: 'Add' }, { id: 'screen', label: 'Screen' }, { id: 'multiply', label: 'Multiply' }], def: 'normal' },
      { key: 'only', label: 'Outline only', kind: 'toggle', def: false },
    ],
    pad: (e) => outlineReach(e) + e.size + 2,
    frameDependent: (e) => Number(param<number>(e, 'cycle')) !== 0 && (Math.round(Number(param<number>(e, 'count'))) > 1 || param<string>(e, 'palette') !== 'one' || param<string>(e, 'mode') === 'trail') },
  { id: 'blinds', label: 'Venetian blinds', hint: 'Slats close across the layer to hide it or open to reveal it (Venetian blinds)', target: 'layer', amount: 0, size: 30, hold: 1, amountRange: [0, 100], sizeRange: [2, 400], amountLabel: 'Completion', sizeLabel: 'Slat width', amountUnit: '%', sizeUnit: ' px', animated: false, seeded: true,
    extras: [
      { key: 'angle', label: 'Direction', kind: 'range', min: 0, max: 360, step: 1, unit: '°', def: 0 },
      { key: 'feather', label: 'Feather', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 0 },
      { key: 'style', label: 'Style', kind: 'choice', options: [{ id: 'wipe', label: 'Wipe' }, { id: 'split', label: 'Split' }, { id: 'iris', label: 'Iris' }], def: 'wipe' },
      { key: 'stagger', label: 'Stagger', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 0 },
      { key: 'order', label: 'Order', kind: 'choice', options: [{ id: 'forward', label: 'Forward' }, { id: 'reverse', label: 'Reverse' }, { id: 'middle', label: 'Middle out' }, { id: 'random', label: 'Random' }], def: 'forward' },
      { key: 'scroll', label: 'Scroll', kind: 'range', min: -100, max: 100, step: 1, unit: '%', def: 0 },
      { key: 'shade', label: 'Shade', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 0 },
      { key: 'reveal', label: 'Closed slats show colour', kind: 'toggle', def: false },
      { key: 'color', label: 'Slat colour', kind: 'color', def: '#222222' },
      { key: 'invert', label: 'Invert', kind: 'toggle', def: false },
    ] },
  { id: 'kaleido', label: 'Kaleidoscope', hint: 'Mirrored slices turn the picture into a kaleidoscope pattern (kaleida)', target: 'layer', amount: 6, size: 100, hold: 1, amountRange: [2, 32], sizeRange: [10, 400], amountLabel: 'Segments', sizeLabel: 'Size', amountUnit: '', sizeUnit: '%', animated: false, seeded: false,
    extras: [
      { key: 'style', label: 'Style', kind: 'choice', options: [{ id: 'flower', label: 'Flower' }, { id: 'wheel', label: 'Wheel' }, { id: 'starlish', label: 'Starlish' }, { id: 'unfold', label: 'Unfold' }, { id: 'triangles', label: 'Triangles' }], def: 'flower' },
      { key: 'cx', label: 'Centre across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cy', label: 'Centre down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'rotation', label: 'Rotation', kind: 'range', min: -360, max: 360, step: 1, unit: '°', def: 0 },
      { key: 'source', label: 'Source angle', kind: 'range', min: 0, max: 360, step: 1, unit: '°', def: 0 },
      { key: 'spin', label: 'Spin', kind: 'range', min: -180, max: 180, step: 1, unit: '°/s', def: 0 },
      { key: 'mix', label: 'Mix with original', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 0 },
    ],
    frameDependent: (e) => Number(param<number>(e, 'spin')) !== 0 },
  { id: 'soundwave', label: 'Sound wave', hint: 'Draws the shot’s sound as a moving wave or spectrum bars; effects after it act on the wave (audio waveform, audio spectrum)', target: 'layer', amount: 80, size: 3, hold: 1, amountRange: [0, 1000], sizeRange: [0.5, 60], amountLabel: 'Height', sizeLabel: 'Thickness', amountUnit: ' px', sizeUnit: ' px', animated: false, seeded: false,
    extras: [
      { key: 'type', label: 'Type', kind: 'choice', options: [{ id: 'waveform', label: 'Waveform' }, { id: 'spectrum', label: 'Spectrum' }], def: 'waveform' },
      { key: 'shape', label: 'Shape', kind: 'choice', options: [{ id: 'line', label: 'Line' }, { id: 'circle', label: 'Circle' }], def: 'line' },
      { key: 'x1', label: 'Start across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 10 },
      { key: 'y1', label: 'Start down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'x2', label: 'End across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 90 },
      { key: 'y2', label: 'End down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cx', label: 'Centre across', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'cy', label: 'Centre down', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 50 },
      { key: 'radius', label: 'Radius', kind: 'range', min: 1, max: 100, step: 1, unit: '%', def: 25 },
      { key: 'detail', label: 'Detail', kind: 'range', min: 8, max: 1024, step: 1, unit: '', def: 128 },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 0 },
      { key: 'look', label: 'Look', kind: 'choice', options: [{ id: 'bars', label: 'Bars' }, { id: 'lines', label: 'Lines' }, { id: 'dots', label: 'Dots' }], def: 'lines' },
      { key: 'sides', label: 'Sides', kind: 'choice', options: [{ id: 'up', label: 'Up' }, { id: 'down', label: 'Down' }, { id: 'both', label: 'Both' }], def: 'both' },
      { key: 'window', label: 'Window', kind: 'range', min: 10, max: 1000, step: 1, unit: ' ms', def: 80 },
      { key: 'offsetMs', label: 'Offset', kind: 'range', min: -2000, max: 2000, step: 1, unit: ' ms', def: 0 },
      { key: 'low', label: 'Low', kind: 'range', min: 20, max: 20000, step: 1, unit: ' Hz', def: 40 },
      { key: 'high', label: 'High', kind: 'range', min: 20, max: 20000, step: 1, unit: ' Hz', def: 4000 },
      { key: 'smoothing', label: 'Smoothing', kind: 'range', min: 0, max: 100, step: 1, unit: '%', def: 0 },
      { key: 'color', label: 'Inside colour', kind: 'color', def: '#ffffff' },
      { key: 'color2', label: 'Outside colour', kind: 'color', def: '#378add' },
      { key: 'over', label: 'Over original', kind: 'toggle', def: false },
    ],
    pad: (e) => (param<string>(e, 'shape') === 'circle' ? e.amount + e.size : 0),
    frameDependent: () => true },
];

/** Outline's lines reach at most this far (document pixels), whatever the count. */
export const OUTLINE_MAX_REACH = 480;

/** How far Outline's lines reach past the art (all lines, before softness), capped so a high count cannot flood the shot. */
export function outlineReach(e: LayerEffect): number {
  const count = Math.max(1, Math.round(Number(param<number>(e, 'count')) || 1));
  const w = Math.max(0, e.amount), gap = Math.max(0, Number(param<number>(e, 'gap')) || 0);
  // a changed line that is wider adds its extra width (counted once per line it applies to)
  const accent = Math.round(Number(param<number>(e, 'accent')) || 0), every = Math.round(Number(param<number>(e, 'accentEvery')) || 0);
  const k = Math.max(1, Number(param<number>(e, 'accentWidth')) / 100 || 1);
  const changed = accent > 0 && accent <= count ? (every > 0 ? Math.floor((count - accent) / every) + 1 : 1) : 0;
  return Math.min(OUTLINE_MAX_REACH, count * w + (count - 1) * gap + changed * w * (k - 1));
}

export const EFFECT_LIMITS = { hold: [1, 8] as const };

/** One further setting of an effect (its stored value, or the kind's default). */
export function param<T extends number | string | boolean>(e: LayerEffect, key: string): T {
  const x = effectDef(e.type).extras?.find((d) => d.key === key);
  const v = e.params?.[key];
  return (v !== undefined ? v : x?.def) as T;
}

/** How far the layer is padded for its effects (shadows and glows reach past the art). Keyed settings pad for their largest value. */
/**
 * How far a layer's own art reaches past its page (set by the renderer: a caption placed or grown
 * past the page edge), so effects work on all of it instead of cutting it at the page.
 */
let layerReach: (l: { id: string }) => number = () => 0;
export function setLayerReach(f: (l: { id: string }) => number): void { layerReach = f; }
export function artReach(l: { id: string }): number { return Math.ceil(layerReach(l)); }

export function effectsPad(l: { id: string; effects?: LayerEffect[] }): number {
  let pad = artReach(l);
  for (const e of activeEffects(l)) {
    const big = { ...e, params: { ...e.params } };
    for (const [k, p] of Object.entries(e.keys ?? {})) {
      const most = Math.max(...p.keys.map((x) => Math.abs(x.v)), Math.abs(p.value));
      if (k === 'amount') big.amount = most; else if (k === 'size') big.size = most; else big.params[k] = most;
    }
    pad += effectDef(e.type).pad?.(big) ?? 0;
  }
  return Math.ceil(pad);
}

/** The settings an effect can keyframe: Amount, Size (when the kind has one) and its numeric extras. */
export function keyableSettings(type: EffectType): { key: string; label: string; min: number; max: number; unit: string }[] {
  const d = effectDef(type);
  const out = [{ key: 'amount', label: d.amountLabel, min: d.amountRange[0], max: d.amountRange[1], unit: d.amountUnit }];
  if (d.sizeRange[1] > 0) out.push({ key: 'size', label: d.sizeLabel, min: d.sizeRange[0], max: d.sizeRange[1], unit: d.sizeUnit });
  for (const x of d.extras ?? []) if (x.kind === 'range') out.push({ key: x.key, label: x.label, min: x.min, max: x.max, unit: x.unit });
  return out;
}

/** A setting's still value (what it is without keys). */
export function stillSetting(e: LayerEffect, key: string): number {
  if (key === 'amount') return e.amount;
  if (key === 'size') return e.size;
  return Number(param<number>(e, key)) || 0;
}

/** The effect as it is at a layer frame: keyed settings take their animated value (clamped to the setting's range). */
export function effectAt(e: LayerEffect, frame: number): LayerEffect {
  if (!e.keys) return e;
  const out: LayerEffect = { ...e, params: { ...e.params } };
  const lim = new Map(keyableSettings(e.type).map((s) => [s.key, s]));
  for (const [k, p] of Object.entries(e.keys)) {
    const s = lim.get(k);
    if (!s || !p.keys.length) continue;
    const v = Math.min(s.max, Math.max(s.min, valueAt(p, frame)));
    if (k === 'amount') out.amount = v; else if (k === 'size') out.size = v; else out.params![k] = v;
  }
  return out;
}

/** Validate stored keyframes of effect settings (unknown settings and bad keys dropped). */
function readEffectKeys(type: EffectType, v: unknown): Record<string, Prop<number>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const ok = new Set(keyableSettings(type).map((s) => s.key)), out: Record<string, Prop<number>> = {};
  const side = (x: unknown): Side | null => {
    const r = x as Record<string, unknown> | null;
    if (!r || (r.interp !== 'linear' && r.interp !== 'bezier' && r.interp !== 'hold')) return null;
    const slope = typeof r.slope === 'number' && Number.isFinite(r.slope) ? r.slope : 0, influence = typeof r.influence === 'number' && Number.isFinite(r.influence) ? Math.min(1, Math.max(0.01, r.influence)) : 1 / 3;
    return { interp: r.interp as Interp, slope, influence };
  };
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const r = raw as Record<string, unknown> | null;
    if (!ok.has(k) || !r || typeof r.value !== 'number' || !Number.isFinite(r.value) || !Array.isArray(r.keys)) continue;
    const keys: Key<number>[] = [];
    for (const kr of r.keys.slice(0, 20000) as Record<string, unknown>[]) {
      const i = side(kr?.in), o = side(kr?.out);
      if (!kr || typeof kr.f !== 'number' || !Number.isInteger(kr.f) || typeof kr.v !== 'number' || !Number.isFinite(kr.v) || !i || !o) continue;
      if (keys.length && keys[keys.length - 1]!.f >= kr.f) continue;
      keys.push({ f: kr.f, v: kr.v, in: i, out: o });
    }
    if (keys.length) out[k] = { value: r.value, keys };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Validate stored further settings against the kind (unknown keys dropped, numbers clamped). */
function readParams(def: EffectDef, v: unknown): Record<string, number | string | boolean> | undefined {
  if (!def.extras || !v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>, out: Record<string, number | string | boolean> = {};
  for (const x of def.extras) {
    const y = r[x.key];
    if (x.kind === 'range' && typeof y === 'number' && Number.isFinite(y)) out[x.key] = Math.min(x.max, Math.max(x.min, y));
    else if (x.kind === 'choice' && typeof y === 'string' && x.options.some((o) => o.id === y)) out[x.key] = y;
    else if (x.kind === 'color' && typeof y === 'string' && /^#[0-9a-f]{6}$/i.test(y)) out[x.key] = y;
    else if (x.kind === 'toggle' && typeof y === 'boolean') out[x.key] = y;
    else if (x.kind === 'asset' && typeof y === 'string' && /^[A-Za-z0-9_:-]{0,80}$/.test(y)) out[x.key] = y;
  }
  return Object.keys(out).length ? out : undefined;
}

export const TARGET_NAMES: Record<EffectTarget, string> = { line: 'Ink', fill: 'Colour', layer: 'Whole layer', text: 'Text' };
/** On a caption the same targets read as its parts. */
export const CAPTION_TARGET_NAMES: Record<EffectTarget, string> = { line: 'Balloon ink', fill: 'Balloon fill', layer: 'Whole caption', text: 'Text' };

/** An effect's name without its emoji (for undo steps and notices). */
export function plainName(d: EffectDef): string {
  return d.label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

export function effectDef(type: EffectType): EffectDef {
  return EFFECT_TYPES.find((t) => t.id === type) ?? EFFECT_TYPES[0]!;
}

export function newEffect(type: EffectType, id: string, seed: number): LayerEffect {
  const d = effectDef(type);
  const e: LayerEffect = { id, type: d.id, on: true, target: d.target, amount: d.amount, size: d.size, hold: d.hold, seed: seed >>> 0 };
  if (d.id === 'texture') e.style = 'paper';
  if (d.id === 'dither') { e.palette = 'pico8'; e.method = 'bayer4'; e.gray = false; }
  return e;
}

/** Which pattern of an effect shows at a layer frame (changes every `hold` frames). */
export function effectTick(e: LayerEffect, frame: number): number {
  if (!effectDef(e.type).animated) return 0;
  return Math.floor(frame / Math.max(1, Math.round(e.hold)));
}

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** Validate effects from a file (unknown types and bad values are dropped or clamped). */
export function readEffects(v: unknown): LayerEffect[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LayerEffect[] = [];
  for (const raw of v.slice(0, MAX_LAYER_EFFECTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (!EFFECT_TYPES.some((t) => t.id === r.type)) continue;
    const num = (x: unknown, lim: readonly [number, number], d: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, lim) : d);
    const def = EFFECT_TYPES.find((t) => t.id === r.type)!;
    out.push({
      id: typeof r.id === 'string' && r.id.length <= 40 ? r.id : `fx${out.length + 1}`,
      type: def.id,
      on: r.on !== false,
      target: temporalEffect(def.id) ? 'layer' : r.target === 'fill' || r.target === 'layer' || r.target === 'text' ? r.target : r.target === 'line' ? 'line' : def.target,
      amount: num(r.amount, def.amountRange, def.amount),
      size: num(r.size, def.sizeRange, def.size),
      hold: Math.round(num(r.hold, EFFECT_LIMITS.hold, def.hold)),
      seed: typeof r.seed === 'number' && Number.isFinite(r.seed) ? r.seed >>> 0 : 1,
      ...(def.id === 'texture' ? { style: TEXTURE_STYLES.some((t) => t.id === r.style) ? (r.style as TextureStyle) : 'paper' } : {}),
      ...(def.id === 'dither'
        ? {
            palette: PALETTES.some((p) => p.id === r.palette) ? (r.palette as PaletteId) : 'pico8',
            method: DITHER_METHODS.some((m) => m.id === r.method) ? (r.method as DitherMethod) : 'bayer4',
            gray: r.gray === true,
          }
        : {}),
    });
    const params = readParams(def, r.params);
    if (params) out[out.length - 1]!.params = params;
    const keys = readEffectKeys(def.id, r.keys);
    if (keys) out[out.length - 1]!.keys = keys;
  }
  return out.length ? out : undefined;
}

/** Optional project snapshot, independent of the device library; includes pre-existing Append keys. */
export function readEffectStyleOrigin(raw: unknown): EffectStyleOrigin {
  const r = raw as Partial<EffectStyleOrigin> | null;
  if (!r || typeof r !== 'object' || r.v !== 1 || typeof r.name !== 'string' || !r.name.trim() || r.name.trim().length > 40 || !Array.isArray(r.effects) || !r.effects.length || r.effects.length > MAX_LAYER_EFFECTS) throw new Error('Invalid applied effect preset snapshot.');
  const effects = readEffects(r.effects);
  if (!effects || effects.length !== r.effects.length) throw new Error('Unsupported effect in the applied preset snapshot.');
  return { v: 1, name: r.name.trim(), effects };
}

/**
 * Live preview while a slider moves (no undo step until it is let go): the effects to show for a
 * layer instead of its saved ones.
 */
export const effectPreview = new Map<string, LayerEffect[]>();

/** The effects that draw for a layer (preview first, then its own), switched-on only. */
export function activeEffects(l: { id: string; effects?: LayerEffect[] }): LayerEffect[] {
  const list = effectPreview.get(l.id) ?? l.effects ?? [];
  return list.filter((e) => e.on);
}

export function temporalEffect(type: EffectType): boolean {
  return type === 'echo' || type === 'motionblur';
}

/** An Outline in Trail mode: outlines of earlier frames are drawn behind the current one. */
export function outlineTrail(e: LayerEffect): boolean {
  return e.type === 'outline' && param<string>(e, 'mode') === 'trail';
}

/** One effect of each kind keeps temporal work bounded even when past drawings contain clips. */
export function temporalSamples(l: { id: string; in: number; start: number; effects?: LayerEffect[] }, frame: number) {
  const effects = activeEffects(l);
  const echo = effects.find(e => e.type === 'echo');
  const blur = effects.find(e => e.type === 'motionblur');
  const echoes: { frame: number; alpha: number }[] = [];
  const poses: number[] = [];
  // Outline Trail: earlier frames, oldest first, each drawn as its outline in the next colour
  const trails: { frame: number; index: number; alpha: number; effect: LayerEffect }[] = [];
  const trail = effects.find(outlineTrail);
  if (trail) {
    const e = effectAt(trail, frame - l.start), n = Math.max(1, Math.min(24, Math.round(Number(param<number>(e, 'count')) || 1)));
    const every = Math.max(1, Math.round(Number(param<number>(e, 'every')) || 1)), fade = Math.max(0, Math.min(1, Number(param<number>(e, 'fade')) / 100));
    for (let i = n - 1; i > 0; i--) {
      const at = frame - every * i;
      if (at < Math.max(0, l.in)) continue;
      // a copy of the effect for that earlier frame: one line, its own colour, outline only
      const copy: LayerEffect = { ...trail, params: { ...trail.params, mode: 'around', count: 1, only: true, shift: (Number(param<number>(e, 'shift')) || 0) + i } };
      trails.push({ frame: at, index: i, alpha: 1 - fade * (i / Math.max(1, n - 1)), effect: copy });
    }
  }
  if (echo) {
    const e = effectAt(echo, frame - l.start);
    const spacing = Math.round(param<number>(e, 'spacing'));
    if (e.amount > 0) for (let i = Math.round(e.size); i > 0; i--) {
      const at = frame - spacing * i;
      if (at >= Math.max(0, l.in)) echoes.push({ frame: at, alpha: (e.amount / 100) ** i });
    }
  }
  if (blur) {
    const e = effectAt(blur, frame - l.start);
    const count = Math.round(e.size);
    if (e.amount > 0) for (let i = count - 1; i >= 0; i--) {
      poses.push(Math.max(0, l.in, frame - (e.amount / 100) * i / (count - 1)));
    }
  }
  return { echoes, poses, trails };
}

/** A short signature of what effects do at a frame (frame keys, caches). */
/** What an Asset used as a picture currently shows (set by the app), so effects using it redraw when it changes. */
let pictureStamp: (id: string) => string = () => '';
export function setPictureStamp(f: (id: string) => string): void { pictureStamp = f; }

export function effectsKey(l: { id: string; effects?: LayerEffect[] }, frame: number): string {
  const fx = activeEffects(l);
  return fx.length ? fx.map((e) => effectAt(e, frame)).map((e) => `${e.type}:${e.target}:${e.amount}:${e.size}:${e.style ?? ''}:${e.palette ?? ''}:${e.method ?? ''}:${e.gray ? 'g' : ''}:${e.seed}:${effectTick(e, frame)}${effectDef(e.type).frameDependent?.(e) ? `@${frame}` : ''}${e.params ? `:${JSON.stringify(e.params)}` : ''}${e.type === 'outline' && param<string>(e, 'paint') === 'picture' && param<string>(e, 'picture') ? `~${pictureStamp(param<string>(e, 'picture'))}` : ''}`).join(',') : '';
}

// ---------------------------------------------------------------------------------------------
// The stack (the Effects card): reorder, duplicate, merge

/** The list with the effect at `from` moved to `to` (both clamped). */
export function moveEffect(list: LayerEffect[], from: number, to: number): LayerEffect[] {
  if (from < 0 || from >= list.length) return list;
  const t = Math.max(0, Math.min(list.length - 1, to));
  if (t === from) return list;
  const next = [...list];
  const [e] = next.splice(from, 1);
  next.splice(t, 0, e!);
  return next;
}

/** Two effects merge when they are the same kind aimed at the same part. */
export function canMerge(a: LayerEffect | undefined, b: LayerEffect | undefined): boolean {
  return !!a && !!b && a.type === b.type && a.target === b.target;
}

/**
 * Merge down: the effect at `index` and the one under it become one. The amounts add up (to the
 * kind's limit); the rest of the settings are the lower one's. Different kinds do not merge.
 */
export function mergeDown(list: LayerEffect[], index: number): LayerEffect[] | null {
  const a = list[index], b = list[index + 1];
  if (!a || !b || !canMerge(a, b)) return null;
  const hi = effectDef(b.type).amountRange[1];
  const merged: LayerEffect = { ...b, on: a.on || b.on, amount: Math.min(hi, Math.round((a.amount + b.amount) * 10) / 10) };
  return [...list.slice(0, index), merged, ...list.slice(index + 2)];
}

/** A copy of the effect right under it, with a new id. */
export function duplicateEffect(list: LayerEffect[], index: number, id: string): LayerEffect[] {
  const e = list[index];
  if (!e) return list;
  return [...list.slice(0, index + 1), { ...structuredClone(e), id }, ...list.slice(index + 1)];
}

/** The effect back to its kind's starting values (keeps id, seed, on, target and look). */
export function resetEffect(e: LayerEffect): LayerEffect {
  const d = effectDef(e.type);
  const { params: _drop, ...rest } = e;
  return { ...rest, amount: d.amount, size: d.size, hold: d.hold };
}
