/**
 * The Caption panel: a docked, non-modal panel beside the canvas with a live preview and every
 * caption setting (words, font, size, balloon, tails, colours, spacing, animation, position).
 * The canvas stays usable while it is open, so the Letter tool's handles and the panel work
 * together. Each finished change is one Undo step (sliders preview while dragging and commit when
 * released; the words commit when you leave the box or press Done).
 */
import type { App } from '../app';
import { hashBytes } from '../io/hash';
import { BUNDLED_FONTS, familyName, isFontFile, MAX_FONT_BYTES, MAX_PROJECT_FONTS } from '../lettering/fonts';
import { CAPTION_KEYS, MAX_CAPTION_CHARS, MAX_TAILS, TAIL_JOINS, type BalloonStyle, type CaptionKey, type CaptionSpec, type CaptionTail, type LetterAlign, type LetterSize, type TailJoin } from '../lettering/spec';
import { captionAt, captionBalloon, paintCaption } from '../view/caption';
import { captionFont } from '../view/captionfonts';
import { el } from './dom';

const STYLE_NAMES: [BalloonStyle, string][] = [['speech', 'Speech'], ['thought', 'Thought'], ['shout', 'Shout'], ['whisper', 'Whisper'], ['box', 'Box'], ['sfx', 'Sound effect'], ['custom', 'As drawn']];
const JOIN_NAMES: Record<TailJoin, string> = { merged: 'Joined', seam: 'Seam', bubbles: 'Bubbles', lightning: 'Lightning', none: 'Hidden' };
const FALLBACK = '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif';

export class CaptionEditor {
  private panel: HTMLElement | null = null;
  private layerId = '';
  private isNew = false;
  /** The caption as last committed (live previews change the layer; commits start from this). */
  private base: CaptionSpec | null = null;
  private animated = false;
  private wordsCommitted = false;
  private preview: HTMLCanvasElement | null = null;
  constructor(private readonly app: App) {}

  get openLayer(): string | null { return this.panel ? this.layerId : null; }

  private layer() {
    const l = this.app.project.comp.layers.find(x => x.id === this.layerId);
    return l?.kind === 'drawings' && l.caption ? l : null;
  }

  /** Done: commit the words still being typed, remove a new caption left without words, close. */
  close(): void {
    if (!this.panel) return;
    const text = this.panel.querySelector<HTMLTextAreaElement>('.cap-words');
    if (text && this.base && text.value !== this.base.text) this.commitWords(text.value);
    const l = this.layer();
    if (l && this.isNew && !l.caption!.text.trim() && this.app.history.peekUndo()?.label === 'Add caption') this.app.undo();
    this.panel.remove();
    this.panel = null; this.preview = null; this.base = null;
    this.app.requestRender();
  }

  open(layerId: string, isNew: boolean): void {
    if (this.panel) this.close();
    this.layerId = layerId; this.isNew = isNew; this.wordsCommitted = false;
    const l = this.layer();
    if (!l) return;
    this.base = structuredClone(l.caption!);
    const p = el('aside', { class: 'caption-panel', role: 'dialog', 'aria-label': 'Caption' });
    p.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    document.body.append(p);
    this.panel = p;
    this.build();
    p.querySelector<HTMLTextAreaElement>('.cap-words')?.focus();
  }

  /** The project changed (Undo, a canvas drag, another edit): show the caption as it is now. */
  refresh(): void {
    if (!this.panel) return;
    const l = this.layer();
    if (!l) { this.panel.remove(); this.panel = null; this.preview = null; this.base = null; return; }
    if (this.base && JSON.stringify(l.caption) === JSON.stringify(this.base)) { this.drawPreview(); return; }
    this.base = structuredClone(l.caption!);
    // rebuild, keeping the cursor where it was (typing in the words or a number box)
    const focused = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const label = focused && this.panel.contains(focused) ? focused.getAttribute('aria-label') : null;
    const typing = label && focused!.matches('textarea, input[type=number]') ? { start: focused!.selectionStart, end: focused!.selectionEnd } : null;
    this.build();
    if (label) {
      const again = this.panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${CSS.escape(label)}"]`);
      again?.focus({ preventScroll: true });
      if (again && typing && typing.start !== null) try { again.setSelectionRange(typing.start, typing.end); } catch { /* number inputs have no selection */ }
    }
  }

