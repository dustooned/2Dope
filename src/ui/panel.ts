import type { App } from '../app';
import { cloneBrush, PRESETS, type BrushSettings, type Control, type Dynamic, type TiltShade } from '../core/brush';
import type { StrokePoint, StrokeRecord } from '../core/stroke';
import { strokeLength } from '../core/stroke';
import { dabsForStroke } from '../brush/dabs';
import { RasterEngine } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';

type NumKey = {
  [K in keyof BrushSettings]-?: NonNullable<BrushSettings[K]> extends number ? K : never;
}[keyof BrushSettings];

type DynKey = 'sizeDyn' | 'opacityDyn' | 'flowDyn';

interface SliderDef {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const SECTIONS: {
  title: string;
  sliders: SliderDef[];
  toggles?: { key: 'followDirection' | 'pulledString' | 'antiAlias'; label: string }[];
  dyn?: DynKey[];
  tilt?: boolean;
}[] = [
  {
    title: 'Tip',
    sliders: [
      { key: 'size', label: 'Size', min: 1, max: 300, step: 0.5, unit: 'px' },
      { key: 'hardness', label: 'Hardness', min: 0, max: 1, step: 0.01 },
      { key: 'spacing', label: 'Spacing', min: 0.02, max: 1, step: 0.01 },
      { key: 'roundness', label: 'Roundness', min: 0.05, max: 1, step: 0.01 },
      { key: 'angle', label: 'Angle', min: -90, max: 90, step: 1, unit: '°' },
    ],
    toggles: [{ key: 'followDirection', label: 'Rotate with stroke' }],
  },
  {
    title: 'Paint',
    sliders: [
      { key: 'opacity', label: 'Opacity', min: 0.01, max: 1, step: 0.01 },
      { key: 'flow', label: 'Flow', min: 0.01, max: 1, step: 0.01 },
      { key: 'scatter', label: 'Scatter', min: 0, max: 2, step: 0.01 },
      { key: 'grain', label: 'Paper grain', min: 0, max: 1, step: 0.01 },
      { key: 'grainScale', label: 'Grain scale', min: 0.25, max: 3, step: 0.05 },
    ],
  },
  {
    title: 'Tilt shading',
    sliders: [],
    tilt: true,
  },
  {
    title: 'Dynamics',
    sliders: [],
    dyn: ['sizeDyn', 'opacityDyn', 'flowDyn'],
  },
  {
    title: 'Stroke',
    sliders: [
      { key: 'taperStart', label: 'Taper start', min: 0, max: 200, step: 1, unit: 'px' },
      { key: 'taperEnd', label: 'Taper end', min: 0, max: 200, step: 1, unit: 'px' },
      { key: 'smoothing', label: 'Stabilizer', min: 0, max: 1, step: 0.01 },
      { key: 'postSmooth', label: 'Post-correct', min: 0, max: 1, step: 0.01 },
    ],
    toggles: [
      { key: 'pulledString', label: 'Pulled string (lazy)' },
      { key: 'antiAlias', label: 'Soft edges (anti-alias). Off = hard pixels, fills lock tight' },
    ],
  },
];

const DYN_LABEL: Record<DynKey, string> = { sizeDyn: 'Size', opacityDyn: 'Opacity', flowDyn: 'Flow' };
const CONTROLS: Control[] = ['off', 'pressure', 'tilt', 'speed'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmt(v: number, step: number, unit = ''): string {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return `${v.toFixed(d)}${unit}`;
}

/** The brush tuning panel: every setting as a live slider, with a stroke preview. */
export function buildPanel(app: App, root: HTMLElement): void {
  const preview = el('canvas', { class: 'preview', width: '560', height: '150' });
  const previewEngine = new RasterEngine(560, 150);

  const head = el('div', { class: 'panel-head' });
  const presetSel = el('select', { 'aria-label': 'Brush preset' });
  PRESETS.forEach((p, i) => presetSel.append(el('option', { value: String(i) }, p.name)));
  presetSel.addEventListener('change', () => {
    const p = PRESETS[Number(presetSel.value)];
    if (p) app.setBrush(cloneBrush(p));
  });
  const color = el('input', { type: 'color', 'aria-label': 'Color', value: app.color });
  color.addEventListener('input', () => {
    app.setColor(color.value);
    drawPreview();
  });
  const copy = el('button', { type: 'button', title: 'Copy brush JSON' }, 'Copy JSON');
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(JSON.stringify(app.brush, null, 2));
    copy.textContent = 'Copied';
    setTimeout(() => (copy.textContent = 'Copy JSON'), 1200);
  });
  head.append(presetSel, color, copy);

