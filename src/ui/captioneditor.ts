/**
 * The caption editor: words, font (bundled, project or imported), size, style, emphasis, colours
 * and tail. Edits preview live on the canvas; Apply keeps them in one Undo step, Cancel puts the
 * caption back (and removes a brand-new caption left empty).
 */
import type { App } from '../app';
import { hashBytes } from '../io/hash';
import { BUNDLED_FONTS, isFontFile, MAX_FONT_BYTES, MAX_PROJECT_FONTS } from '../lettering/fonts';
import { BALLOON_STYLES, MAX_CAPTION_CHARS, TAIL_JOINS, type BalloonStyle, type CaptionSpec, type LetterAlign, type LetterSize, type TailJoin } from '../lettering/spec';
import { el } from './dom';

const STYLE_NAMES: Record<BalloonStyle, string> = { speech: 'Speech', thought: 'Thought', shout: 'Shout', whisper: 'Whisper', box: 'Box', sfx: 'Sound effect', custom: 'As drawn' };
const JOIN_NAMES: Record<TailJoin, string> = { merged: 'Joined (no seam)', seam: 'Seam (closed)', bubbles: 'Bubbles (thought)', lightning: 'Lightning (radio)', none: 'No tail' };

export class CaptionEditor {
  private dialog: HTMLDialogElement | null = null;
  constructor(private readonly app: App) {}

  close(): void { this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }

