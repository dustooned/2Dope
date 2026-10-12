import type { App } from '../app';
import { sanitizeName } from '../io/exportplan';
import { DEFAULT_STORYBOARD, type StoryboardOptions } from '../io/storyboard';
import { storyboardPdf, storyboardPngs, type BoardExportContext } from '../io/storyboardexport';

const KEY = '2dope.board.export';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

type Format = 'pdf' | 'png';
interface Saved extends StoryboardOptions {
  format: Format;
}

function load(): Saved {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    return {
      format: r.format === 'png' ? 'png' : 'pdf',
      paper: r.paper === 'a4' ? 'a4' : 'letter',
      perPage: r.perPage === 2 || r.perPage === 6 ? r.perPage : 4,
      captions: r.captions !== false,
      picture: r.picture === 'shot' ? 'shot' : 'board',
    };
  } catch {
    return { format: 'pdf', ...DEFAULT_STORYBOARD };
  }
}

function download(data: Uint8Array, type: string, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * Board > Export: the storyboard as a PDF (panels with number, timing, picture and captions) or
 * as panel PNGs with a captions spreadsheet (CSV). Separate from the shot export: the board never
 * goes into final renders unless "Include the storyboard" is on there.
 */
export function openBoardExport(app: App, toast: (m: string) => void): void {
  const board = app.board;
  if (!board) return;
  const o = load();
  const dialog = el('dialog', { class: 'small board-export', 'aria-label': 'Export storyboard' });
  document.body.append(dialog);
  let abort: AbortController | null = null;
  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (abort) abort.abort();
    else close();
  });

  const row = (label: string, control: HTMLElement, hint?: string) => {
    const r = el('label', { class: 'xrow' });
    r.append(el('span', { class: 'name' }, label), control);
    if (hint) r.title = hint;
    return r;
  };
  const select = <T extends string | number>(label: string, value: T, choices: [T, string][], set: (v: T) => void, hint?: string) => {
    const s = el('select', { 'aria-label': label });
    for (const [v, t] of choices) s.append(el('option', { value: String(v) }, t));
    s.value = String(value);
    s.addEventListener('change', () => {
      set(choices.find(([v]) => String(v) === s.value)![0]);
      sync();
    });
    return row(label, s, hint);
  };

  dialog.append(el('h2', {}, 'Export storyboard'));
  const body = el('div', { class: 'dbody' });
  const sheetRows: HTMLElement[] = [];
  body.append(
    select<Format>(
      'Format',
      o.format,
      [
        ['pdf', 'PDF pages'],
        ['png', 'Panel PNGs + captions (CSV)'],
      ],
      (v) => (o.format = v),
    ),
    select<'board' | 'shot'>(
      'Picture',
      o.picture,
      [
        ['board', 'Board drawing'],
        ['shot', 'Board + animation'],
      ],
      (v) => (o.picture = v),
      "Board + animation shows every layer at the panel's first frame",
    ),
  );
  sheetRows.push(
    select<2 | 4 | 6>(
      'Layout',
      o.perPage,
      [
        [2, '2 per page, captions beside'],
        [4, '4 per page'],
        [6, '6 per page'],
      ],
      (v) => (o.perPage = v),
    ),
    select<'letter' | 'a4'>(
      'Paper',
      o.paper,
      [
        ['letter', 'Letter, landscape'],
        ['a4', 'A4, landscape'],
      ],
      (v) => (o.paper = v),
    ),
  );
  const capL = el('label', { class: 'check' });
  const cap = el('input', { type: 'checkbox' });
  cap.checked = o.captions;
  cap.addEventListener('change', () => (o.captions = cap.checked));
  capL.append(cap, el('span', {}, 'Dialogue, action, slugging and notes'));
  sheetRows.push(row('Captions', capL));
  body.append(...sheetRows);
  const summary = el('p', { class: 'hint xsummary', 'aria-live': 'polite' });
  const bar = el('progress', { class: 'xprogress', max: '1', value: '0', hidden: '' });
  const status = el('p', { class: 'hint xstatus', hidden: '' });
  body.append(summary, bar, status);
  dialog.append(body);

  const foot = el('div', { class: 'vfoot' });
  const cancel = el('button', { type: 'button' }, 'Close');
  const go = el('button', { type: 'button', class: 'primary' }, 'Export');
  foot.append(cancel, go);
  dialog.append(foot);
  cancel.addEventListener('click', () => (abort ? abort.abort() : close()));

  const panels = board.exposures.length;
  function sync(): void {
    for (const r of sheetRows) r.hidden = o.format !== 'pdf';
    summary.textContent =
      o.format === 'pdf'
        ? `${panels} panel${panels === 1 ? '' : 's'} on ${Math.ceil(panels / o.perPage)} page${Math.ceil(panels / o.perPage) === 1 ? '' : 's'}.`
        : `${panels} PNG${panels === 1 ? '' : 's'} at ${app.project.width}×${app.project.height} and captions.csv (opens in any spreadsheet), in a .zip.`;
  }
  sync();

  go.addEventListener('click', async () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch {
      // not remembered: fine
    }
    const name = sanitizeName(app.project.name === 'Untitled' ? 'storyboard' : app.project.name);
    const controls = dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
    controls.forEach((c) => (c.disabled = true));
    go.disabled = true;
    cancel.textContent = 'Cancel';
    bar.hidden = status.hidden = false;
    abort = new AbortController();
    const ctx: BoardExportContext = {
      project: app.project,
      board,
      compId: app.project.comp.id,
      fmt: (f) => app.fmt(f),
      fmtDur: (n) => app.fmtDur(n),
      hold: app.residency,
      signal: abort.signal,
      onProgress: (done, total) => {
        bar.max = total;
        bar.value = done;
        status.textContent = `Panel ${done} of ${total}`;
      },
    };
    try {
      if (o.format === 'pdf') {
        const r = await storyboardPdf(ctx, o, app.project.name);
        download(r.pdf, 'application/pdf', `${name}-storyboard.pdf`);
        toast(`Saved ${name}-storyboard.pdf (${r.pages} page${r.pages === 1 ? '' : 's'}).`);
      } else {
        const r = await storyboardPngs(ctx, o, name);
        download(r.zip, 'application/zip', `${name}-storyboard.zip`);
        toast(`Saved ${name}-storyboard.zip (${r.panels} panels and captions.csv).`);
      }
      close();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        close();
        toast('Export cancelled. Nothing was saved.');
        return;
      }
      status.textContent = `Could not export: ${e instanceof Error ? e.message : String(e)}`;
      controls.forEach((c) => (c.disabled = false));
      go.disabled = false;
      cancel.textContent = 'Close';
    } finally {
      abort = null;
    }
  });
  dialog.showModal();
}
