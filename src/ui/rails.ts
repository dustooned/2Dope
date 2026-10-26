import type { App } from '../app';
import { layerEnd, type Comp, type Layer } from '../core/comp';
import type { Drawing } from '../core/project';
import { decorate } from './icons';
import { assetLabel } from '../core/assetlabels';
import { attachContextMenu } from './contextmenu';
import { askText, confirmBox } from './dialogs';

/**
 * Draw's rails (Procreate Dreams style): every layer of the shot as a row on one timeline, in
 * stacking order (front on top), on the same clock and zoom as the frame bar. The layer you draw
 * on is the big, editable row (the strip's own blocks); the others are slim rows you tap to draw
 * on them. Each layer folds open to show its LINE and FILL sublayers; groups (precomps) fold open
 * to show the layers inside. Folding only hides rows: visibility and playback are separate.
 */

const LABELS = ['#9a9aa8', '#ff5a8a', '#ffd24a', '#4aa3ff', '#4ade80', '#c084fc', '#fb923c'];
export const RAIL_H = 30;
/** The editable row: a 22 px header for its name tag, then the frame blocks (52 px). */
export const ACTIVE_H = 80;
export const PART_H = 22;

const OPEN_KEY = '2dope.rails.open';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Which rows are folded open (layer ids for groups, `id#parts` for Line / Fill). Remembered per device. */
export class RailState {
  readonly open: Set<string>;
  onChange: () => void = () => {};
  constructor() {
    let keys: string[] = [];
    try {
      keys = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[];
    } catch {
      // nothing remembered
    }
    this.open = new Set(Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : []);
  }
  toggle(key: string, on = !this.open.has(key)): void {
    if (on) this.open.add(key);
    else this.open.delete(key);
    this.save();
  }
  setAll(keys: string[], on: boolean): void {
    if (on) for (const k of keys) this.open.add(k);
    else this.open.clear();
    this.save();
  }
  private save(): void {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...this.open].slice(0, 400)));
    } catch {
      // not remembered: fine
    }
    this.onChange();
  }
}

/** Both layer views fold the same hierarchy; this is view state, never document history. */
export const drawRailState = new RailState();

type Row =
  | { kind: 'layer'; layer: Layer; depth: number; active: boolean; offset: number; foldable: boolean }
  | { kind: 'part'; layer: Layer; part: 'line' | 'fill'; offset: number; active: boolean }
  /** The folded rest of the layers (or, when open, the row that folds them away again). */
  | { kind: 'more'; count: number; open: boolean };

/** RailState key: every layer shows (otherwise only the layer you draw on, its linked layers and the board). */
export const ALL_ROWS = '#all';

/** Every key that can fold open in this comp (for Expand all). */
export function foldKeys(app: App): string[] {
  const keys: string[] = [];
  const walk = (c: Comp, depth: number) => {
    for (const l of c.layers) {
      if (l.kind === 'drawings') keys.push(`${l.id}#parts`);
      if (l.kind === 'comp' && depth < 3) {
        keys.push(l.id);
        const inner = app.project.comps.get(l.comp);
        if (inner) walk(inner, depth + 1);
      }
    }
  };
  walk(app.project.comp, 0);
  return keys;
}