  const body = el('div', { class: 'panel-body' });
  const refreshers: (() => void)[] = [];

  for (const section of SECTIONS) {
    const fs = el('fieldset');
    fs.append(el('legend', {}, section.title));
    for (const def of section.sliders) {
      const row = el('label', { class: 'row' });
      const name = el('span', { class: 'name' }, def.label);
      const input = el('input', { type: 'range', min: String(def.min), max: String(def.max), step: String(def.step) });
      const out = el('output');
      const sync = () => {
        input.value = String(app.brush[def.key] ?? 0);
        out.textContent = fmt(app.brush[def.key] ?? 0, def.step, def.unit);
      };
      input.addEventListener('input', () => {
        (app.brush[def.key] as number) = Number(input.value);
        out.textContent = fmt(app.brush[def.key] ?? 0, def.step, def.unit);
        app.brushChanged();
      });
      refreshers.push(sync);
      row.append(name, input, out);
      fs.append(row);
    }
    for (const t of section.toggles ?? []) {
      const row = el('label', { class: 'row toggle' });
      const input = el('input', { type: 'checkbox' });
      input.addEventListener('change', () => {
        app.brush[t.key] = input.checked;
        app.brushChanged();
      });
      // anti-aliasing is on unless a brush turns it off
      refreshers.push(() => (input.checked = t.key === 'antiAlias' ? app.brush.antiAlias !== false : !!app.brush[t.key]));
      row.append(input, el('span', {}, t.label));
      fs.append(row);
    }
    for (const key of section.dyn ?? []) fs.append(dynamicEditor(app, key, refreshers));
    if (section.tilt) fs.append(tiltEditor(app, refreshers));
    body.append(fs);
  }

  // drawing assist: QuickShape
  {
    const fs = el('fieldset');
    fs.append(el('legend', {}, 'Assist'));
    const row = el('label', {
      class: 'row toggle',
      title:
        'Hold the pen still at the end of a stroke: it snaps to a line, arc, ellipse, rectangle or polygon. Keep holding and move to resize and turn it; touch a second finger (or hold Shift) for a perfect circle, square or 15° angle.',
    });
    const input = el('input', { type: 'checkbox' });
    input.addEventListener('change', () => app.setQuickShape(input.checked));
    refreshers.push(() => (input.checked = app.quickShape));
    row.append(input, el('span', {}, 'QuickShape: hold at the end of a stroke to snap it to a shape'));
    fs.append(row);
    body.append(fs);
  }

  body.prepend(fillEditor(app));
  root.append(head, preview, body);

  function drawPreview(): void {
    const g = preview.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, preview.width, preview.height);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, preview.width, preview.height);
    const pts: StrokePoint[] = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push({
        x: 40 + t * 480,
        y: 75 + Math.sin(t * Math.PI * 2) * 38,
        pressure: Math.sin(t * Math.PI),
        // Starts lying flat (side-of-pencil shading) and ends upright.
        tiltX: 80 * Math.max(0, 1 - t * 1.6),
        tiltY: 0,
        t: i * (6 + 10 * t),
      });
    }
    const rec: StrokeRecord = { id: 'preview', tool: app.tool, brush: app.brush, color: app.color, seed: 42, points: pts };
    const len = strokeLength(pts);
    if (app.tool === 'pen') {
      drawVectorStroke(g, rec, len);
      return;
    }
    const shown: StrokeRecord = { ...rec, tool: 'brush', color: app.tool === 'eraser' ? '#888888' : app.color };
    previewEngine.begin(shown);
    previewEngine.addDabs(dabsForStroke(app.brush, 42, pts, len));
    g.drawImage(previewEngine.displaySource(), 0, 0);
    previewEngine.cancel();
  }

  const refresh = () => {
    for (const r of refreshers) r();
    const idx = PRESETS.findIndex((p) => p.name === app.brush.name);
    presetSel.value = String(Math.max(0, idx));
    drawPreview();
  };
  const prevBrush = app.onBrushChange;
  app.onBrushChange = () => {
    prevBrush();
    refresh();
    app.requestRender();
  };
  app.onToolChange = (() => {
    const prev = app.onToolChange;
    return () => {
      prev();
      drawPreview();
    };
  })();
  refresh();
}

