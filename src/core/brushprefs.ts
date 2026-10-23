import type { BrushSettings } from './brush';

/** Device-only shortcuts and working size/opacity, separate from saved brush definitions. */
export const BRUSH_PREFS_KEY = '2dope.brushes.preferences';
export const RECENT_BRUSHES = 5;
const MAX_BRUSHES = 610; // 600 personal brushes plus built-ins
interface BrushMemory { name: string; size: number; opacity: number }
export interface BrushPreferences {
  version: 1;
  memory: BrushMemory[];
  favorites: string[];
  recent: string[];
}

function names(value: unknown, max: number): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((n): n is string => typeof n === 'string' && n.length > 0 && n.length <= 200))].slice(0, max) : [];
}

export function readBrushPreferences(value: unknown): BrushPreferences {
  const empty: BrushPreferences = { version: 1, memory: [], favorites: [], recent: [] };
  if (!value || typeof value !== 'object') return empty;
  const v = value as Partial<BrushPreferences>;
  if (v.version !== 1) return empty;
  const memory: BrushMemory[] = [];
  if (Array.isArray(v.memory)) for (const m of v.memory) {
    if (!m || typeof m.name !== 'string' || !m.name || m.name.length > 200 || memory.some(x => x.name === m.name)) continue;
    if (!Number.isFinite(m.size) || m.size < 1 || m.size > 500 || !Number.isFinite(m.opacity) || m.opacity < 0 || m.opacity > 1) continue;
    memory.push({ name: m.name, size: m.size, opacity: m.opacity });
    if (memory.length === MAX_BRUSHES) break;
  }
  return { version: 1, memory, favorites: names(v.favorites, MAX_BRUSHES), recent: names(v.recent, RECENT_BRUSHES) };
}

export function rememberBrush(p: BrushPreferences, b: BrushSettings): BrushPreferences {
  if (!b.name || b.name.length > 200 || !Number.isFinite(b.size) || !Number.isFinite(b.opacity)) return p;
  const m = { name: b.name, size: Math.max(1, Math.min(500, b.size)), opacity: Math.max(0, Math.min(1, b.opacity)) };
  return { ...p, memory: [m, ...p.memory.filter(x => x.name !== b.name)].slice(0, MAX_BRUSHES) };
}

/** Only size and opacity follow a brush; Studio/save/import supply all other settings. */
export function recalledBrush(p: BrushPreferences, b: BrushSettings): BrushSettings {
  const m = p.memory.find(x => x.name === b.name);
  return m ? { ...b, size: m.size, opacity: m.opacity } : b;
}

export function usedBrush(p: BrushPreferences, name: string): BrushPreferences {
  return { ...p, recent: names([name, ...p.recent], RECENT_BRUSHES) };
}

export function favoriteBrush(p: BrushPreferences, name: string): BrushPreferences {
  return { ...p, favorites: p.favorites.includes(name) ? p.favorites.filter(n => n !== name) : names([...p.favorites, name], MAX_BRUSHES) };
}

export function forgetBrush(p: BrushPreferences, name: string): BrushPreferences {
  return { ...p, memory: p.memory.filter(m => m.name !== name), favorites: p.favorites.filter(n => n !== name), recent: p.recent.filter(n => n !== name) };
}

export function renameBrush(p: BrushPreferences, from: string, to: string): BrushPreferences {
  if (from === to) return p;
  const clean = forgetBrush(p, to);
  return { ...clean, memory: clean.memory.map(m => m.name === from ? { ...m, name: to } : m), favorites: clean.favorites.map(n => n === from ? to : n), recent: clean.recent.map(n => n === from ? to : n) };
}
