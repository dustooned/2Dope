import { CAPTION_FIELDS, type CaptionField, type Exposure } from '../core/timeline';

/** One storyboard panel as exported: its place on the clock and its captions. */
export interface BoardPanelRow {
  n: number;
  start: number;
  length: number;
  drawing: string;
  captions: Partial<Record<CaptionField, string>>;
}

export function boardPanels(exposures: readonly Exposure[], start = 0): BoardPanelRow[] {
  let at = start;
  return exposures.map((e, i) => {
    const captions: Partial<Record<CaptionField, string>> = {};
    for (const f of CAPTION_FIELDS) {
      const v = e[f.key];
      if (v) captions[f.key] = v;
    }
    const row = { n: i + 1, start: at, length: e.length, drawing: e.drawing, captions };
    at += e.length;
    return row;
  });
}

export type Paper = 'letter' | 'a4';
/** Panels per page: 2 = big pictures with captions beside them, 4 and 6 = a grid with captions below. */
export type SheetLayout = 2 | 4 | 6;

export interface StoryboardOptions {
  paper: Paper;
  perPage: SheetLayout;
  captions: boolean;
  /** 'board' = the panel drawing; 'shot' = everything at the panel's first frame (board + animation). */
  picture: 'board' | 'shot';
}

export const DEFAULT_STORYBOARD: StoryboardOptions = { paper: 'letter', perPage: 4, captions: true, picture: 'board' };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where one panel goes: its header line, its picture and its caption area (points, from the top-left). */
export interface CellLayout {
  cell: Box;
  head: Box;
  picture: Box;
  text: Box | null;
}

export const MARGIN = 36;
export const PAGE_HEAD = 26;
const GAP = 14;
const CELL_HEAD = 14;

/** Landscape page size in points. */
export function pageSize(paper: Paper): { w: number; h: number } {
  return paper === 'a4' ? { w: 841.89, h: 595.28 } : { w: 792, h: 612 };
}

/**
 * The cells of one page for `opts`, with the picture fitted to the shot's `aspect` (width / height).
 * Two per page puts captions beside a big picture; four and six put them below.
 */
export function sheetCells(opts: Pick<StoryboardOptions, 'paper' | 'perPage' | 'captions'>, aspect: number): CellLayout[] {
  const { w, h } = pageSize(opts.paper);
  const cols = opts.perPage === 6 ? 3 : opts.perPage === 4 ? 2 : 1;
  const rows = 2;
  const top = MARGIN + PAGE_HEAD;
  const cw = (w - 2 * MARGIN - (cols - 1) * GAP) / cols;
  const ch = (h - top - MARGIN - (rows - 1) * GAP) / rows;
  const beside = cols === 1 && opts.captions;
  const out: CellLayout[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cell = { x: MARGIN + c * (cw + GAP), y: top + r * (ch + GAP), w: cw, h: ch };
      const head = { x: cell.x, y: cell.y, w: cw, h: CELL_HEAD };
      const areaY = cell.y + CELL_HEAD;
      const areaH = ch - CELL_HEAD;
      let picture: Box;
      let text: Box | null = null;
      if (beside) {
        // picture on the left (up to 62% of the width), captions to its right
        let pw = Math.min(cw * 0.62, areaH * aspect);
        let ph = pw / aspect;
        if (ph > areaH) {
          ph = areaH;
          pw = ph * aspect;
        }
        picture = { x: cell.x, y: areaY, w: pw, h: ph };
        text = { x: cell.x + pw + GAP, y: areaY, w: cw - pw - GAP, h: areaH };
      } else {
        // picture on top (leaving at least 40% for captions when they are on), captions below
        const maxH = opts.captions ? areaH * 0.6 : areaH;
        let pw = cw;
        let ph = pw / aspect;
        if (ph > maxH) {
          ph = maxH;
          pw = ph * aspect;
        }
        picture = { x: cell.x + (cw - pw) / 2, y: areaY, w: pw, h: ph };
        if (opts.captions) text = { x: cell.x, y: areaY + ph + 6, w: cw, h: areaH - ph - 6 };
      }
      out.push({ cell, head, picture, text });
    }
  return out;
}

export const CAPTION_LABEL: Record<CaptionField, string> = { dialogue: 'Dialogue', action: 'Action', slug: 'Slugging', note: 'Notes' };

/**
 * One CSV cell: quoted when needed, and a leading = + - @ is neutralised so a spreadsheet never
 * runs a caption as a formula.
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The captions sheet: one row per panel. UTF-8 with a BOM so Excel reads accents right. */
export function captionsCsv(panels: BoardPanelRow[], fmt: (frame: number) => string, fmtDur: (frames: number) => string, image: (n: number) => string): string {
  const head = ['Panel', 'Start', 'Frames', 'Duration', ...CAPTION_FIELDS.map((f) => CAPTION_LABEL[f.key]), 'Image'];
  const rows = panels.map((p) => [p.n, fmt(p.start), p.length, fmtDur(p.length), ...CAPTION_FIELDS.map((f) => p.captions[f.key] ?? ''), image(p.n)]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "panel_007.png" (three digits, more when there are 1000+ panels). */
export function panelFile(n: number, count: number): string {
  return `panel_${String(n).padStart(Math.max(3, String(count).length), '0')}.png`;
}
