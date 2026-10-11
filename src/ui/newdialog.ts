import { ASPECTS, clampFps, clampSide, framesFor, FPS_NAMES, LENGTHS, planeBytes, readNewSettings, fitPixels, sizeFor, sizeNote, TIERS, type NewSettings } from '../core/newproject';
import type { NewProjectOptions } from './files';

const KEY = '2dope.m2.new';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function load(): NewSettings {
  try {
    return readNewSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return readNewSettings(null);
  }
}

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(n < 1e7 ? 1 : 0)} MB`;
}

/** What "Screen" means on this device: its pixel shape, trimmed to a sensible size. */
function screenShape(): { w: number; h: number } {
  const w = Math.max(1, Math.round(window.screen?.width || window.innerWidth));
  const h = Math.max(1, Math.round(window.screen?.height || window.innerHeight));
  // iPads report the shape in their current orientation; the page keeps it
  return { w, h };
}

/**
 * The New project dialog: pick a shape (wide, ultrawide, vertical, square, classic, this screen
 * or custom), a resolution, a frame rate, and how long the first drawing is held. The choice is
 * remembered for next time.
 */
export class NewProjectUI {
  private readonly dialog = el('dialog', { class: 'newproject', 'aria-label': 'New project' });
  private s = load();
  private name = '';
  private folder: string | null = null;
  private resolve: ((o: NewProjectOptions | null) => void) | null = null;

  /** `limits`: the device's page limits in Lite mode (null = no limits). */
  constructor(private readonly limits: { maxShort: number; maxPixels: number } | null = null) {
    document.body.append(this.dialog);
    this.dialog.addEventListener('close', () => {
      this.resolve?.(null);
      this.resolve = null;
    });
  }

  /** Show the dialog. Resolves to the chosen options, or null when cancelled. */
  open(folder: string | null = null): Promise<NewProjectOptions | null> {
    this.s = load();
    this.name = '';
    this.folder = folder;
    this.render();
    this.dialog.showModal();
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  /** The page size the current choice gives. */
  private size(): { width: number; height: number } {
    const s = this.s;
    const sz = s.aspect === 'custom' ? { ...s.custom } : this.sizeAt(this.tier());
    return this.limits ? fitPixels(sz.width, sz.height, this.limits.maxPixels) : sz;
  }

  /** The chosen quality, lowered to what this device allows in Lite mode. */
  private tier(): number {
    const max = this.limits?.maxShort ?? Infinity;
    if (this.s.tier <= max) return this.s.tier;
    return [...TIERS].reverse().find((t) => t <= max) ?? TIERS[0];
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // not remembered: fine
    }
  }

  private render(): void {
    const d = this.dialog;
    const s = this.s;
    d.replaceChildren();
    d.append(el('h2', {}, 'New project'));

    const row = (label: string, ...kids: HTMLElement[]) => {
      const r = el('div', { class: 'nrow' });
      const l = el('span', { class: 'name' }, label);
      const box = el('div', { class: 'nchoices' });
      box.append(...kids);
      r.append(l, box);
      return r;
    };
    const chip = (label: string, on: boolean, fn: () => void, title = '', sub = '') => {
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), title }, label);
      if (sub) b.append(el('small', {}, sub));
      b.addEventListener('click', fn);
      return b;
    };

    const nameIn = el('input', { type: 'text', maxlength: '60', placeholder: 'Untitled', value: this.name, 'aria-label': 'Project name', class: 'textbox' });
    nameIn.addEventListener('input', () => (this.name = nameIn.value));
    nameIn.addEventListener('keydown', (e) => e.stopPropagation());
    nameIn.addEventListener('keyup', (e) => e.stopPropagation());
    d.append(row('Name', nameIn));

    // Shape: a small picture of each aspect ratio, so it reads at a glance
    const shapes: HTMLElement[] = ASPECTS.map((a) => {
      const b = chip('', s.aspect === a.id, () => ((s.aspect = a.id), this.render()), `${a.label} (${a.id})`, a.id);
      const box = el('span', { class: 'ashape' });
      const k = 28 / Math.max(a.w, a.h);
      box.style.width = `${Math.round(a.w * k)}px`;
      box.style.height = `${Math.round(a.h * k)}px`;
      b.prepend(box);
      b.append(el('span', { class: 'aname' }, a.label));
      return b;
    });
    shapes.push(chip('This screen', s.aspect === 'screen', () => ((s.aspect = 'screen'), this.render()), 'The shape of this device'));
    shapes.push(chip('Custom', s.aspect === 'custom', () => ((s.aspect = 'custom'), this.render()), 'Type your own width and height'));
    d.append(row('Shape', ...shapes));

    if (s.aspect === 'custom') {
      const num = (value: number, label: string, set: (n: number) => void) => {
        const i = el('input', { type: 'number', min: '64', max: '4096', step: '2', value: String(value), 'aria-label': label, class: 'exp-input num' });
        i.addEventListener('input', () => {
          set(clampSide(Number(i.value)));
          this.summary();
        });
        i.addEventListener('keydown', (e) => e.stopPropagation());
        i.addEventListener('keyup', (e) => e.stopPropagation());
        return i;
      };
      d.append(
        row(
          'Size',
          num(s.custom.width, 'Width', (n) => (s.custom.width = n)),
          el('span', {}, '×'),
          num(s.custom.height, 'Height', (n) => (s.custom.height = n)),
          el('span', { class: 'hint' }, 'pixels'),
        ),
      );
    } else {
      d.append(
        row(
          'Quality',
          ...TIERS.map((t) => {
            const sz = this.sizeAt(t);
            const b = chip(`${t}p`, this.tier() === t, () => ((s.tier = t), this.render()), `${sz.width}×${sz.height}`, `${sz.width}×${sz.height}`);
            if (this.limits && t > this.limits.maxShort) {
              b.disabled = true;
              b.title = `Lite mode: up to ${this.limits.maxShort}p on this device (Settings → Device to change)`;
            }
            return b;
          }),
        ),
      );
    }

    d.append(
      row(
        'Speed',
        ...FPS_NAMES.map((f) => chip(String(f.fps), s.fps === f.fps, () => ((s.fps = f.fps), this.render()), f.name, f.name)),
        (() => {
          const i = el('input', { type: 'number', min: '1', max: '120', step: '1', value: String(s.fps), 'aria-label': 'Frames per second', class: 'exp-input num' });
          i.addEventListener('change', () => {
            s.fps = clampFps(Number(i.value));
            this.render();
          });
          i.addEventListener('keydown', (e) => e.stopPropagation());
          i.addEventListener('keyup', (e) => e.stopPropagation());
          return i;
        })(),
        el('span', { class: 'hint' }, 'frames per second'),
      ),
    );

    d.append(
      row('Length', ...LENGTHS.map((l) => chip(l.label, s.length === l.id, () => ((s.length = l.id), this.render()), l.seconds ? `The first drawing is held for ${l.label}` : 'One blank frame'))),
    );

    d.append(el('p', { class: 'hint nsummary', 'aria-live': 'polite' }), el('p', { class: 'nnote', hidden: '' }));

    const foot = el('div', { class: 'vfoot' });
    const cancel = el('button', { type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => {
      const res = this.resolve;
      this.resolve = null;
      res?.(null);
      d.close();
    });
    const create = el('button', { type: 'button', class: 'primary' }, 'Create');
    create.addEventListener('click', () => this.finish());
    foot.append(cancel, create);
    d.append(foot);
    this.summary();
  }

  private sizeAt(tier: number): { width: number; height: number } {
    const s = this.s;
    if (s.aspect === 'screen') return sizeFor(screenShape(), tier);
    const a = ASPECTS.find((x) => x.id === s.aspect) ?? ASPECTS[0]!;
    return sizeFor(a, tier);
  }

  private summary(): void {
    const sz = this.size();
    const len = LENGTHS.find((l) => l.id === this.s.length) ?? LENGTHS[0]!;
    const frames = framesFor(len, this.s.fps);
    const sum = this.dialog.querySelector<HTMLElement>('.nsummary');
    if (sum)
      sum.textContent = `${sz.width}×${sz.height} · ${this.s.fps} fps · ${frames} frame${frames === 1 ? '' : 's'} · about ${mb(planeBytes(sz.width, sz.height))} of memory per drawing plane while it is on screen${this.limits ? ` · Lite mode: up to ${this.limits.maxShort}p` : ''}`;
    const note = this.dialog.querySelector<HTMLElement>('.nnote');
    const n = sizeNote(sz.width, sz.height);
    if (note) {
      note.hidden = !n;
      note.textContent = n?.text ?? '';
      note.dataset.level = n?.level ?? '';
    }
  }

  private finish(): void {
    const s = this.s;
    this.save();
    const sz = this.size();
    const len = LENGTHS.find((l) => l.id === s.length) ?? LENGTHS[0]!;
    const opts: NewProjectOptions = { name: this.name, width: sz.width, height: sz.height, fps: s.fps, frames: framesFor(len, s.fps), folder: this.folder };
    const res = this.resolve;
    this.resolve = null;
    this.dialog.close();
    res?.(opts);
  }
}