function fillEditor(app: App): HTMLElement {
  const fs = el('fieldset');
  fs.append(el('legend', {}, 'Fill (G)'));
  const defs: { prop: 'gap' | 'under' | 'threshold'; label: string; min: number; max: number; step: number; unit: string; hint: string }[] = [
    { prop: 'gap', label: 'Close gaps', min: 0, max: 24, step: 1, unit: 'px', hint: 'Gaps in the line smaller than this do not leak.' },
    { prop: 'under', label: 'Under line', min: 0, max: 8, step: 1, unit: 'px', hint: 'How far the fill tucks under the line (no white halo).' },
    { prop: 'threshold', label: 'Line edge', min: 2, max: 200, step: 1, unit: '', hint: 'Line alpha that counts as line. Lower = soft edges block the fill too.' },
  ];
  for (const d of defs) {
    const row = el('label', { class: 'row', title: d.hint });
    const input = el('input', { type: 'range', min: String(d.min), max: String(d.max), step: String(d.step) });
    const out = el('output');
    input.value = String(app.fillOptions[d.prop]);
    out.textContent = fmt(app.fillOptions[d.prop], d.step, d.unit);
    input.addEventListener('input', () => {
      app.fillOptions[d.prop] = Number(input.value);
      out.textContent = fmt(app.fillOptions[d.prop], d.step, d.unit);
      app.fillOptionsChanged();
    });
    row.append(el('span', { class: 'name' }, d.label), input, out);
    fs.append(row);
  }
  // how the tool works, and how many following drawings get the same fill
  const modes = el('div', { class: 'row seg', role: 'group', 'aria-label': 'Fill mode' });
  const modeBtns: HTMLButtonElement[] = [];
  for (const [m, label, hint] of [
    ['tap', 'Tap / drag', 'Tap an area, or drag across several to fill each one'],
    ['lasso', 'Lasso', 'Draw a loop: every closed area inside it fills'],
    ['leftover', 'Leftovers', 'Scrub over specks the fill missed (brush size)'],
  ] as const) {
    const b = el('button', { type: 'button', title: hint }, label);
    b.addEventListener('click', () => {
      app.setFillMode(m);
      sync();
    });
    modeBtns.push(b);
    modes.append(b);
  }
  const acrossRow = el('label', { class: 'row', title: 'After a fill, fill the same spot on this many following drawings too (one undo step)' });
  const across = el('input', { type: 'range', min: '0', max: '12', step: '1' });
  const acrossOut = el('output');
  across.addEventListener('input', () => {
    app.setFillAcross(Number(across.value));
    sync();
  });
  acrossRow.append(el('span', { class: 'name' }, 'Next drawings'), across, acrossOut);
  const sync = () => {
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['tap', 'lasso', 'leftover'][i] === app.fillMode)));
    across.value = String(app.fillAcross);
    acrossOut.textContent = app.fillAcross ? `+${app.fillAcross}` : 'off';
  };
  const referRow = el('label', { class: 'row toggle', title: 'Fill stops at the lines on your other visible layers too: ink on one layer, colour on another' });
  const refer = el('input', { type: 'checkbox' });
  refer.addEventListener('change', () => app.setFillRefer(refer.checked));
  referRow.append(refer, el('span', {}, 'Use lines from other layers'));
  const syncAll = () => {
    sync();
    refer.checked = app.fillRefer;
  };
  syncAll();
  fs.insertBefore(referRow, fs.children[1] ?? null);
  fs.insertBefore(acrossRow, fs.children[1] ?? null);
  fs.insertBefore(modes, acrossRow);
  fs.append(el('p', { class: 'hint' }, 'Reads the Line plane and vector strokes; paints the Fill plane under them. Shift+G switches Tap / Lasso / Leftovers.'));
  return fs;
}

