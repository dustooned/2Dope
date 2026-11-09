/**
 * The pages of a PDF as pictures (for Story: each page becomes a panel). The PDF library is loaded
 * only when a PDF is imported, so the app does not grow for everyone else.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** At most this many pages are imported from one PDF. */
export const MAX_PDF_PAGES = 200;

/** Is this file a PDF (by its type, its name, or its first bytes)? */
export async function isPdf(f: File): Promise<boolean> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return true;
  const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

/**
 * Render each page of a PDF to a canvas about `long` pixels on its longer side (fitted later), in
 * page order. Pages past MAX_PDF_PAGES are left out (the caller is told how many there were).
 */
export async function pdfPages(f: File, long: number, onPage?: (n: number, of: number) => void): Promise<{ pages: HTMLCanvasElement[]; total: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }), doc = await task.promise;
  const pages: HTMLCanvasElement[] = [];
  try {
    const n = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 }), k = Math.min(4, long / Math.max(base.width, base.height));
      const view = page.getViewport({ scale: k });
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(view.width)); c.height = Math.max(1, Math.round(view.height));
      const g = c.getContext('2d')!;
      // pages are drawn on white, like paper
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvas: c, canvasContext: g, viewport: view }).promise;
      page.cleanup();
      pages.push(c);
      onPage?.(i, n);
    }
    return { pages, total: doc.numPages };
  } finally {
    void task.destroy();
  }
}

/** Compare file names the way people number them: "panel 2" before "panel 10". */
export function byNumberInName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}