  /** The playhead moved: the preview follows it when it shows the animation. */
  frameChanged(): void { if (this.panel && this.animated) this.drawPreview(); }

  /** Show a change live without an Undo step. */
  private live(next: CaptionSpec): void {
    const l = this.layer();
    if (!l) return;
    l.caption = next;
    this.app.requestRender();
    this.drawPreview();
  }

  /** Keep a change as one Undo step. */
  private commit(label: string, next: CaptionSpec): void {
    const l = this.layer();
    if (!l || !this.base) return;
    l.caption = this.base;
    if (JSON.stringify(next) === JSON.stringify(this.base)) { this.app.requestRender(); return; }
    const id = this.layerId;
    this.app.editor.edit(label, c => { const x = c.layers.find(y => y.id === id); if (x?.kind === 'drawings') x.caption = next; });
    this.base = null;
    this.refresh();
  }

  private commitWords(text: string): void {
    if (!this.base) return;
    const first = this.isNew && !this.wordsCommitted && this.app.history.peekUndo()?.label === 'Add caption';
    this.commit('Edit caption words', { ...this.base, text });
    this.wordsCommitted = true;
    if (first && this.app.history.peekUndo()?.label === 'Edit caption words') this.app.history.combine(2, 'Add caption');
  }

  private get cur(): CaptionSpec { return this.layer()?.caption ?? this.base!; }

