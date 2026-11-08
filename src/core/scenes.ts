/**
 * Story scenes and stickers, read from and written to the existing captions (no file-format change):
 * a panel's Shot / scene "Sc 2 · Sh 3 · INT. KITCHEN" says its scene and shot; its Camera / framing
 * "CU · Pan left" holds the shot-type and camera-move stickers.
 */

/** Shot types: one per panel. */
export const SHOT_STICKERS = [
  ['EWS', 'Extreme wide shot'],
  ['WS', 'Wide shot'],
  ['MS', 'Medium shot'],
  ['CU', 'Close-up'],
  ['ECU', 'Extreme close-up'],
  ['OTS', 'Over the shoulder'],
  ['POV', 'Point of view'],
] as const;

/** Camera moves: any number per panel. */
export const MOVE_STICKERS = [
  ['Pan left', '←'],
  ['Pan right', '→'],
  ['Tilt up', '↑'],
  ['Tilt down', '↓'],
  ['Dolly in', '⇥'],
  ['Dolly out', '⇤'],
  ['Zoom in', '+'],
  ['Zoom out', '−'],
  ['Truck left', '⇠'],
  ['Truck right', '⇢'],
  ['Shake', '≈'],
] as const;

const SHOT_SET = new Set<string>(SHOT_STICKERS.map(([k]) => k));
const SEP = ' · ';

const tokens = (camera: string | undefined) => (camera ?? '').split(/\s*·\s*/).map((t) => t.trim()).filter(Boolean);

/** The stickers a Camera field holds now. */
export function stickersOf(camera: string | undefined): { shot: string | null; moves: string[] } {
  const t = tokens(camera);
  const shot = t.find((x) => SHOT_SET.has(x.toUpperCase()))?.toUpperCase() ?? null;
  const moves = MOVE_STICKERS.map(([k]) => k).filter((k) => t.some((x) => x.toLowerCase() === k.toLowerCase()));
  return { shot, moves };
}

/** Tap a shot type: it replaces the panel's shot type (tapping the same one clears it). Other text stays. */
export function toggleShot(camera: string | undefined, shot: string): string {
  const t = tokens(camera);
  const had = t.some((x) => x.toUpperCase() === shot);
  const rest = t.filter((x) => !SHOT_SET.has(x.toUpperCase()));
  return (had ? rest : [shot, ...rest]).join(SEP);
}

/** Tap a camera move: on or off. Other text stays. */
export function toggleMove(camera: string | undefined, move: string): string {
  const t = tokens(camera);
  const on = t.some((x) => x.toLowerCase() === move.toLowerCase());
  return (on ? t.filter((x) => x.toLowerCase() !== move.toLowerCase()) : [...t, move]).join(SEP);
}

const SC = /^\s*Sc\.?\s*(\d+)\s*(?:·\s*Sh\.?\s*(\d+))?\s*(?:·\s*)?(.*)$/i;

/** "Sc 2 · Sh 3 · INT. KITCHEN" → { scene 2, shot 3, rest "INT. KITCHEN" }; null when it names no scene. */
export function parseShot(shot: string | undefined): { scene: number; shot: number | null; rest: string } | null {
  const m = SC.exec(shot ?? '');
  if (!m) return null;
  return { scene: Number(m[1]), shot: m[2] ? Number(m[2]) : null, rest: (m[3] ?? '').trim() };
}

/** Each panel's scene number: a panel without "Sc N" belongs to the scene before it (0 = none yet). */
export function scenesOf(shots: readonly (string | undefined)[]): number[] {
  let cur = 0;
  return shots.map((s) => {
    const p = parseShot(s);
    if (p) cur = p.scene;
    return cur;
  });
}

/** A steady colour for a scene number (the same scene always gets the same colour). */
export function sceneColour(scene: number): string {
  const hues = [210, 140, 35, 290, 0, 180, 60, 320];
  return scene <= 0 ? 'transparent' : `hsl(${hues[(scene - 1) % hues.length]} 70% 55%)`;
}

/**
 * Start a new scene at panel `at` and renumber every panel's Shot / scene: scenes count up from 1 in
 * order, shots count up from 1 within each scene. Text after the numbers (a heading) is kept.
 * Panels before the first scene stay as they are.
 */
export function renumberScenes(shots: readonly (string | undefined)[], at: number | null): string[] {
  let scene = 0, shot = 0, prev: number | null = null;
  return shots.map((s, i) => {
    const p = parseShot(s);
    // a scene starts here: the chosen panel, a "Sh 1" or bare "Sc N", or a different scene number
    if (i === at || (p && (prev === null || p.scene !== prev || p.shot === 1 || p.shot === null))) { scene++; shot = 0; }
    if (p) prev = p.scene;
    if (!scene) return s ?? '';
    shot++;
    const rest = p ? p.rest : (s ?? '').trim();
    const label = `Sc ${scene} · Sh ${shot}`;
    return (rest ? `${label} · ${rest}` : label).slice(0, 60);
  });
}