function rowsOf(app: App, state: RailState): Row[] {
  const rows: Row[] = [];
  const active = app.project.isPlaceholder ? '' : app.project.activeLayer;
  const walk = (c: Comp, depth: number, offset: number) => {
    for (const l of c.layers) {
      // cameras and nulls are Motion's business
      if (l.kind === 'camera' || l.kind === 'null') continue;
      const isActive = depth === 0 && l.id === active;
      rows.push({ kind: 'layer', layer: l, depth, active: isActive, offset, foldable: l.kind === 'comp' || (l.kind === 'drawings' && !l.guide) });
      if (l.kind === 'drawings' && !l.guide && state.open.has(`${l.id}#parts`)) {
        for (const part of ['line', 'fill'] as const) rows.push({ kind: 'part', layer: l, part, offset, active: isActive });
      }
      if (l.kind === 'comp' && depth < 3 && state.open.has(l.id)) {
        const inner = app.project.comps.get(l.comp);
        if (inner) walk(inner, depth + 1, offset + l.start);
      }
    }
  };
  walk(app.project.comp, 0, 0);
  // a brand-new comp with nothing yet: the strip's placeholder row
  if (!rows.some((r) => r.kind === 'layer' && r.active)) rows.unshift({ kind: 'layer', layer: app.project.layer, depth: 0, active: true, offset: 0, foldable: false });
  // Focus: the layer you draw on, its linked art layers and the board; the rest folds into one row
  const me = app.project.isPlaceholder ? null : app.project.layer;
  const cel = me && me.kind === 'drawings' ? me.cel : undefined;
  const keep = (l: Layer) => l.id === me?.id || (!!cel && l.kind === 'drawings' && l.cel === cel) || (l.kind === 'drawings' && !!l.guide) || (app.workspace === 'animate' && l.kind === 'comp' && app.project.comps.get(l.comp)?.asset === true);
  const top = rows.filter((r) => r.kind === 'layer' && r.depth === 0) as Extract<Row, { kind: 'layer' }>[];
  const hidden = top.filter((r) => !keep(r.layer)).length;
  if (!hidden) return rows;
  if (state.open.has(ALL_ROWS)) return [...rows, { kind: 'more', count: hidden, open: true }];
  // a kept layer brings its own Line / Fill and group children along
  let keeping = false;
  const out: Row[] = [];
  for (const r of rows) {
    if (r.kind === 'layer' && r.depth === 0) keeping = keep(r.layer);
    if (keeping) out.push(r);
  }
  return [...out, { kind: 'more', count: hidden, open: false }];
}

export interface RailsOut {
  nodes: HTMLElement[];
  /** Where the editable row's blocks go (px from the top of the timeline). */
  activeTop: number;
  height: number;
}

/**
 * Build the rail rows. `x0` is the comp frame at the left edge (the active layer's start), so
 * every row lines up with the editable blocks. `thumb` gives a small preview canvas.
 */
/** Extra rows under the layers (the tracks sheet sounds). */
export type ExtraRows = (top: number, x0: number, cell: number, width: number) => { nodes: HTMLElement[]; height: number };

