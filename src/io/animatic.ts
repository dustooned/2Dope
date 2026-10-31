import { frameContent, type Comp, type DrawingsLayer } from '../core/comp';
import { boardCues, cueAt, type Cue } from '../core/dialogue';
import type { Project } from '../core/project';
import { drawComp } from '../view/composite';
import type { VideoPicture } from './exportvideo';
import type { VideoPlan } from './videoplan';

/**
 * An animatic: the board's panels on their timing as a video, with the shot's sound. It never
 * renders by itself; it is one of the formats picked when exporting (Share, or Story's Export).
 */
export interface AnimaticOptions {
  /** 'board' = the panels only; 'shot' = the whole shot with the board in it (animation over the board). */
  picture: 'board' | 'shot';
  /** Burn the dialogue lines into the picture as subtitles. */
  burn: boolean;
  /** Also save the dialogue lines as a subtitle file (.srt) beside the video. */
  srt: boolean;
}

export const DEFAULT_ANIMATIC: AnimaticOptions = { picture: 'board', burn: true, srt: false };

/** Device preferences are untrusted and may have been written by an older build. */
export function animaticOptions(raw: unknown): AnimaticOptions {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { picture: r.picture === 'shot' ? 'shot' : 'board', burn: r.burn !== false, srt: r.srt === true };
}

/** The storyboard of a comp (its guide drawing layer), or null. */
export function boardOf(comp: Comp): DrawingsLayer | null {
  return comp.layers.find((l): l is DrawingsLayer => l.kind === 'drawings' && l.guide === true) ?? null;
}

/** The animatic runs from frame 0 to the end of the last panel. */
export function animaticLength(board: DrawingsLayer): number {
  return board.start + board.exposures.reduce((n, e) => n + e.length, 0);
}

/**
 * One subtitle burned in at the bottom centre, in output pixels: a dark box, the speaker in
 * bold yellow and the words in white, wrapped to at most three lines.
 */
export function drawSubtitle(g: CanvasRenderingContext2D, cue: Pick<Cue, 'who' | 'text'>, width: number, height: number): void {
  const size = Math.max(10, Math.round(Math.min(width, height) * 0.05));
  const font = (bold: boolean) => `${bold ? '700' : '500'} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const maxW = width * 0.84;
  const who = cue.who ? `${cue.who}: ` : '';
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = font(true);
  const whoW = who ? g.measureText(who).width : 0;
  g.font = font(false);
  // wrap words; the first line starts after the speaker
  const lines: string[] = [];
  let line = '';
  for (const word of cue.text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    const room = lines.length ? maxW : maxW - whoW;
    if (line && g.measureText(next).width > room) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${lines[2]!.replace(/\s*\S*$/, '')}…`;
  }
  const lead = size * 1.25;
  const widths = lines.map((l, i) => g.measureText(l).width + (i === 0 ? whoW : 0));
  const boxW = Math.min(width - size, Math.max(...widths, whoW) + size * 1.2);
  const boxH = lines.length * lead + size * 0.6;
  const x = (width - boxW) / 2;
  const y = height - boxH - Math.max(size * 0.8, height * 0.06);
  g.globalAlpha = 0.74;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(x, y, boxW, boxH, size * 0.3);
  g.fill();
  g.globalAlpha = 1;
  g.textBaseline = 'alphabetic';
  lines.forEach((l, i) => {
    const lx = (width - widths[i]!) / 2;
    const ly = y + size * 0.3 + (i + 1) * lead - size * 0.3;
    if (i === 0 && who) {
      g.font = font(true);
      g.fillStyle = '#ffd84a';
      g.fillText(who, lx, ly);
      g.font = font(false);
    }
    g.fillStyle = '#fff';
    g.fillText(l, lx + (i === 0 ? whoW : 0), ly);
  });
  g.restore();
}

/**
 * Paint one animatic frame into `g` (identity transform, `width` × `height` pixels, background
 * filled): the board (or the shot with its board) letterboxed into the frame, then the subtitle.
 */
export function paintAnimatic(g: CanvasRenderingContext2D, project: Project, comp: Comp, board: DrawingsLayer, frame: number, opts: AnimaticOptions, cues: readonly Cue[], width: number, height: number): void {
  const k = Math.min(width / comp.width, height / comp.height);
  g.save();
  g.setTransform(k, 0, 0, k, (width - comp.width * k) / 2, (height - comp.height * k) / 2);
  g.imageSmoothingQuality = 'high';
  // the board-only picture ignores the shot's camera: panels show as they were drawn
  drawComp(g, project, comp, frame, opts.picture === 'board' ? { backgrounds: true, export: true, guide: board.id, onlyGuide: true, camera: false } : { backgrounds: true, export: true, guide: board.id });
  g.restore();
  if (opts.burn) {
    const cue = cueAt(cues, frame);
    if (cue) drawSubtitle(g, cue, width, height);
  }
}

/** The animatic as a video picture for `exportVideo`: same encoder, sound and limits as the shot. */
export function animaticPicture(project: Project, opts: AnimaticOptions): VideoPicture {
  const comp = project.comps.get(project.main) ?? project.comp;
  const board = boardOf(comp);
  if (!board || !board.exposures.length) throw new Error('There is no storyboard to make an animatic from. Add panels in Story first.');
  const cues = boardCues(board.exposures, board.start);
  return {
    frames: animaticLength(board),
    drawings: (frame) => frameContent(project.comps, opts.picture === 'shot' ? comp : { ...comp, layers: [board] }, frame).drawings,
    paint: (g: CanvasRenderingContext2D, frame: number, plan: VideoPlan) => paintAnimatic(g, project, comp, board, frame, opts, cues, plan.width, plan.height),
  };
}
