import { describe, expect, it } from 'vitest';
import { PdfPage, pdfString, wrapText, writePdf } from './pdf';
import { boardPanels, captionsCsv, csvCell, pageSize, panelFile, sheetCells } from './storyboard';

const mono = (s: string) => s.length; // 1 unit per character

describe('storyboard export', () => {
  it('panels carry their start, length and captions', () => {
    const rows = boardPanels(
      [
        { drawing: 'a', length: 24, dialogue: 'Hi', note: '' },
        { drawing: 'b', length: 12, action: 'runs' },
      ],
      10,
    );
    expect(rows.map((r) => [r.n, r.start, r.length])).toEqual([
      [1, 10, 24],
      [2, 34, 12],
    ]);
    expect(rows[0]!.captions).toEqual({ dialogue: 'Hi' });
    expect(rows[1]!.captions).toEqual({ action: 'runs' });
  });

  it('sheet cells stay on the page and keep the picture aspect', () => {
    for (const perPage of [2, 4, 6] as const)
      for (const captions of [true, false]) {
        const cells = sheetCells({ paper: 'a4', perPage, captions }, 16 / 9);
        const { w, h } = pageSize('a4');
        expect(cells).toHaveLength(perPage);
        for (const c of cells) {
          expect(c.picture.x + c.picture.w).toBeLessThanOrEqual(w + 0.01);
          expect(c.cell.y + c.cell.h).toBeLessThanOrEqual(h + 0.01);
          expect(c.picture.w / c.picture.h).toBeCloseTo(16 / 9, 5);
          expect(!!c.text).toBe(captions);
          if (c.text) expect(c.text.h).toBeGreaterThan(40);
        }
      }
    // two per page: captions beside the picture
    const [two] = sheetCells({ paper: 'letter', perPage: 2, captions: true }, 16 / 9);
    expect(two!.text!.x).toBeGreaterThan(two!.picture.x + two!.picture.w);
  });

  it('wraps words, keeps line breaks, splits long words and cuts with …', () => {
    expect(wrapText('aa bb cc', 5, mono)).toEqual(['aa bb', 'cc']);
    expect(wrapText('one\ntwo', 10, mono)).toEqual(['one', 'two']);
    expect(wrapText('abcdefghij', 4, mono)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('aa bb cc dd', 5, mono, 1)).toEqual(['aa b…']);
    // a label takes room on the first line only
    expect(wrapText('aa bb', 5, mono, Infinity, 3)).toEqual(['aa', 'bb']);
  });

  it('PDF strings escape and map to WinAnsi', () => {
    expect(pdfString('a(b)\\')).toBe('(a\\(b\\)\\\\)');
    expect(pdfString('café — “hi”')).toBe('(caf\\351 \\227 \\223hi\\224)');
    expect(pdfString('日')).toBe('(?)');
  });

  it('writes a well-formed PDF with a correct xref', () => {
    const page = new PdfPage(792, 612);
    page.text(36, 48, 'Panel 1', 9, { bold: true });
    page.image(0, 36, 60, 100, 56);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = writePdf([page, new PdfPage(792, 612)], [{ jpeg, width: 2, height: 1 }], 'Test');
    const s = String.fromCharCode(...bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    expect(s).toContain('/Count 2');
    // every xref offset points at its "n 0 obj"
    const start = Number(/startxref\n(\d+)/.exec(s)![1]);
    const lines = s.slice(start).split('\n');
    const count = Number(lines[1]!.split(' ')[1]);
    for (let n = 1; n < count; n++) {
      const off = Number(lines[2 + n]!.slice(0, 10));
      expect(s.slice(off, off + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
    // same input, same bytes
    expect(writePdf([page], [{ jpeg, width: 2, height: 1 }], 'Test')).toEqual(writePdf([page], [{ jpeg, width: 2, height: 1 }], 'Test'));
  });

  it('captions CSV quotes, neutralises formulas and names images', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-3)).toBe('-3');
    const csv = captionsCsv(
      boardPanels([{ drawing: 'a', length: 24, dialogue: 'Hello,\nworld' }]),
      (f) => `f${f}`,
      (n) => `${n}f`,
      (n) => `panels/${panelFile(n, 1)}`,
    );
    expect(csv.startsWith('﻿Panel,Start,Frames,Duration,Shot,Camera,Dialogue,Action,Slugging,Notes,Image\r\n')).toBe(true);
    expect(csv).toContain('1,f0,24,24f,,,"Hello,\nworld",,,,panels/panel_001.png');
    expect(panelFile(7, 1200)).toBe('panel_0007.png');
  });
});