  private build(): void {
    const p = this.panel!, app = this.app, c = this.base!;
    p.replaceChildren();
    const head = el('div', { class: 'cap-head' });
    const done = el('button', { type: 'button', class: 'primary' }, 'Done');
    done.addEventListener('click', () => { this.close(); app.focusCanvas(); });
    head.append(el('h2', {}, this.isNew ? 'New caption' : 'Caption'), done);

    // live preview
    const view = el('div', { class: 'cap-preview' });
    this.preview = el('canvas', { width: '560', height: '300', 'aria-label': 'Caption preview' }) as HTMLCanvasElement;
    const anim = el('label', { class: 'cap-anim' }), animBox = el('input', { type: 'checkbox' }) as HTMLInputElement;
    animBox.checked = this.animated;
    animBox.addEventListener('change', () => { this.animated = animBox.checked; this.drawPreview(); });
    anim.append(animBox, el('span', {}, 'Show animation at the playhead'));
    view.append(this.preview, anim);

    const body = el('div', { class: 'cap-body' });
    p.append(head, view, body);
    const section = (title: string, open = true) => { const d = el('details', { class: 'cap-sec' }) as HTMLDetailsElement; d.open = open; d.append(el('summary', {}, title)); body.append(d); return d; };
    const row = (parent: HTMLElement, label: string, ...kids: HTMLElement[]) => { const r = el('div', { class: 'cap-row' }); r.append(el('span', { class: 'name' }, label), ...kids); parent.append(r); return r; };
    const chips = <T extends string>(parent: HTMLElement, label: string, options: [T, string][], value: T, set: (v: T) => void) => {
      const g = el('div', { class: 'cap-chips', role: 'radiogroup', 'aria-label': label });
      for (const [v, n] of options) {
        const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value) }, n);
        b.addEventListener('click', () => set(v));
        g.append(b);
      }
      row(parent, label, g);
    };
    const slider = (parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, unit: string, preview: (v: number) => CaptionSpec, commit: (v: number) => void) => {
      const s = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label }) as HTMLInputElement;
      const out = el('output', { class: 'cap-val' }, `${value}${unit}`);
      s.addEventListener('input', () => { out.textContent = `${s.value}${unit}`; this.live(preview(Number(s.value))); });
      s.addEventListener('change', () => commit(Number(s.value)));
      row(parent, label, s, out);
      return s;
    };
    const colour = (label: string, value: string, set: (v: string, final: boolean) => void) => {
      const i = el('input', { type: 'color', 'aria-label': label, value }) as HTMLInputElement;
      i.addEventListener('input', () => set(i.value, false));
      i.addEventListener('change', () => set(i.value, true));
      return i;
    };
    const change = (label: string, patch: Partial<CaptionSpec>) => this.commit(label, { ...this.base!, ...patch });
    const keyable = (parent: HTMLElement, key: CaptionKey) => {
      const d = CAPTION_KEYS.find(k => k.key === key)!, keyed = !!c.keys?.[key]?.keys.length;
      const l = this.layer()!, value = Math.round(captionAt(c, key, app.frame - l.start));
      const s = slider(parent, d.label, d.min, d.max, 1, value, d.unit,
        v => keyed ? this.cur : { ...this.cur, values: { ...this.cur.values, [key]: v } },
        v => { const lay = this.layer(); if (lay && this.base) { lay.caption = this.base; app.editor.setValue(this.layerId, `cap:${key}`, v, `Change caption ${d.label.toLowerCase()}`); } });
      if (keyed) { s.closest('.cap-row')!.classList.add('keyed'); s.title = 'Animated: this sets a key at the playhead'; }
    };

    // Words
    const words = section('Words');
    const text = el('textarea', { class: 'cap-words textbox', rows: '3', 'aria-label': 'Caption words', maxlength: String(MAX_CAPTION_CHARS), placeholder: 'What they say' }) as HTMLTextAreaElement;
    text.value = c.text;
    text.addEventListener('input', () => this.live({ ...this.cur, text: text.value }));
    text.addEventListener('change', () => this.commitWords(text.value));
    words.append(text, el('p', { class: 'hint' }, 'Press Enter for your own line breaks; otherwise the words wrap to fit the balloon.'));

    // Lettering
    const letters = section('Lettering');
    const fonts = el('div', { class: 'cap-fonts', role: 'radiogroup', 'aria-label': 'Font' });
    const fontButton = (id: string, name: string, note: string) => {
      captionFont({ ...c, font: id, bold: false, italic: false }, 16);
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(c.font === id), title: `${name} · ${note}` });
      const sample = el('span', { class: 'cap-font-sample' }, 'Aa');
      sample.style.fontFamily = `"${familyName(id, false, false)}", ${FALLBACK}`;
      b.append(sample, el('span', { class: 'cap-font-name' }, name));
      b.addEventListener('click', () => change('Change caption font', { font: id }));
      fonts.append(b);
    };
    for (const f of BUNDLED_FONTS) fontButton(f.id, f.label, f.role);
    for (const [id, f] of app.project.fonts) fontButton(`custom:${id}`, f.name, 'imported');
    const importBtn = el('button', { type: 'button', class: 'cap-font-import' }, 'Import font…');
    const picker = el('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', hidden: '' }) as HTMLInputElement;
    const status = el('p', { class: 'hint', role: 'status' });
    importBtn.addEventListener('click', () => picker.click());
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0]; picker.value = '';
      if (!file) return;
      if (file.size > MAX_FONT_BYTES) { status.textContent = 'That font file is larger than 4 MB.'; return; }
      if (app.project.fonts.size >= MAX_PROJECT_FONTS) { status.textContent = `A project can hold ${MAX_PROJECT_FONTS} fonts.`; return; }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isFontFile(file.name, bytes)) { status.textContent = 'Choose a TTF, OTF, WOFF or WOFF2 font file.'; return; }
      const hash = hashBytes(bytes), ext = file.name.toLowerCase().split('.').pop()!, id = `f${hash.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`;
      app.project.fonts.set(id, { name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), path: `assets/${hash.replace(/[^A-Za-z0-9_.-]/g, '')}.${ext}`, bytes });
      change('Change caption font', { font: `custom:${id}` });
      this.build();
      this.panel?.querySelector('.cap-fonts')?.after(el('p', { class: 'hint', role: 'status' }, 'Font imported and saved with this project. Make sure you may use it.'));
    });
    fonts.append(importBtn);
    letters.append(fonts, picker, status);
    chips<LetterSize>(letters, 'Size', [['small', 'Small'], ['body', 'Body'], ['big', 'Big']], c.size, v => change('Change caption size', { size: v }));
    chips<LetterAlign>(letters, 'Align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], c.align, v => change('Align caption', { align: v }));
    const toggles = el('div', { class: 'cap-chips' });
    for (const [key, label] of [['bold', 'Bold'], ['italic', 'Italic'], ['caps', 'ALL CAPS']] as const) {
      const b = el('button', { type: 'button', 'aria-pressed': String(c[key]) }, label);
      b.addEventListener('click', () => change(`Caption ${label.toLowerCase()}`, { [key]: !this.base![key] }));
      toggles.append(b);
    }
    row(letters, 'Style', toggles);
    row(letters, 'Colour', colour('Text colour', c.textColor, (v, final) => final ? change('Caption text colour', { textColor: v }) : this.live({ ...this.cur, textColor: v })));
    const outlineOn = el('input', { type: 'checkbox', 'aria-label': 'Outline the letters' }) as HTMLInputElement;
    outlineOn.checked = !!c.textOutline;
    const outlineColour = colour('Letter outline colour', c.textOutline ?? '#111111', (v, final) => { if (!outlineOn.checked) return; if (final) change('Caption letter outline', { textOutline: v }); else this.live({ ...this.cur, textOutline: v }); });
    outlineOn.addEventListener('change', () => change('Caption letter outline', { textOutline: outlineOn.checked ? outlineColour.value : null }));
    row(letters, 'Letter outline', outlineOn, outlineColour);
    if (c.textOutline) slider(letters, 'Outline width', 0, 60, 1, Math.round(c.textOutlineWidth * 100), '%', v => ({ ...this.cur, textOutlineWidth: v / 100 }), v => change('Caption letter outline', { textOutlineWidth: v / 100 }));
    keyable(letters, 'tracking');
    keyable(letters, 'leading');

    // Balloon
    const balloon = section('Balloon');
    chips<BalloonStyle>(balloon, 'Shape', STYLE_NAMES.filter(([s]) => s !== 'custom' || c.style === 'custom'), c.style, v => change('Change balloon style', { style: v, ...(v === 'sfx' ? { tails: [] } : {}) }));
    if (c.style !== 'sfx' && c.style !== 'custom') slider(balloon, 'Width', 50, 250, 5, Math.round((c.shape ?? 1) * 100), '%', v => ({ ...this.cur, shape: v / 100 }), v => change('Change balloon width', { shape: v === 100 ? undefined : v / 100 }));
    if (c.style !== 'sfx') {
      const cols = el('div', { class: 'cap-chips' });
      cols.append(
        el('span', { class: 'name' }, 'Fill'), colour('Balloon fill', c.fill, (v, final) => final ? change('Balloon fill', { fill: v }) : this.live({ ...this.cur, fill: v })),
        el('span', { class: 'name' }, 'Ink'), colour('Balloon ink', c.ink, (v, final) => final ? change('Balloon ink', { ink: v }) : this.live({ ...this.cur, ink: v })),
      );
      row(balloon, 'Colours', cols);
      slider(balloon, 'Ink width', 0, 30, 1, Math.round(c.inkWidth * 100), '%', v => ({ ...this.cur, inkWidth: v / 100 }), v => change('Balloon ink width', { inkWidth: v / 100 }));
      keyable(balloon, 'inkEnd');
      keyable(balloon, 'balloonOpacity');
    }
    keyable(balloon, 'textOpacity');

    // Tails
    if (c.style !== 'sfx') {
      const tails = section('Tails', c.tails.length > 0);
      c.tails.forEach((t, i) => {
        const box = el('div', { class: 'cap-tail' });
        box.append(el('span', { class: 'cap-tail-n' }, `Tail ${i + 1}`));
        const setTail = (label: string, patch: Partial<CaptionTail> | null) => change(label, { tails: this.base!.tails.flatMap((x, j) => (j !== i ? [x] : patch ? [{ ...x, ...patch }] : [])) });
        chips<TailJoin>(box, 'Join', TAIL_JOINS.map(j => [j, JOIN_NAMES[j]]), t.join, v => setTail('Change tail join', { join: v }));
        slider(box, 'Base width', 30, 400, 5, Math.round(t.width * 100), '%', v => ({ ...this.cur, tails: this.cur.tails.map((x, j) => (j === i ? { ...x, width: v / 100 } : x)) }), v => setTail('Change tail width', { width: v / 100 }));
        const acts = el('div', { class: 'cap-chips' });
        if (t.bend) { const s = el('button', { type: 'button' }, 'Straighten'); s.addEventListener('click', () => change('Straighten caption tail', { tails: this.base!.tails.map((x, j) => { if (j !== i) return x; const { bend: _b, ...rest } = x; return rest; }) })); acts.append(s); }
        const del = el('button', { type: 'button' }, 'Remove tail'); del.addEventListener('click', () => setTail('Remove caption tail', null)); acts.append(del);
        box.append(acts);
        tails.append(box);
      });
      if (c.tails.length < MAX_TAILS) {
        const add = el('button', { type: 'button', class: 'cap-add' }, '+ Add tail');
        add.addEventListener('click', () => {
          const b = this.base!, { lay } = captionBalloon(b, 0, app.project.width, app.project.height), side = b.tails.length % 2 ? 1 : -1;
          const tail: CaptionTail = { x: b.x + side * lay.fit.a * 0.6, y: b.y + lay.fit.b + lay.size * 3, join: b.style === 'thought' ? 'bubbles' : b.tails[0]?.join && b.tails[0].join !== 'none' ? b.tails[0].join : 'merged', width: 1.2 };
          change('Add caption tail', { tails: [...b.tails, tail] });
        });
        tails.append(add, el('p', { class: 'hint' }, 'On the canvas, drag a tail’s round tip to aim it and its diamond to bend it.'));
      }
    }

    // Animate
    const animate = section('Animate', false);
    keyable(animate, 'reveal');
    keyable(animate, 'balloon');
    const presets = el('div', { class: 'cap-chips' });
    for (const [kind, label] of [['fadeIn', 'Fade in'], ['popIn', 'Pop in'], ['typeOn', 'Type on'], ['fadeOut', 'Fade out']] as const) {
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', () => { if (app.project.activeLayer !== this.layerId) app.focusLayer(this.layerId); app.captionPreset(kind); });
      presets.append(b);
    }
    row(animate, 'Presets', presets);
    animate.append(el('p', { class: 'hint' }, 'Presets and changes to animated settings add keys at the playhead. Fine-tune them on the caption’s rows in Motion.'));

    // Position
    const place = section('Position', false);
    const num = (label: string, value: number, set: (v: number) => void) => {
      const i = el('input', { type: 'number', step: '1', value: String(Math.round(value)), 'aria-label': label }) as HTMLInputElement;
      i.addEventListener('change', () => { const v = Number(i.value); if (Number.isFinite(v)) set(v); });
      return i;
    };
    const xy = el('div', { class: 'cap-chips' });
    xy.append(el('span', { class: 'name' }, 'X'), num('Balloon X', c.x, v => change('Move caption', { x: v })), el('span', { class: 'name' }, 'Y'), num('Balloon Y', c.y, v => change('Move caption', { y: v })));
    row(place, 'Centre', xy);
    const centre = el('button', { type: 'button' }, 'Centre in picture');
    centre.addEventListener('click', () => change('Move caption', { x: app.project.width / 2, y: app.project.height / 2 }));
    row(place, '', centre);
    place.append(el('p', { class: 'hint' }, 'Or drag inside the balloon on the canvas. Moving the balloon keeps its tails pointing at the same place.'));

    this.drawPreview();
  }

  /** The caption alone, fitted into the preview (its look, or the playhead's frame of its animation). */
  private drawPreview(): void {
    const cv = this.preview, l = this.layer();
    if (!cv || !l) return;
    const g = cv.getContext('2d')!, W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#dfe5ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d1d8e1';
    for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < W; x += 32) g.fillRect(x, y, 16, 16);
    const frame = this.animated ? this.app.frame - l.start : 0;
    const c = this.animated ? l.caption! : { ...l.caption!, keys: undefined };
    const { shapes } = captionBalloon(c, frame, this.app.project.width, this.app.project.height);
    const pts = [...shapes.outline, ...shapes.seams.flat(), ...shapes.zigzags.flat(), ...shapes.bubbles.flatMap(b => [{ x: b.x - b.r, y: b.y - b.r }, { x: b.x + b.r, y: b.y + b.r }])];
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 40) / Math.max(1, x1 - x0), (H - 40) / Math.max(1, y1 - y0), 4);
    g.setTransform(k, 0, 0, k, W / 2 - ((x0 + x1) / 2) * k, H / 2 - ((y0 + y1) / 2) * k);
    paintCaption(g, c, frame, 'all');
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
