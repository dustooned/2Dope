/**
 * Boiling grain: a brush's paper grain can stay fixed to the canvas (missing `grainBoil`, today's
 * behaviour) or move with the frame the stroke is painted on, so painted animation "boils".
 *
 * The move is a pure function of the frame: the grain tile shifts by a fraction of its own size,
 * stepping once every `grainBoil` frames. The steps follow the R2 low-discrepancy sequence, so two
 * neighbouring steps are always far apart on the tile (a visible change), never repeat in practice,
 * and the same frame always gives the same shift (preview, redraw and every export match).
 */

/** How often the grain moves: 1 = every frame, 2 = every 2nd frame, 3 = every 3rd frame. */
export type GrainBoil = 1 | 2 | 3;

export const GRAIN_BOIL_OPTIONS: readonly { value: GrainBoil | undefined; label: string; title: string }[] = [
  { value: undefined, label: 'Fixed', title: 'The grain stays fixed to the canvas on every frame (steady texture)' },
  { value: 1, label: 'Boil', title: 'The grain moves on every frame (a living, painterly boil)' },
  { value: 2, label: 'On 2s', title: 'The grain moves every 2nd frame' },
  { value: 3, label: 'On 3s', title: 'The grain moves every 3rd frame' },
];

/** A stored value as a boil setting; anything else is Fixed (undefined). */
export function readGrainBoil(v: unknown): GrainBoil | undefined {
  return v === 1 || v === 2 || v === 3 ? v : undefined;
}

/** Which grain step a frame paints with (0 for Fixed, and for the first step of a boil). */
export function grainBoilStep(boil: unknown, frame: number): number {
  const every = readGrainBoil(boil);
  if (!every || !Number.isFinite(frame)) return 0;
  return Math.floor(Math.floor(frame) / every);
}

const R2X = 0.7548776662466927; // 1 / plastic number
const R2Y = 0.5698402909980532; // 1 / plastic number²

const frac = (v: number): number => ((v % 1) + 1) % 1;

/**
 * The grain shift for a frame, as fractions of the grain tile (0..1 on each axis). Fixed, and a
 * boil's first step, give {0, 0}: the grain sits exactly where a Fixed brush puts it.
 */
export function grainBoilShift(boil: unknown, frame: number): { x: number; y: number } {
  const step = grainBoilStep(boil, frame);
  if (step === 0) return { x: 0, y: 0 };
  return { x: frac(step * R2X), y: frac(step * R2Y) };
}
