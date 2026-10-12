/**
 * A small PDF writer, no dependencies: pages with JPEG pictures, lines, boxes and text in the
 * built-in Helvetica (no font files to embed). Enough for storyboard sheets. Text is written in
 * WinAnsi, so characters outside it come out as "?"; content streams are left uncompressed (text
 * is small, pictures are already JPEG).
 */

export interface PdfImage {
  /** JPEG bytes (canvas.toBlob(..., 'image/jpeg')). */
  jpeg: Uint8Array;
  width: number;
  height: number;
}

type Op =
  | { k: 'text'; x: number; y: number; size: number; bold: boolean; s: string; gray: number }
  | { k: 'image'; img: number; x: number; y: number; w: number; h: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; gray: number; lineWidth: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; gray: number; lineWidth: number };

/** WinAnsi codes for the characters above Latin-1 that people actually type. */
const WIN_ANSI: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** A string as a PDF literal: WinAnsi bytes, with ( ) \ escaped. */
export function pdfString(s: string): string {
  let out = '(';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    let b: number;
    if (c >= 0x20 && c <= 0x7e) b = c;
    else if (c >= 0xa0 && c <= 0xff) b = c;
    else if (WIN_ANSI[c] !== undefined) b = WIN_ANSI[c]!;
    else if (c === 0x09) b = 0x20;
    else b = 0x3f; // ?
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
    else if (b < 0x80) out += String.fromCharCode(b);
    else out += '\\' + b.toString(8).padStart(3, '0');
  }
  return out + ')';
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** One page. Coordinates are points from the TOP-left (flipped to PDF's bottom-left on write). */
export class PdfPage {
  readonly ops: Op[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** `y` is the text baseline from the top. */
  text(x: number, y: number, s: string, size = 10, opt: { bold?: boolean; gray?: number } = {}): void {
    if (s) this.ops.push({ k: 'text', x, y, size, bold: !!opt.bold, s, gray: opt.gray ?? 0 });
  }
  image(img: number, x: number, y: number, w: number, h: number): void {
    this.ops.push({ k: 'image', img, x, y, w, h });
  }
  rect(x: number, y: number, w: number, h: number, gray = 0, lineWidth = 0.75): void {
    this.ops.push({ k: 'rect', x, y, w, h, gray, lineWidth });
  }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0, lineWidth = 0.5): void {
    this.ops.push({ k: 'line', x1, y1, x2, y2, gray, lineWidth });
  }

  content(): string {
    const H = this.height;
    const out: string[] = [];
    for (const o of this.ops) {
      if (o.k === 'text') out.push(`BT /${o.bold ? 'F2' : 'F1'} ${num(o.size)} Tf ${num(o.gray)} g ${num(o.x)} ${num(H - o.y)} Td ${pdfString(o.s)} Tj ET`);
      else if (o.k === 'image') out.push(`q ${num(o.w)} 0 0 ${num(o.h)} ${num(o.x)} ${num(H - o.y - o.h)} cm /Im${o.img} Do Q`);
      else if (o.k === 'rect') out.push(`q ${num(o.lineWidth)} w ${num(o.gray)} G ${num(o.x)} ${num(H - o.y - o.h)} ${num(o.w)} ${num(o.h)} re S Q`);
      else out.push(`q ${num(o.lineWidth)} w ${num(o.gray)} G ${num(o.x1)} ${num(H - o.y1)} m ${num(o.x2)} ${num(H - o.y2)} l S Q`);
    }
    return out.join('\n');
  }
}

/** Build the document. Same input, same bytes (no dates, fixed ids). */
export function writePdf(pages: PdfPage[], images: PdfImage[], title = ''): Uint8Array {
  const enc = new TextEncoder();
  const latin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    size += b.length;
  };
  // objects: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then images, then (page, content) pairs
  const imgBase = 6;
  const pageBase = imgBase + images.length;
  const total = pageBase + pages.length * 2 - 1;
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = size;
    push(latin(`${n} 0 obj\n`));
    if (typeof body === 'string') push(latin(body));
    else for (const b of body) push(b);
    push(latin('\nendobj\n'));
  };
  push(latin('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(5, `<< /Title ${pdfString(title)} /Producer (2Dope) >>`);
  images.forEach((im, i) => {
    obj(imgBase + i, [
      latin(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`),
      im.jpeg,
      latin('\nendstream'),
    ]);
  });
  const xobjects = images.map((_, i) => `/Im${i} ${imgBase + i} 0 R`).join(' ');
  pages.forEach((p, i) => {
    const n = pageBase + i * 2;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >> /Contents ${n + 1} 0 R >>`);
    const body = latin(p.content());
    obj(n + 1, [latin(`<< /Length ${body.length} >>\nstream\n`), body, latin('\nendstream')]);
  });
  const xref = size;
  let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) x += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  x += `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(enc.encode(x));
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Break text into lines no wider than `width` (measured by `measure`), keeping the user's own line
 * breaks; a word longer than a line is split. At most `maxLines`; the last one gets "…" if cut.
 */
export function wrapText(s: string, width: number, measure: (s: string) => number, maxLines = Infinity, indent = 0): string[] {
  const out: string[] = [];
  let cut = false;
  // the first line may start after a label
  const avail = () => (out.length ? width : width - indent);
  for (const para of s.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      const tryLine = line ? `${line} ${w}` : w;
      if (measure(tryLine) <= avail()) {
        line = tryLine;
        continue;
      }
      if (line) out.push(line);
      line = '';
      // a word wider than the line: split it
      while (measure(w) > avail() && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n)) > avail()) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  if (out.length > maxLines) {
    out.length = maxLines;
    cut = true;
  }
  if (cut) {
    let last = out[maxLines - 1]!;
    while (last && measure(`${last}…`) > (maxLines === 1 ? width - indent : width)) last = last.slice(0, -1);
    out[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return out;
}