export function buildRails(app: App, state: RailState, cell: number, top: number, x0: number, width: number, thumb: (d: Drawing) => HTMLCanvasElement, changed: () => void, extra?: ExtraRows): RailsOut {
  const rows = rowsOf(app, state);
  const nodes: HTMLElement[] = [];
  let y = top;
  let activeTop = top;
  const ed = app.editor;
  for (const r of rows) {
    if (r.kind === 'more') {
      // one quiet row: how many layers are folded away, tap to show or fold them
      const row = el('div', { class: 'rail more' });
      row.style.top = `${y}px`;
      row.style.height = `${RAIL_H}px`;
      row.style.width = `${width}px`;
      const b = el('button', { type: 'button', class: 'rail-name rail-more', 'aria-expanded': String(r.open), title: r.open ? 'Show only the layer you draw on, its linked layers and the board' : 'Show every layer of the shot' }, r.open ? '▾ Fewer layers' : `▸ ${r.count} more layer${r.count === 1 ? '' : 's'}`);
      b.addEventListener('click', () => {
        state.toggle(ALL_ROWS);
        changed();
      });
      const tag = el('div', { class: 'rail-tag' });
      tag.append(b);
      row.append(tag);
      nodes.push(row);
      y += RAIL_H;
      continue;
    }
    const l = r.layer;
    const asset = r.kind === 'layer' && r.depth === 0 && app.workspace === 'animate' && l.kind === 'comp' && app.project.comps.get(l.comp)?.asset === true;
    const identity = asset && l.kind === 'comp' ? assetLabel(app.project,app.project.comp,l) : null;
    const h = r.kind === 'part' ? PART_H : r.active ? ACTIVE_H : asset ? 78 : RAIL_H;
    const row = el('div', { class: `rail${asset ? ' asset-row' : ''}${r.active ? ' active' : ''}${r.kind === 'part' ? ' part' : ''}${l.visible ? '' : ' off'}` });
    row.style.top = `${y}px`;
    row.style.height = `${h}px`;
    row.style.width = `${width}px`;
    row.style.setProperty('--label', LABELS[l.label] ?? LABELS[0]!);
    if (r.active && r.kind === 'layer') activeTop = y;

    // the sticky name tag at the left: fold, eye, lock, name
    const tag = el('div', { class: 'rail-tag' });
    tag.style.marginLeft = `${(r.kind === 'layer' ? r.depth : r.layer ? 1 : 0) * 12}px`;
    if (r.kind === 'layer') {
      if (r.foldable && r.depth === 0) {
        const key = l.kind === 'comp' ? l.id : `${l.id}#parts`;
        const open = state.open.has(key);
        const fold = el(
          'button',
          {
            type: 'button',
            class: 'rail-fold',
            'aria-expanded': String(open),
            title: l.kind === 'comp' ? (open ? 'Hide the layers inside' : 'Show the layers inside') : open ? 'Hide LINE and FILL' : 'Show LINE and FILL',
          },
          open ? '▾' : '▸',
        );
        fold.addEventListener('click', () => {
          state.toggle(key);
          changed();
        });
        tag.append(fold);
      }
      if (r.depth === 0) {
        const eye = el(
          'button',
          { type: 'button', class: 'rail-btn icon-only', 'aria-pressed': String(l.visible), title: l.visible ? 'Hide this layer' : 'Show this layer' },
          l.visible ? 'Hide' : 'Show',
        );
        decorate(eye, 'eye');
        eye.addEventListener('click', () => ed.setFlag(l.id, 'visible', !l.visible));
        tag.append(eye);
        if (l.locked) {
          const lock = el('button', { type: 'button', class: 'rail-btn icon-only', 'aria-pressed': 'true', title: 'Locked: tap to unlock' }, 'Unlock');
          decorate(lock, 'lock');
          lock.addEventListener('click', () => ed.setFlag(l.id, 'locked', false));
          tag.append(lock);
        }
      }
      const kind = identity ? `placement ${identity.number}` : l.kind === 'comp' ? 'group' : l.kind === 'drawings' && l.guide ? 'board' : l.kind === 'drawings' && l.cel ? 'linked' : '';
      const name = el('button', { type: 'button', class: 'rail-name', title: identity ? `${identity.description} Select to move or time this placement.` : r.active ? 'You draw on this layer' : r.depth === 0 && l.kind === 'drawings' ? `Draw on ${l.name}` : r.depth === 0 && l.kind === 'comp' ? `Edit drawings inside ${l.name}` : l.name }, l.name);
      if (kind && kind !== l.name.toLowerCase()) name.append(el('span', { class: 'rail-kind' }, kind));
      if (r.depth === 0 && l.kind === 'drawings' && !r.active) name.addEventListener('click', () => app.pickLayer(l.id));
      if (r.depth === 0 && l.kind === 'comp') name.addEventListener('click', () => { if (!app.strokeActive) { if (asset) app.setArrangeAssets(true,l.id); else ed.enter(l.id); } });
      tag.append(name);
      // hold (or right-click) a layer's name: rename or delete it, e.g. a movie or picture you brought in
      if (r.depth === 0 && !identity) {
        name.title += ' · hold or right-click for Rename and Delete';
        attachContextMenu(tag, () => [
          { title: l.name },
          { label: 'Rename…', run: async () => { const n = await askText('Layer name', l.name, 'Rename'); if (n !== null) ed.rename(l.id, n); } },
          { sep: true },
          { label: 'Delete layer', danger: true, run: async () => { if (await confirmBox(`Delete “${l.name}”?`, 'You can undo this.', 'Delete', true)) ed.deleteLayers([l.id]); } },
        ]);
      }
    } else {
      // LINE / FILL sublayer: its own eye (the layer you draw on), and which one brushes paint on
      const vis = l.kind === 'drawings' ? l.parts?.[r.part]?.visible !== false : true;
      const eye = el(
        'button',
        {
          type: 'button',
          class: 'rail-btn icon-only',
          'aria-pressed': String(vis),
          title: r.active ? `${vis ? 'Hide' : 'Show'} ${r.part === 'line' ? 'LINE (ink)' : 'FILL (colour)'}` : 'Draw on this layer to change its parts',
        },
        vis ? 'Hide' : 'Show',
      );
      decorate(eye, 'eye');
      eye.disabled = !r.active;
      eye.addEventListener('click', () => {
        app.togglePart(r.part);
        changed();
      });
      const paint = el(
        'button',
        {
          type: 'button',
          class: `rail-name part-name${r.active && app.plane === r.part ? ' paint' : ''}`,
          title: r.active ? `Paint on ${r.part === 'line' ? 'LINE: your ink' : 'FILL: colour under the ink'}` : '',
        },
        r.part === 'line' ? 'LINE' : 'FILL',
      );
      if (r.active) paint.addEventListener('click', () => app.setPlane(r.part));
      tag.append(eye, paint);
    }
    row.append(tag);

    // the row's own bars (the editable row's blocks are the strip's own)
    if (!(r.active && r.kind === 'layer')) {
      const start = r.offset + l.start;
      if (l.kind === 'drawings') {
        let at = start;
        for (const e of l.exposures) {
          const x = (at - x0) * cell;
          const w = e.length * cell;
          at += e.length;
          if (x + w < 0) continue;
          const b = el('div', { class: 'rblock' });
          b.style.left = `${x}px`;
          b.style.width = `${Math.max(2, w - 3)}px`;
          const d = app.project.drawings.get(e.drawing);
          if (d && r.kind === 'layer' && w >= 34) b.append(thumb(d));
          b.addEventListener('click', () => {
            if (r.kind === 'layer' && r.depth === 0 && l.kind === 'drawings' && !r.active) app.pickLayer(l.id);
          });
          row.append(b);
        }
      } else if (l.kind === 'comp') {
        const naturalEnd = layerEnd(l,app.project.comps,app.project.comp.fps);
        const out = asset ? Math.min(app.compEnd,Number.isFinite(naturalEnd) ? naturalEnd : app.compEnd) : l.out ?? l.in + 9999;
        const x = (l.in + r.offset - x0) * cell;
        const selected = app.placedAsset?.id === l.id;
        const b = el('div', { class: `rblock group${asset ? ` asset${selected ? ' selected' : ''}` : ''}` });
        if (asset) {
          const body = el('button', {type:'button',class:'asset-clip-body','aria-label':`Move clip ${l.name}`,'aria-pressed':String(selected),title:`${identity!.description} Frames ${l.in+1}–${out}. Preview: source frame 1. Drag to move this placement.`, 'data-asset-id':l.id,'data-asset-gesture':'move'});
          body.append(el('span',{class:'asset-clip-art','data-asset-source':l.comp,'aria-hidden':'true'}),el('span',{class:'asset-clip-caption'},`${l.name} · ${Math.max(0,out-l.in)}f`));
          body.addEventListener('click', () => { if (!app.strokeActive) app.setArrangeAssets(true,l.id); });
          b.append(body);
          if (selected) for (const [edge,label] of [['in','start'],['out','end']] as const) {
            const handle = el('button',{type:'button',class:`asset-clip-edge ${edge}`,'aria-label':`Trim ${l.name} ${label}`,'data-asset-id':l.id,'data-asset-gesture':edge,title:`Drag to trim ${label}; use Timing for exact frame numbers.`});
            handle.append(el('span',{'aria-hidden':'true'},'⋮')); b.append(handle);
          }
        }
        b.style.left = `${Math.max(0, x)}px`;
        b.style.width = `${Math.max(4, Math.min(width, (out - l.in) * cell) - 3)}px`;
        row.append(b);
      }
    }
    nodes.push(row);
    y += h;
  }
  if (extra) {
    const more = extra(y, x0, cell, width);
    nodes.push(...more.nodes);
    y += more.height;
  }
  return { nodes, activeTop, height: y };
}