function tiltEditor(app: App, refreshers: (() => void)[]): HTMLElement {
  const wrap = el('div', { class: 'tilt' });
  const on = el('label', { class: 'row toggle' });
  const box = el('input', { type: 'checkbox' });
  on.append(box, el('span', {}, 'Shade with the side (tilt)'));
  box.addEventListener('change', () => {
    app.brush.tiltShade.enabled = box.checked;
    app.brushChanged();
  });
  wrap.append(on);
  const defs: { prop: Exclude<keyof TiltShade, 'enabled'>; label: string; min: number; max: number; step: number; unit?: string }[] = [
    { prop: 'threshold', label: 'Starts at', min: 10, max: 75, step: 1, unit: '°' },
    { prop: 'size', label: 'Size ×', min: 1, max: 8, step: 0.1 },
    { prop: 'opacity', label: 'Opacity ×', min: 0.05, max: 1, step: 0.01 },
    { prop: 'roundness', label: 'Flatness', min: 0.05, max: 1, step: 0.01 },
    { prop: 'hardness', label: 'Hardness', min: 0, max: 1, step: 0.01 },
    { prop: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01 },
  ];
  const syncs: (() => void)[] = [];
  for (const d of defs) {
    const row = el('label', { class: 'row' });
    const input = el('input', { type: 'range', min: String(d.min), max: String(d.max), step: String(d.step) });
    const out = el('output');
    input.addEventListener('input', () => {
      app.brush.tiltShade[d.prop] = Number(input.value);
      out.textContent = fmt(app.brush.tiltShade[d.prop], d.step, d.unit);
      app.brushChanged();
    });
    syncs.push(() => {
      input.value = String(app.brush.tiltShade[d.prop]);
      out.textContent = fmt(app.brush.tiltShade[d.prop], d.step, d.unit);
    });
    row.append(el('span', { class: 'name' }, d.label), input, out);
    wrap.append(row);
  }
  wrap.append(el('p', { class: 'hint' }, 'Tilt a pen past "Starts at", or hold Alt with a mouse.'));
  refreshers.push(() => {
    box.checked = app.brush.tiltShade.enabled;
    for (const s of syncs) s();
  });
  return wrap;
}

function dynamicEditor(app: App, key: DynKey, refreshers: (() => void)[]): HTMLElement {
  const wrap = el('div', { class: 'dyn' });
  const top = el('div', { class: 'row' });
  const name = el('span', { class: 'name' }, DYN_LABEL[key]);
  const sel = el('select', { 'aria-label': `${DYN_LABEL[key]} control` });
  for (const c of CONTROLS) sel.append(el('option', { value: c }, c));
  const inv = el('label', { class: 'mini' });
  const invBox = el('input', { type: 'checkbox' });
  inv.append(invBox, el('span', {}, 'invert'));
  top.append(name, sel, inv);
  wrap.append(top);

  const get = (): Dynamic => app.brush[key];
  sel.addEventListener('change', () => {
    get().control = sel.value as Control;
    app.brushChanged();
  });
  invBox.addEventListener('change', () => {
    get().invert = invBox.checked;
    app.brushChanged();
  });

  const sliders: { prop: 'min' | 'curve' | 'jitter'; label: string; min: number; max: number; step: number }[] = [
    { prop: 'min', label: 'min', min: 0, max: 1, step: 0.01 },
    { prop: 'curve', label: 'curve', min: 0.3, max: 3, step: 0.05 },
    { prop: 'jitter', label: 'jitter', min: 0, max: 1, step: 0.01 },
  ];
  const syncs: (() => void)[] = [];
  for (const s of sliders) {
    const row = el('label', { class: 'row sub' });
    const input = el('input', { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step) });
    const out = el('output');
    input.addEventListener('input', () => {
      get()[s.prop] = Number(input.value);
      out.textContent = fmt(get()[s.prop], s.step);
      app.brushChanged();
    });
    syncs.push(() => {
      input.value = String(get()[s.prop]);
      out.textContent = fmt(get()[s.prop], s.step);
    });
    row.append(el('span', { class: 'name' }, s.label), input, out);
    wrap.append(row);
  }
  refreshers.push(() => {
    sel.value = get().control;
    invBox.checked = get().invert;
    for (const s of syncs) s();
  });
  return wrap;
}
