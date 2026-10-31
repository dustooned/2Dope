import type { App } from '../app';
import { defaultPenPrefs, diagnosePen, ERASER_BUTTONS, mapPressure, platformOf, readPenPrefs, type PenPrefs } from '../core/pen';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) => {
  const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e;
};

/**
 * App settings → Pen and tablet: a test pad that shows what the pen reports, tips for the tablet
 * driver, and this device's pressure curve, tilt, eraser end and side button. The draft applies
 * with Apply settings; the pad previews it at once.
 */
export function penSettingsSection(app: App): { section: HTMLDetailsElement; read: () => PenPrefs } {
  const section = el('details', 'student-settings-section pen-settings');
  section.append(el('summary', '', 'Pen and tablet'), el('p', 'menu-note', 'Draw on the pad with your pen (Wacom, Huion, XP-Pen, Apple Pencil or another). 2Dope checks what it reports; browsers do not say which tablet it is. These settings apply to this browser/device and to every brush.'));
  const navi = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = platformOf(navigator.userAgent, navi.userAgentData?.platform ?? navigator.platform, navigator.maxTouchPoints);

  const padWrap = el('div', 'pen-pad-wrap');
  const pad = el('canvas', 'pen-pad'); pad.setAttribute('aria-label', 'Pen test pad');
  const curve = el('canvas', 'pen-curve'); curve.setAttribute('aria-label', 'Pressure curve'); curve.setAttribute('role', 'img');
  padWrap.append(pad, curve);
  const live = el('p', 'pen-live', 'Draw on the pad.'); live.setAttribute('aria-live', 'off');
  const summary = el('p', 'pen-summary'); summary.setAttribute('role', 'status');
  const tips = el('ul', 'pen-tips');
  section.append(padWrap, live, summary, tips);

  const slider = (label: string, min: number, max: number, hint: string) => {
    const row = el('label', 'app-settings-field pen-slider'), input = el('input'), out = el('output');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '1'; input.setAttribute('aria-label', label);
    row.append(el('span', '', label), input, out); row.title = hint; return { row, input, out };
  };
  const firm = slider('Pressure feel', -100, 100, 'Soft: full strength with a light hand. Firm: needs a heavier hand.');
  const threshold = slider('Ignore below', 0, 40, 'Pressure lighter than this counts as the lightest touch.');
  const full = slider('Full strength at', 20, 100, 'Pressure that already gives full size and opacity.');
  const check = (text: string) => { const row = el('label', 'app-settings-check'), input = el('input'); input.type = 'checkbox'; input.setAttribute('aria-label', text); row.append(input, document.createTextNode(text)); return { row, input }; };
  const tilt = check('Use pen tilt'), eraserEnd = check('Eraser end picks the Eraser');
  const barrelRow = el('label', 'app-settings-field'), barrel = el('select'); barrel.setAttribute('aria-label', 'Pen side button');
  for (const [v, t] of [['menu', 'Opens the canvas menu'], ['pan', 'Moves the page (hold and drag)'], ['zoom', 'Zooms (hold and drag up or down)'], ['eraser', 'Erases while held']]) { const o = el('option', '', t); o.value = v!; barrel.append(o); }
  barrelRow.append(el('span', '', 'Side button'), barrel);
  const actions = el('div', 'student-profile-actions');
  const fromPad = el('button', '', 'Set from my test strokes'), clear = el('button', '', 'Clear pad'), reset = el('button', '', 'Restore pen defaults');
  for (const b of [fromPad, clear, reset]) b.type = 'button';
  fromPad.title = 'Full strength at your strongest stroke on the pad';
  actions.append(fromPad, clear, reset);
  section.append(firm.row, threshold.row, full.row, tilt.row, eraserEnd.row, barrelRow, actions,
    el('p', 'menu-note', 'Turning the pen over to its eraser end switches to the Eraser; the tip brings back your tool. A tablet button set to Erase in the driver works the same way; one set to zoom with Ctrl + and Ctrl − zooms the canvas. Tilt off helps when a driver reports a tilt that never changes. Each brush’s own pressure settings still apply on top of these.'));

  const read = (): PenPrefs => readPenPrefs({
    version: 1, firmness: Number(firm.input.value) / 100, threshold: Number(threshold.input.value) / 100, full: Number(full.input.value) / 100,
    tilt: tilt.input.checked, eraserEnd: eraserEnd.input.checked, barrel: barrel.value,
  });
  const fill = (p: PenPrefs) => {
    firm.input.value = String(Math.round(p.firmness * 100)); threshold.input.value = String(Math.round(p.threshold * 100)); full.input.value = String(Math.round(p.full * 100));
    tilt.input.checked = p.tilt; eraserEnd.input.checked = p.eraserEnd; barrel.value = p.barrel; outputs();
  };
  const outputs = () => {
    const f = Number(firm.input.value);
    firm.out.textContent = f < -10 ? 'Soft' : f > 10 ? 'Firm' : 'Even';
    threshold.out.textContent = `${threshold.input.value}%`; full.out.textContent = `${full.input.value}%`;
    drawCurve();
  };

  let rawNow = -1;
  const drawCurve = () => {
    const g = sized(curve); if (!g) return;
    const w = curve.clientWidth, h = curve.clientHeight, p = read(), ink = getComputedStyle(curve).color;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = 0.3; g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(0, h); g.lineTo(w, 0); g.stroke();
    g.globalAlpha = 1; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 40; i++) { const x = i / 40, y = mapPressure(x, p); if (i) g.lineTo(x * w, h - y * h); else g.moveTo(0, h - y * h); }
    g.stroke();
    if (rawNow >= 0) { g.fillStyle = getComputedStyle(pad).getPropertyValue('--accent').trim() || ink; g.beginPath(); g.arc(rawNow * w, h - mapPressure(rawNow, p) * h, 4, 0, Math.PI * 2); g.fill(); }
  };
  const diagnose = () => {
    const d = diagnosePen(app.penProbe.caps(), platform);
    summary.textContent = d.summary;
    tips.replaceChildren(...d.tips.map((t) => el('li', '', t)));
  };

  // the pad draws with the draft curve, so a change shows on the next stroke
  let down: { id: number; x: number; y: number; t0: number; n: number } | null = null, padMax = 0;
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch { /* still draws */ }
    const r = pad.getBoundingClientRect();
    down = { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, t0: e.timeStamp, n: 0 };
    app.penProbe.observe(sample(e));
  });
  pad.addEventListener('pointermove', (e) => {
    app.penProbe.observe(sample(e));
    if (!down || e.pointerId !== down.id) { if (e.pointerType === 'pen') live.textContent = `pen hovering · tilt ${Math.round(Math.hypot(e.tiltX || 0, e.tiltY || 0))}°`; return; }
    const g = sized(pad, true); if (!g) return;
    const r = pad.getBoundingClientRect(), p = read(), list = e.getCoalescedEvents?.() ?? [];
    g.strokeStyle = getComputedStyle(pad).color; g.lineCap = 'round';
    g.globalCompositeOperation = e.buttons & ERASER_BUTTONS ? 'destination-out' : 'source-over';
    let raw = e.pressure;
    for (const ev of list.length ? list : [e]) {
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      raw = ev.pointerType === 'mouse' ? 1 : ev.pressure;
      const v = ev.pointerType === 'pen' ? mapPressure(raw, p) : raw;
      if (ev.pointerType === 'pen') padMax = Math.max(padMax, raw);
      g.lineWidth = 1 + 17 * v * (ev.buttons & ERASER_BUTTONS ? 2 : 1);
      g.beginPath(); g.moveTo(down.x, down.y); g.lineTo(x, y); g.stroke();
      down.x = x; down.y = y; down.n++;
    }
    const secs = (e.timeStamp - down.t0) / 1000;
    const tiltDeg = p.tilt ? Math.round(Math.hypot(e.tiltX || 0, e.tiltY || 0)) : 0;
    rawNow = e.pointerType === 'pen' ? raw : -1;
    live.textContent = `${e.pointerType}${e.buttons & ERASER_BUTTONS ? ' (eraser end)' : ''} · pressure ${raw.toFixed(3)}${e.pointerType === 'pen' ? ` → ${mapPressure(raw, p).toFixed(2)}` : ''} · tilt ${tiltDeg}°${e.twist ? ` · twist ${e.twist}°` : ''}${secs > 0.25 ? ` · ${Math.round(down.n / secs)} Hz` : ''}`;
    drawCurve();
  });
  const up = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    down = null; app.penProbe.observe(sample(e)); app.penProbe.endStroke(); diagnose();
  };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());

  for (const s of [firm, threshold, full]) s.input.addEventListener('input', outputs);
  fromPad.addEventListener('click', () => {
    if (padMax < 0.05) { summary.textContent = 'Draw a few strokes on the pad with your pen first, as firmly as you usually draw.'; return; }
    full.input.value = String(Math.max(20, Math.min(100, Math.round(padMax * 100))));
    if (Number(threshold.input.value) > Number(full.input.value) - 5) threshold.input.value = String(Math.max(0, Number(full.input.value) - 5));
    outputs(); summary.textContent = `Full strength at ${full.input.value}%, your strongest stroke. Apply settings to keep it.`;
  });
  clear.addEventListener('click', () => { const g = sized(pad); g?.clearRect(0, 0, pad.width, pad.height); padMax = 0; rawNow = -1; drawCurve(); });
  reset.addEventListener('click', () => fill(defaultPenPrefs()));
  section.addEventListener('toggle', () => { if (section.open) { sized(pad); fill(read()); diagnose(); } });

  fill(app.penPrefs); diagnose();
  return { section, read };
}

function sample(e: PointerEvent) {
  return { type: e.pointerType, pressure: e.pressure, tiltX: e.tiltX || 0, tiltY: e.tiltY || 0, twist: e.twist || 0, buttons: e.buttons };
}

/** The canvas's 2D context in CSS pixels, its backing store matched to its size (cleared when that changes). */
function sized(c: HTMLCanvasElement, keep = false): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (!w || !h) return null;
  const g = c.getContext('2d'); if (!g) return null;
  if (c.width !== w || c.height !== h || !keep) {
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return g;
}
