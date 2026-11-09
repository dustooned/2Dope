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
import { CAPTION_KEYS, MAX_CAPTION_CHARS, MAX_TAILS, TAIL_JOINS, TAIL_LIMITS, type BalloonStyle, type CaptionKey, type CaptionSpec, type CaptionTail, type LetterAlign, type LetterSize, type TailJoin } from '../lettering/spec';
import { captionAt, captionBalloon, paintCaption } from '../view/caption';
import { lookRound, lookWobble, shapeForText, turnOutline, type Pt } from '../lettering/geometry';
import type { BalloonLook } from '../lettering/spec';
import { captionFont } from '../view/captionfonts';
import { el } from './dom';
import { decorate, iconSvg } from './icons';
import { askText } from './dialogs';
import { applyStyle, BUILTIN_STYLES, captureStyle, MAX_SAVED_STYLES, MAX_STYLE_BYTES, readStyle, type CaptionStyle } from '../lettering/styles';
import { defaultCaption } from '../lettering/spec';
import { customFontId, isCustomFont } from '../lettering/fonts';

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
  /** The settings tab showing (kept while the panel is open and between captions). */
  private tab = 'Letters';
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
    // shape drawing and editing belong to the panel's caption
    this.app.letters.shapeTarget = null; this.app.letters.shapeEditing = null;
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
    // keep the scroll position and which sections are open across rebuilds
    const keepTop = p.querySelector('.cap-body')?.scrollTop ?? 0;
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

    // the words stay in view; everything else sits on tabs, one group at a time
    const wordsBox = el('div', { class: 'cap-wordsbox' });
    const tabs = el('div', { class: 'cap-tabs', role: 'tablist', 'aria-label': 'Caption settings' });
    const body = el('div', { class: 'cap-body' });
    p.append(head, view, wordsBox, tabs, body);
    const section = (title: string, icon: string, hint: string) => {
      if (title === 'Words') return wordsBox;
      const pane = el('div', { class: 'cap-pane', role: 'tabpanel', 'aria-label': title });
      const tab = el('button', { type: 'button', role: 'tab', 'aria-selected': String(this.tab === title), title: hint });
      const glyph = el('span', { class: 'cap-tab-icon', 'aria-hidden': 'true' });
      if (icon.length > 2) glyph.innerHTML = iconSvg(icon); else glyph.textContent = icon;
      tab.append(glyph, el('span', {}, title));
      tab.addEventListener('click', () => {
        this.tab = title;
        for (const t of tabs.children) t.setAttribute('aria-selected', String(t === tab));
        for (const q of body.children) (q as HTMLElement).hidden = q !== pane;
        body.scrollTop = 0;
      });
      pane.hidden = this.tab !== title;
      if (hint) pane.append(el('p', { class: 'hint cap-pane-hint' }, hint));
      tabs.append(tab); body.append(pane);
      return pane;
    };
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
    const words = section('Words', '', '');
    const text = el('textarea', { class: 'cap-words textbox', rows: '3', 'aria-label': 'Caption words', maxlength: String(MAX_CAPTION_CHARS), placeholder: 'What they say' }) as HTMLTextAreaElement;
    text.value = c.text;
    text.addEventListener('input', () => this.live({ ...this.cur, text: text.value }));
    text.addEventListener('change', () => this.commitWords(text.value));
    words.append(text, el('p', { class: 'hint' }, 'Press Enter for your own line breaks; otherwise the words wrap to fit the balloon.'));

    // Lettering
    const letters = section('Letters', 'Aa', 'Font, size, emphasis, colour and spacing of the words.');
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
    const balloon = section('Balloon', 'balloonSpeech', 'The balloon’s shape, width, fill and ink.');
    chips<BalloonStyle>(balloon, 'Shape', STYLE_NAMES.filter(([s]) => s !== 'custom' || c.style === 'custom'), c.style, v => change('Change balloon style', { style: v, ...(v === 'sfx' ? { tails: [] } : {}) }));
    if (c.style !== 'sfx' && (c.style !== 'custom' || c.look?.outline)) slider(balloon, 'Width', 50, 250, 5, Math.round((c.shape ?? 1) * 100), '%', v => ({ ...this.cur, shape: v / 100 }), v => change('Change balloon width', { shape: v === 100 ? undefined : v / 100 }));
    if (c.minSize) {
      const fit = el('button', { type: 'button', title: 'This balloon keeps the size it was drawn at. Fit to words lets it size to the words like other captions.' }, 'Fit to words');
      fit.addEventListener('click', () => { const { minSize: _m, ...rest } = this.base!; this.commit('Fit balloon to words', rest); });
      row(balloon, 'Drawn size', fit);
    }
    if (c.style !== 'sfx' && c.style !== 'box' && (c.style !== 'custom' || c.look?.outline)) {
      // the look: quick presets, then the dials (each change one Undo step)
      const withLook = (patch: Partial<BalloonLook> | null, base = this.cur): CaptionSpec => {
        const look: BalloonLook = patch === null ? (base.look?.outline ? { outline: base.look.outline } : {}) : { ...base.look, ...patch };
        for (const k of Object.keys(look) as (keyof BalloonLook)[]) if (look[k] === undefined) delete look[k];
        const { look: _old, ...rest } = base;
        return Object.keys(look).length ? { ...rest, look } : rest;
      };
      const setLook = (label: string, patch: Partial<BalloonLook> | null) => this.commit(label, withLook(patch, this.base!));
      const looks = el('div', { class: 'cap-chips' });
      for (const [name, patch, title] of [['Classic', null, 'The comic-book balloon: fuller, flatter top and bottom, lightly hand-inked'], ['Oval', { round: 2, wobble: 0 }, 'A smooth oval'], ['Soft box', { round: 5, wobble: 0 }, 'A rounded rectangle'], ['Hand-drawn', { round: 2.6, wobble: 1 }, 'Loose and inky']] as [string, Partial<BalloonLook> | null, string][]) {
        const b = el('button', { type: 'button', title }, name);
        b.addEventListener('click', () => setLook(`Balloon look: ${name.toLowerCase()}`, patch));
        looks.append(b);
      }
      row(balloon, 'Look', looks);
      slider(balloon, 'Roundness', 20, 80, 1, Math.round(lookRound(c.style, c.look) * 10), '', v => withLook({ round: v / 10 }), v => setLook('Balloon roundness', { round: v / 10 }));
      slider(balloon, 'Wobble', 0, 100, 1, Math.round(lookWobble(c.style, c.look) * 100), '%', v => withLook({ wobble: v / 100 }), v => setLook('Balloon wobble', { wobble: v / 100 }));
      if (c.style === 'shout') {
        const { lay } = captionBalloon(c, 0, app.project.width, app.project.height), auto = Math.max(10, Math.min(22, Math.round((lay.fit.a + lay.fit.b) / 18)));
        slider(balloon, 'Spikes', 4, 40, 1, c.look?.spikes ?? auto, '', v => withLook({ spikes: v }), v => setLook('Shout spikes', { spikes: v }));
        slider(balloon, 'Spike length', 5, 100, 1, Math.round((c.look?.spikeDepth ?? 0.26) * 100), '%', v => withLook({ spikeDepth: v / 100 }), v => setLook('Shout spike length', { spikeDepth: v / 100 }));
      }
      if (c.style === 'thought') {
        const { lay } = captionBalloon(c, 0, app.project.width, app.project.height), a = lay.fit.a, b = lay.fit.b;
        const auto = Math.max(6, Math.min(16, Math.round((Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / (Math.min(a, b) * 0.9))));
        slider(balloon, 'Bumps', 4, 30, 1, c.look?.bumps ?? auto, '', v => withLook({ bumps: v }), v => setLook('Thought bumps', { bumps: v }));
        slider(balloon, 'Bump size', 4, 50, 1, Math.round((c.look?.bumpDepth ?? 0.16) * 100), '%', v => withLook({ bumpDepth: v / 100 }), v => setLook('Thought bump size', { bumpDepth: v / 100 }));
      }
    }
    if (c.style !== 'sfx') {
      // a custom shape: an SVG outline (or the drawn one), stretched to fit the words
      const svgPick = el('input', { type: 'file', accept: '.svg,image/svg+xml', hidden: '' }) as HTMLInputElement;
      const shapeBtns = el('div', { class: 'cap-chips' });
      const useSvg = el('button', { type: 'button', title: 'Use the first closed path of an SVG file as this balloon’s shape. It stretches to fit the words.' }, 'Use SVG shape…');
      useSvg.addEventListener('click', () => svgPick.click());
      svgPick.addEventListener('change', async () => {
        const file = svgPick.files?.[0]; svgPick.value = '';
        if (!file) return;
        const pts = file.size > 2_000_000 ? null : svgOutline(await file.text());
        if (!pts) { app.onNotice?.('No closed shape found in that SVG. Use a file with one filled path.'); return; }
        // turned so its long side runs with the words, and centred where the words fit best
        const outline = shapeForText(pts);
        this.commit('Balloon shape from SVG', { ...this.base!, style: this.base!.style === 'box' ? 'speech' : this.base!.style, look: { ...this.base!.look, outline } });
      });
      const draw = el('button', { type: 'button', 'aria-pressed': String(app.letters.shapeTarget === this.layerId), title: 'Draw a closed loop on the canvas: it becomes this balloon’s shape (Esc stops)' }, 'Draw shape');
      draw.addEventListener('click', () => { app.letters.armShape(app.letters.shapeTarget === this.layerId ? null : this.layerId); this.build(); });
      shapeBtns.prepend(draw);
      shapeBtns.append(useSvg);
      if (c.look?.outline) {
        const editing = app.letters.shapeEditing === this.layerId;
        const reshape = el('button', { type: 'button', 'aria-pressed': String(editing), title: 'Show handles on the balloon: drag one to reshape it smoothly' }, 'Edit shape');
        reshape.addEventListener('click', () => { app.letters.shapeEditing = editing ? null : this.layerId; if (!editing) app.setLettering(true); app.requestRender(); this.build(); });
        const turn = el('button', { type: 'button', title: 'Turn the shape a quarter turn' }, 'Turn 90°');
        turn.addEventListener('click', () => this.commit('Turn balloon shape', { ...this.base!, look: { ...this.base!.look, outline: turnOutline(this.base!.look!.outline!, 'turn') } }));
        const mirror = el('button', { type: 'button', title: 'Flip the shape left to right' }, 'Mirror');
        mirror.addEventListener('click', () => this.commit('Mirror balloon shape', { ...this.base!, look: { ...this.base!.look, outline: turnOutline(this.base!.look!.outline!, 'mirror') } }));
        shapeBtns.append(reshape, turn, mirror);
        const clear = el('button', { type: 'button', title: 'Back to the style’s own shape' }, 'Clear shape');
        clear.addEventListener('click', () => { const { outline: _o, ...rest } = this.base!.look ?? {}; const { look: _l, ...spec } = this.base!; this.commit('Clear balloon shape', Object.keys(rest).length ? { ...spec, ...(spec.style === 'custom' ? { style: 'speech' as const } : {}), look: rest } : { ...spec, ...(spec.style === 'custom' ? { style: 'speech' as const } : {}) }); });
        shapeBtns.append(clear);
      }
      row(balloon, 'Custom shape', shapeBtns);
      balloon.append(svgPick);
    }
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
      const tails = section('Tails', 'tail', 'On the canvas: drag a tail’s round tip to aim it, its diamond to bend it.');
      c.tails.forEach((t, i) => {
        const box = el('div', { class: 'cap-tail' });
        box.append(el('span', { class: 'cap-tail-n' }, `Tail ${i + 1}`));
        const setTail = (label: string, patch: Partial<CaptionTail> | null) => change(label, { tails: this.base!.tails.flatMap((x, j) => (j !== i ? [x] : patch ? [{ ...x, ...patch }] : [])) });
        chips<TailJoin>(box, 'Join', TAIL_JOINS.map(j => [j, JOIN_NAMES[j]]), t.join, v => setTail('Change tail join', { join: v }));
        // each tail style has its own settings
        const tailSlider = (label: string, key: keyof typeof TAIL_LIMITS, scale: number, unit: string, undo: string) => {
          const [lo, hi, def] = TAIL_LIMITS[key];
          slider(box, label, lo * scale, hi * scale, key === 'count' || key === 'zigs' ? 1 : scale >= 100 ? 5 : 1, Math.round(((t[key] as number | undefined) ?? def) * scale), unit,
            v => ({ ...this.cur, tails: this.cur.tails.map((x, j) => (j === i ? { ...x, [key]: v / scale } : x)) }), v => setTail(undo, { [key]: v / scale }));
        };
        if (t.join !== 'none') slider(box, t.join === 'bubbles' ? 'Spread' : 'Base width', 30, 400, 5, Math.round(t.width * 100), '%', v => ({ ...this.cur, tails: this.cur.tails.map((x, j) => (j === i ? { ...x, width: v / 100 } : x)) }), v => setTail('Change tail width', { width: v / 100 }));
        if (t.join === 'merged' || t.join === 'seam') { tailSlider('Taper', 'taper', 100, '%', 'Change tail taper'); tailSlider('Tip', 'tip', 100, '%', 'Change tail tip'); }
        if (t.join === 'bubbles') { tailSlider('Bubble count', 'count', 1, '', 'Change bubble count'); tailSlider('Bubble size', 'size', 100, '%', 'Change bubble size'); tailSlider('Shrink', 'shrink', 100, '%', 'Change bubble shrink'); }
        if (t.join === 'lightning') { tailSlider('Zigs', 'zigs', 1, '', 'Change lightning zigs'); tailSlider('Zig width', 'amp', 100, '%', 'Change lightning width'); }
        // the tip can follow a character: it stays on the same spot of that layer as it moves
        const follows = el('select', { 'aria-label': `Tail ${i + 1} follows` }) as HTMLSelectElement;
        follows.append(el('option', { value: '' }, 'Nothing (stays put)'));
        for (const x of app.project.comp.layers) if (x.id !== this.layerId && !(x.kind === 'drawings' && x.caption) && x.kind !== 'camera') follows.append(el('option', { value: x.id }, x.name));
        follows.value = t.follow?.layer ?? '';
        follows.addEventListener('change', () => {
          const lay = this.layer();
          if (!lay) return;
          const shown = app.letters.shown(lay).tails[i]!, target = follows.value;
          const at = target ? app.letters.followSpot(lay, target, { x: shown.x, y: shown.y }) : null;
          change(target ? 'Tail follows layer' : 'Tail stops following', { tails: this.base!.tails.map((x, j) => { if (j !== i) return x; const { follow: _f, ...rest } = x; return target && at ? { ...rest, x: shown.x, y: shown.y, follow: { layer: target, at } } : { ...rest, x: shown.x, y: shown.y }; }) });
        });
        row(box, 'Follows', follows);
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
        tails.append(add);
      }
    }

    // Animate
    const animate = section('Animate', 'popIn', 'Presets add keys at the playhead; edit them on the caption’s rows in Motion.');
    keyable(animate, 'reveal');
    keyable(animate, 'balloon');
    const presets = el('div', { class: 'cap-chips' });
    for (const [kind, label] of [['fadeIn', 'Fade in'], ['popIn', 'Pop in'], ['typeOn', 'Type on'], ['fadeOut', 'Fade out']] as const) {
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', () => { if (app.project.activeLayer !== this.layerId) app.focusLayer(this.layerId); app.captionPreset(kind); });
      presets.append(b);
    }
    row(animate, 'Presets', presets);

    // Position
    const place = section('Place', 'place', 'Or drag inside the balloon on the canvas; its tails keep pointing at the same place.');
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
    const lay = this.layer()!, rot = lay.transform.rotation, scl = lay.transform.scale;
    if (rot.value !== 0 || rot.keys.length || scl.value[0] !== 100 || scl.value[1] !== 100 || scl.keys.length) {
      const reset = el('button', { type: 'button', title: 'Back to level and 100% (the turn and scale handles on the canvas change them)' }, 'Straighten and reset size');
      reset.addEventListener('click', () => app.editor.edit('Reset caption turn and scale', cc => { const x = cc.layers.find(y => y.id === this.layerId); if (x) { x.transform.rotation = { ...x.transform.rotation, value: 0, keys: [] }; x.transform.scale = { ...x.transform.scale, value: [100, 100], keys: [] }; } }));
      row(place, 'Turn & scale', reset);
    }

    // Styles: ready-made and saved looks, applied in one step; save, export and import
    const styles = section('Styles', 'captionStyles', 'A style is the look (font, colours, balloon, tail), not the words or place. Tap one to use it.');
    const cards = el('div', { class: 'cap-styles' });
    const card = (s: CaptionStyle, own: boolean) => {
      const box = el('div', { class: 'cap-style' });
      const use = el('button', { type: 'button', class: 'cap-style-use', title: `Use “${s.name}”` });
      const cv = el('canvas', { width: '180', height: '96', 'aria-hidden': 'true' }) as HTMLCanvasElement;
      drawCaptionInto(cv, applyStyle({ ...defaultCaption(0, 0), text: 'Hey!', tails: [] }, s), 0, app.project.width, app.project.height, '#f3f5f8');
      use.append(cv, el('span', {}, s.name));
      use.addEventListener('click', () => this.useStyle(s));
      box.append(use);
      if (own) {
        const acts = el('div', { class: 'cap-style-acts' });
        const out = el('button', { type: 'button', title: `Save “${s.name}” as a file to share or keep` }, 'Export');
        out.addEventListener('click', () => this.exportStyle(s));
        const del = el('button', { type: 'button', title: `Remove “${s.name}” from this device` }, 'Delete');
        del.addEventListener('click', () => { writeSavedStyles(readSavedStyles().filter(x => x.id !== s.id)); this.build(); });
        acts.append(out, del);
        box.append(acts);
      }
      cards.append(box);
    };
    const saved = readSavedStyles();
    for (const s of saved) card(s, true);
    for (const s of BUILTIN_STYLES) card(s, false);
    const acts = el('div', { class: 'cap-chips' });
    const save = el('button', { type: 'button', class: 'primary', title: 'Keep this caption’s look as a style on this device' }, 'Save this style…');
    save.addEventListener('click', async () => {
      const name = await askText('Save caption style', '', 'Save', 'A name for this look (the words and place are not saved).');
      if (name === null) return;
      const list = readSavedStyles();
      if (list.length >= MAX_SAVED_STYLES) { app.onNotice?.(`This device keeps ${MAX_SAVED_STYLES} caption styles. Delete one first.`); return; }
      writeSavedStyles([captureStyle(this.base!, `s${Date.now().toString(36)}`, name), ...list]);
      this.build();
      app.onNotice?.('Style saved. Export it to use it on another device or share it.');
    });
    const pick = el('input', { type: 'file', accept: '.2dope-style,.json,application/json', hidden: '' }) as HTMLInputElement;
    const imp = el('button', { type: 'button', title: 'Add a style from a .2dope-style file (with its font, if it has one)' }, 'Import style…');
    imp.addEventListener('click', () => pick.click());
    pick.addEventListener('change', async () => {
      const file = pick.files?.[0]; pick.value = '';
      if (!file) return;
      try {
        if (file.size > MAX_STYLE_BYTES) throw new Error('That file is too large for a caption style.');
        const s = readStyle(JSON.parse(await file.text()));
        const list = readSavedStyles().filter(x => x.id !== s.id);
        writeSavedStyles([{ ...s, id: s.id }, ...list].slice(0, MAX_SAVED_STYLES));
        this.build();
        app.onNotice?.(`Imported “${s.name}”. Tap it to use it.`);
      } catch (e) { app.onNotice?.((e as Error).message || 'That file is not a caption style.'); }
    });
    acts.append(save, imp);
    styles.append(acts, pick, cards);

    // every control gets its own icon (by its label), like the tool rows
    for (const b of p.querySelectorAll<HTMLButtonElement>('button:not([role=tab]):not(.cap-style-use)')) {
      const icon = PANEL_ICONS[(b.textContent ?? '').trim()];
      if (icon && !b.classList.contains('has-ico')) decorate(b, icon);
    }
    if (![...tabs.children].some(t => t.getAttribute('aria-selected') === 'true')) (tabs.firstElementChild as HTMLButtonElement | null)?.click();
    body.scrollTop = keepTop;
    this.drawPreview();
  }

  /** The caption alone, fitted into the preview (its look, or the playhead's frame of its animation). */
  private drawPreview(): void {
    const cv = this.preview, l = this.layer();
    if (!cv || !l) return;
    const frame = this.animated ? this.app.frame - l.start : 0;
    drawCaptionInto(cv, this.animated ? l.caption! : { ...l.caption!, keys: undefined }, frame, this.app.project.width, this.app.project.height);
  }

  /** Use a style on this caption: one Undo step. A style's own font is added to the project first. */
  private useStyle(s: CaptionStyle): void {
    const app = this.app;
    let style = s;
    if (s.font && isCustomFont(s.look.font)) {
      const bytes = fromBase64(s.font.data), id = `f${s.font.data.length.toString(36)}${s.font.data.slice(0, 24).replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40);
      if (!app.project.fonts.has(id)) {
        if (app.project.fonts.size >= 16) { app.onNotice?.('This project holds 16 fonts already; the style uses its own font.'); }
        else app.project.fonts.set(id, { name: s.font.name, path: `assets/${id}.${s.font.ext}`, bytes });
      }
      if (app.project.fonts.has(id)) style = { ...s, look: { ...s.look, font: `custom:${id}` } };
    } else if (isCustomFont(s.look.font) && !app.project.fonts.has(customFontId(s.look.font))) {
      style = { ...s, look: { ...s.look, font: 'comic-neue' } };
      app.onNotice?.(`“${s.name}” uses a font this project does not have, so Comic Neue stands in. Import the style file (it carries its font) or import the font.`);
    }
    this.commit(`Caption style: ${s.name}`, applyStyle(this.base!, style));
  }

  /** Save a style as a .2dope-style file, with its imported font inside (so it opens the same anywhere). */
  private exportStyle(s: CaptionStyle): void {
    let out: CaptionStyle = s;
    if (isCustomFont(s.look.font) && !s.font) {
      const f = this.app.project.fonts.get(customFontId(s.look.font));
      if (f?.bytes) out = { ...s, font: { name: f.name, ext: f.path.split('.').pop() ?? 'ttf', data: toBase64(f.bytes) } };
      else this.app.onNotice?.('The style’s font is not in this project, so the file will use Comic Neue where it opens.');
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.name.replace(/[^\w\- ]+/g, '').trim() || 'caption'}.2dope-style`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

/** The Caption panel's controls and their icons (by label). */
export const PANEL_ICONS: Record<string, string> = {
  Done: 'check', 'Import font…': 'import', 'Fit to words': 'fit',
  Small: 'sizeSmall', Body: 'sizeBody', Big: 'sizeBig', Left: 'alignLeft', Centre: 'alignCenter', Right: 'alignRight',
  Bold: 'bold', Italic: 'italic', 'ALL CAPS': 'caps',
  Speech: 'balloonSpeech', Thought: 'balloonThought', Shout: 'balloonShout', Whisper: 'balloonWhisper', Box: 'balloonBox', 'Sound effect': 'sfx', 'As drawn': 'balloonCustom',
  Classic: 'lookClassic', Oval: 'lookOval', 'Soft box': 'lookSoftbox', 'Hand-drawn': 'lookHand',
  'Draw shape': 'drawShape', 'Use SVG shape…': 'svgShape', 'Edit shape': 'editpoints', 'Turn 90°': 'turn90', Mirror: 'fliph', 'Clear shape': 'close',
  Joined: 'tailJoined', Seam: 'tailSeam', Bubbles: 'tailBubbles', Lightning: 'tailLightning', Hidden: 'tailNone',
  Straighten: 'straighten', 'Remove tail': 'trash', '+ Add tail': 'plus',
  'Fade in': 'fadeIn', 'Pop in': 'popIn', 'Type on': 'typeOn', 'Fade out': 'fadeOut',
  'Centre in picture': 'centrecross', 'Straighten and reset size': 'resetrotation',
  Export: 'download', Delete: 'trash', 'Save this style…': 'save', 'Import style…': 'import',
};

const STYLES_KEY = '2dope.captionStyles';
/** The caption styles saved on this device (bad entries are skipped). */
export function readSavedStyles(): CaptionStyle[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STYLES_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.flatMap(s => { try { return [readStyle(s)]; } catch { return []; } }).slice(0, MAX_SAVED_STYLES) : [];
  } catch { return []; }
}
export function writeSavedStyles(list: CaptionStyle[]): void {
  try { localStorage.setItem(STYLES_KEY, JSON.stringify(list.slice(0, MAX_SAVED_STYLES))); } catch { /* storage full or blocked: styles stay for this session's panel only */ }
}
function toBase64(bytes: Uint8Array): string { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromBase64(data: string): Uint8Array { const s = atob(data), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

/** Draw a caption alone, fitted into a canvas over a light checkerboard. */
function drawCaptionInto(cv: HTMLCanvasElement, c: CaptionSpec, frame: number, pageW: number, pageH: number, bg = '#dfe5ec'): void {
  const g = cv.getContext('2d')!, W = cv.width, H = cv.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.045)';
  const cell = Math.max(8, Math.round(W / 35));
  for (let y = 0; y < H; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < W; x += cell * 2) g.fillRect(x, y, cell, cell);
  const { shapes } = captionBalloon(c, frame, pageW, pageH);
  const pts = [...shapes.outline, ...shapes.seams.flat(), ...shapes.zigzags.flat(), ...shapes.bubbles.flatMap(b => [{ x: b.x - b.r, y: b.y - b.r }, { x: b.x + b.r, y: b.y + b.r }])];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.round(W / 14), k = Math.min((W - pad) / Math.max(1, x1 - x0), (H - pad) / Math.max(1, y1 - y0), 4);
  g.setTransform(k, 0, 0, k, W / 2 - ((x0 + x1) / 2) * k, H / 2 - ((y0 + y1) / 2) * k);
  paintCaption(g, c, frame, 'all');
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * The first filled, closed path of an SVG, as points in the file's own space (group transforms
 * applied), sampled with the browser's path geometry. Null when there is none.
 */
export function svgOutline(text: string): Pt[] | null {
  let doc: Document;
  try { doc = new DOMParser().parseFromString(text, 'image/svg+xml'); } catch { return null; }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  // measure inside a hidden, inert copy (no scripts or external references are kept)
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('width', '0'); host.setAttribute('height', '0');
  host.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden';
  const shapes = [...root.querySelectorAll('path, ellipse, circle, rect, polygon')];
  for (const shape of shapes) {
    let chain: Element | null = shape, matrix = new DOMMatrix();
    while (chain && chain !== root) { const t = chain.getAttribute('transform'); if (t) { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('transform', t); host.append(g); const m = (g as SVGGElement).transform.baseVal.consolidate()?.matrix; g.remove(); if (m) matrix = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]).multiply(matrix); } chain = chain.parentElement; }
    const clone = document.createElementNS('http://www.w3.org/2000/svg', shape.nodeName.toLowerCase()) as SVGGeometryElement;
    for (const a of ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points']) { const v = shape.getAttribute(a); if (v !== null) clone.setAttribute(a, v); }
    host.append(clone);
    document.body.append(host);
    try {
      const len = clone.getTotalLength();
      if (!(len > 0)) continue;
      const pts: Pt[] = [];
      for (let i = 0; i < 240; i++) { const p = clone.getPointAtLength((i / 240) * len), q = matrix.transformPoint(new DOMPoint(p.x, p.y)); pts.push({ x: q.x, y: q.y }); }
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      if (Math.max(...xs) - Math.min(...xs) > 1 && Math.max(...ys) - Math.min(...ys) > 1) return pts;
    } catch { /* an unsupported shape: try the next */ } finally { clone.remove(); host.remove(); }
  }
  return null;
}
