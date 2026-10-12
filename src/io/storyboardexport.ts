import { makeCanvas } from '../brush/raster';
import { frameContent, type DrawingsLayer } from '../core/comp';
import { CAPTION_FIELDS } from '../core/timeline';
import { paintDrawing, type Drawing, type Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { encodePng } from './codec';
import { PdfPage, writePdf, wrapText, type PdfImage } from './pdf';
import { boardPanels, CAPTION_LABEL, captionsCsv, MARGIN, PAGE_HEAD, pageSize, panelFile, sheetCells, type BoardPanelRow, type StoryboardOptions } from './storyboard';
import { writeZip } from './zip';

export interface BoardExportContext {
  project: Project;
  board: DrawingsLayer;
  /** The comp the board lives in (for "shot" pictures). */
  compId: string;
  fmt: (frame: number) => string;
  fmtDur: (frames: number) => string;
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void };
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function check(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/** Picture size of the board page or the shot. */
function pictureSize(ctx: BoardExportContext, opts: StoryboardOptions): { w: number; h: number } {
  const c = ctx.project.comps.get(ctx.compId);
  return opts.picture === 'shot' && c ? { w: c.width, h: c.height } : { w: ctx.project.width, h: ctx.project.height };
}

/** Paint one panel's picture on white into a canvas of `pw` × `ph` pixels. */
async function paintPanel(ctx: BoardExportContext, opts: StoryboardOptions, p: BoardPanelRow, pw: number, ph: number): Promise<HTMLCanvasElement> {
  const { project } = ctx;
  const src = pictureSize(ctx, opts);
  const canvas = makeCanvas(pw, ph);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, pw, ph);
  g.imageSmoothingQuality = 'high';
  g.setTransform(pw / src.w, 0, 0, ph / src.h, 0, 0);
  const ids = opts.picture === 'shot' ? [...frameContent(project.comps, ctx.compId, p.start).drawings] : [p.drawing];
  const ds = ids.map((id) => project.drawings.get(id)).filter((d): d is Drawing => !!d);
  for (const d of ds) await ctx.hold.pin(d);
  try {
    if (opts.picture === 'shot') drawComp(g, project, ctx.compId, p.start, {});
    else if (ds[0]) paintDrawing(g, ds[0]);
  } finally {
    for (const d of ds) ctx.hold.unpin(d);
  }
  return canvas;
}

function encodeJpeg(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error('could not encode a panel as JPEG'))), 'image/jpeg', 0.88),
  );
}

/**
 * The storyboard as a PDF: landscape pages with each panel's number, start and duration, its
 * picture and its captions (dialogue, action, slugging, notes). Pictures are rendered at about
 * 150 dpi so the file stays small enough to email.
 */