  open(layerId: string, isNew: boolean): void {
    this.close();
    const app = this.app, layer = app.project.comp.layers.find(l => l.id === layerId);
    if (layer?.kind !== 'drawings' || !layer.caption) return;
    const original = structuredClone(layer.caption);
    let draft: CaptionSpec = structuredClone(original);
    const live = (next: CaptionSpec) => { draft = next; const l = app.project.comp.layers.find(x => x.id === layerId); if (l?.kind === 'drawings') { l.caption = next; app.requestRender(); } };
    const d = el('dialog', { class: 'small caption-editor', 'aria-label': 'Caption' });
    const body = el('div', { class: 'dbody' }), foot = el('div', { class: 'vfoot' });
    d.append(el('h2', {}, isNew ? 'New caption' : 'Caption'), body, foot);
    const row = (label: string, ...kids: HTMLElement[]) => { const r = el('label', { class: 'cap-row' }); r.append(el('span', { class: 'name' }, label), ...kids); body.append(r); return r; };

    const text = el('textarea', { rows: '3', 'aria-label': 'Caption words', maxlength: String(MAX_CAPTION_CHARS), placeholder: 'What they say', class: 'textbox' }) as HTMLTextAreaElement;
    text.value = draft.text;
    text.addEventListener('input', () => live({ ...draft, text: text.value }));
    text.addEventListener('keydown', e => e.stopPropagation());
    body.append(text);
    body.append(el('p', { class: 'hint' }, 'Press Enter for your own line breaks; without them the words wrap to fit the balloon.'));

    // font: bundled, then this project's own, then import
    const font = el('select', { 'aria-label': 'Font' }) as HTMLSelectElement;
    const fillFonts = () => {
      font.replaceChildren();
      for (const f of BUNDLED_FONTS) font.append(el('option', { value: f.id }, `${f.label} · ${f.role}`));
      for (const [id, f] of app.project.fonts) font.append(el('option', { value: `custom:${id}` }, `${f.name} · imported`));
      font.append(el('option', { value: 'import' }, 'Import font…'));
      font.value = draft.font;
    };
    fillFonts();
    const picker = el('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', hidden: '' }) as HTMLInputElement;
    const status = el('p', { class: 'hint', role: 'status' });
    font.addEventListener('change', () => { if (font.value === 'import') { font.value = draft.font; picker.click(); } else live({ ...draft, font: font.value }); });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0]; picker.value = '';
      if (!file) return;
      if (file.size > MAX_FONT_BYTES) { status.textContent = 'That font file is larger than 4 MB.'; return; }
      if (app.project.fonts.size >= MAX_PROJECT_FONTS) { status.textContent = `A project can hold ${MAX_PROJECT_FONTS} fonts.`; return; }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isFontFile(file.name, bytes)) { status.textContent = 'Choose a TTF, OTF, WOFF or WOFF2 font file.'; return; }
      const hash = hashBytes(bytes), ext = file.name.toLowerCase().split('.').pop()!, id = `f${hash.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`;
      app.project.fonts.set(id, { name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), path: `assets/${hash.replace(/[^A-Za-z0-9_.-]/g, '')}.${ext}`, bytes });
      fillFonts();
      font.value = `custom:${id}`;
      live({ ...draft, font: font.value });
      status.textContent = 'Font imported. It is saved with this project; make sure you may use it.';
    });
    row('Font', font);
    body.append(picker, status);

    const choice = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void) => {
      const s = el('select', { 'aria-label': label }) as HTMLSelectElement;
      for (const [v, n] of options) s.append(el('option', { value: v }, n));
      s.value = value; s.addEventListener('change', () => set(s.value as T));
      row(label, s);
      return s;
    };
    choice<LetterSize>('Size', [['small', 'Small'], ['body', 'Body'], ['big', 'Big']], draft.size, v => live({ ...draft, size: v }));
    choice<BalloonStyle>('Balloon', BALLOON_STYLES.filter(s => s !== 'custom' || draft.style === 'custom').map(s => [s, STYLE_NAMES[s]]), draft.style, v => live({ ...draft, style: v, ...(v === 'sfx' ? { tails: [] } : {}) }));
    choice<LetterAlign>('Align', [['center', 'Centre'], ['left', 'Left'], ['right', 'Right']], draft.align, v => live({ ...draft, align: v }));
    const toggles = el('div', { class: 'cap-toggles' });
    for (const [key, label] of [['bold', 'Bold'], ['italic', 'Italic'], ['caps', 'ALL CAPS']] as const) {
      const b = el('button', { type: 'button', 'aria-pressed': String(draft[key]) }, label);
      b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); live({ ...draft, [key]: on }); });
      toggles.append(b);
    }
    body.append(toggles);

    const colour = (label: string, value: string, set: (v: string) => void) => { const i = el('input', { type: 'color', 'aria-label': label, value }) as HTMLInputElement; i.addEventListener('input', () => set(i.value)); return i; };
    const colours = el('div', { class: 'cap-colours' });
    colours.append(
      el('span', { class: 'name' }, 'Fill'), colour('Balloon fill', draft.fill, v => live({ ...draft, fill: v })),
      el('span', { class: 'name' }, 'Ink'), colour('Balloon ink', draft.ink, v => live({ ...draft, ink: v })),
      el('span', { class: 'name' }, 'Text'), colour('Text colour', draft.textColor, v => live({ ...draft, textColor: v })),
    );
    body.append(colours);
    const outline = el('input', { type: 'checkbox', 'aria-label': 'Outline the letters' }) as HTMLInputElement;
    outline.checked = !!draft.textOutline;
    const outlineColour = colour('Letter outline colour', draft.textOutline ?? '#111111', v => live({ ...draft, textOutline: outline.checked ? v : null }));
    outline.addEventListener('change', () => live({ ...draft, textOutline: outline.checked ? outlineColour.value : null }));
    row('Letter outline', outline, outlineColour);
    const ink = el('input', { type: 'range', min: '0', max: '30', step: '1', 'aria-label': 'Ink width', value: String(Math.round(draft.inkWidth * 100)) }) as HTMLInputElement;
    ink.addEventListener('input', () => live({ ...draft, inkWidth: Number(ink.value) / 100 }));
    row('Ink width', ink);
    if (draft.style !== 'sfx') choice<TailJoin>('Tail', TAIL_JOINS.map(j => [j, JOIN_NAMES[j]]), draft.tails[0]?.join ?? 'none', v => {
      const t = draft.tails[0] ?? { x: draft.x - 40, y: draft.y + 110, join: v, width: 1.2 };
      live({ ...draft, tails: v === 'none' ? [] : [{ ...t, join: v }, ...draft.tails.slice(1)] });
    });

    const cancel = el('button', { type: 'button' }, 'Cancel'), apply = el('button', { type: 'button', class: 'primary' }, 'Apply');
    foot.append(cancel, apply);
    const restore = () => { const l = app.project.comp.layers.find(x => x.id === layerId); if (l?.kind === 'drawings') l.caption = original; app.requestRender(); };
    cancel.addEventListener('click', () => {
      restore(); this.close();
      // a brand-new caption left without words goes away again
      if (isNew && !original.text.trim() && app.history.peekUndo()?.label === 'Add caption') app.undo();
    });
    apply.addEventListener('click', () => {
      const final = draft;
      restore();
      if (JSON.stringify(final) !== JSON.stringify(original)) app.editor.edit(isNew ? 'Write caption' : 'Edit caption', c => { const l = c.layers.find(x => x.id === layerId); if (l?.kind === 'drawings') l.caption = final; });
      if (isNew && app.history.peekUndo()?.label === 'Write caption') app.history.combine(2, 'Add caption');
      this.close(); app.focusCanvas();
    });
    d.addEventListener('cancel', e => { e.preventDefault(); cancel.click(); });
    document.body.append(d);
    this.dialog = d;
    d.showModal();
    text.focus();
  }
}