export async function storyboardPdf(ctx: BoardExportContext, opts: StoryboardOptions, title: string): Promise<{ pdf: Uint8Array; pages: number }> {
  const panels = boardPanels(ctx.board.exposures, ctx.board.start);
  if (!panels.length) throw new Error('The storyboard has no panels.');
  const src = pictureSize(ctx, opts);
  const cells = sheetCells(opts, src.w / src.h);
  const { w: pw, h: ph } = pageSize(opts.paper);
  const pageCount = Math.ceil(panels.length / cells.length);
  const total = panels.reduce((n, p) => n + p.length, 0);
  const measurer = makeCanvas(1, 1).getContext('2d')!;
  const measure = (size: number, bold: boolean) => (s: string) => {
    measurer.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
    return measurer.measureText(s).width;
  };
  const SIZE = 8.5;
  const LEAD = 10.5;
  const reg = measure(SIZE, false);
  const bold = measure(SIZE, true);

  const pages: PdfPage[] = [];
  const images: PdfImage[] = [];
  try {
    for (let i = 0; i < panels.length; i++) {
      check(ctx.signal);
      const p = panels[i]!;
      const slot = i % cells.length;
      if (slot === 0) {
        const page = new PdfPage(pw, ph);
        const n = pages.length + 1;
        page.text(MARGIN, MARGIN + 12, title, 13, { bold: true });
        const right = `${panels.length} panel${panels.length === 1 ? '' : 's'} · ${ctx.fmtDur(total)} · page ${n} of ${pageCount}`;
        page.text(pw - MARGIN - measure(9, false)(right), MARGIN + 12, right, 9, { gray: 0.35 });
        page.line(MARGIN, MARGIN + PAGE_HEAD - 8, pw - MARGIN, MARGIN + PAGE_HEAD - 8, 0.6);
        pages.push(page);
      }
      const page = pages[pages.length - 1]!;
      const c = cells[slot]!;
      // header: panel number, then start and length on the right
      page.text(c.head.x, c.head.y + 9, `Panel ${p.n}`, 9, { bold: true });
      const when = `@ ${ctx.fmt(p.start)} · ${ctx.fmtDur(p.length)}`;
      page.text(c.head.x + c.head.w - measure(8, false)(when), c.head.y + 9, when, 8, { gray: 0.35 });
      // picture (about 150 dpi)
      const k = 150 / 72;
      const cv = await paintPanel(ctx, opts, p, Math.max(8, Math.round(c.picture.w * k)), Math.max(8, Math.round(c.picture.h * k)));
      images.push({ jpeg: await encodeJpeg(cv), width: cv.width, height: cv.height });
      page.image(images.length - 1, c.picture.x, c.picture.y, c.picture.w, c.picture.h);
      page.rect(c.picture.x, c.picture.y, c.picture.w, c.picture.h, 0.25, 0.75);
      // captions: "Label: text", wrapped, cut with … when the cell is full
      if (c.text) {
        let y = c.text.y + SIZE;
        const bottom = c.text.y + c.text.h;
        for (const f of CAPTION_FIELDS) {
          const v = p.captions[f.key];
          if (!v) continue;
          const room = Math.floor((bottom - y) / LEAD) + 1;
          if (room < 1) break;
          const label = `${CAPTION_LABEL[f.key]}: `;
          const lw = bold(label);
          const lines = wrapText(v, c.text.w, reg, room, lw);
          page.text(c.text.x, y, label, SIZE, { bold: true, gray: 0.3 });
          lines.forEach((line, j) => page.text(c.text!.x + (j === 0 ? lw : 0), y + j * LEAD, line, SIZE));
          y += lines.length * LEAD + 3;
        }
      }
      ctx.onProgress?.(i + 1, panels.length);
      await tick();
    }
  } finally {
    if (opts.picture === 'shot') releaseScratch();
  }
  return { pdf: writePdf(pages, images, title), pages: pages.length };
}

/** Every panel as a full-size PNG (on white) plus captions.csv, in one ZIP. */
export async function storyboardPngs(ctx: BoardExportContext, opts: StoryboardOptions, name: string): Promise<{ zip: Uint8Array; panels: number }> {
  const panels = boardPanels(ctx.board.exposures, ctx.board.start);
  if (!panels.length) throw new Error('The storyboard has no panels.');
  const src = pictureSize(ctx, opts);
  const files = [];
  try {
    for (const p of panels) {
      check(ctx.signal);
      const cv = await paintPanel(ctx, opts, p, src.w, src.h);
      files.push({ name: `${name}/panels/${panelFile(p.n, panels.length)}`, data: await encodePng(cv) });
      ctx.onProgress?.(p.n, panels.length);
      await tick();
    }
  } finally {
    if (opts.picture === 'shot') releaseScratch();
  }
  const csv = captionsCsv(panels, ctx.fmt, ctx.fmtDur, (n) => `panels/${panelFile(n, panels.length)}`);
  files.push({ name: `${name}/captions.csv`, data: new TextEncoder().encode(csv) });
  return { zip: writeZip(files), panels: panels.length };
}
