import { readQuickMenu, type QuickMenuPrefs } from './quickmenu';
import { readWorkspaceLayouts, type WorkspaceLayouts } from './workspacelayout';

export const STUDENT_UI_KEY = '2dope.student.ui';
export const STUDENT_PROFILES_KEY = '2dope.student.profiles';
export const FINGER_PAINT_KEY = '2dope.student.fingerPaint';
export const PROFILE_LIMIT = 20;
export const STUDENT_TOOLS = [
  ['brush', 'Brush'], ['eraser', 'Eraser'], ['pen', 'Vector'], ['smudge', 'Smudge'],
  ['fill', 'Fill'], ['select', 'Selection'], ['adjust', 'Adjustments'], ['color', 'Colour'],
  ['layers', 'Layers'], ['reference', 'Reference'], ['assets', 'Move assets'],
] as const;
export const STUDENT_CONTROLS = [
  ['inkPaint', 'Ink & Paint controls'], ['planes', 'Line / Fill controls'],
  ['symmetry', 'Symmetry controls'], ['guides', 'Drawing guide controls'],
] as const;
export type StudentTool = typeof STUDENT_TOOLS[number][0];
export type StudentControl = typeof STUDENT_CONTROLS[number][0];
export type InterfaceLevel = 'clean' | 'simple' | 'full';
export interface StudentUI { tools: Record<StudentTool, boolean>; controls: Record<StudentControl, boolean> }
export interface StudentSetup {
  ui: StudentUI; level: InterfaceLevel; quickMenu: QuickMenuPrefs;
  workspaces: WorkspaceLayouts;
  rangeGesture: boolean; inkPaint: boolean; quickShape: boolean; fingerPaint: boolean;
}
export interface StudentProfile { id: string; name: string; setup: StudentSetup }
export interface StudentProfiles { version: 1; active: string | null; profiles: StudentProfile[] }
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function readStudentUI(value: unknown): StudentUI {
  const v = obj(value), tools = obj(v.tools), controls = obj(v.controls);
  return {
    tools: Object.fromEntries(STUDENT_TOOLS.map(([id]) => [id, id === 'brush' || tools[id] !== false])) as StudentUI['tools'],
    controls: Object.fromEntries(STUDENT_CONTROLS.map(([id]) => [id, controls[id] !== false])) as StudentUI['controls'],
  };
}
export function readStudentSetup(value: unknown): StudentSetup {
  const v = obj(value);
  return { ui: readStudentUI(v.ui), workspaces: readWorkspaceLayouts(v.workspaces), level: v.level === 'full' || v.level === 'clean' ? v.level : 'simple',
    quickMenu: readQuickMenu(v.quickMenu), rangeGesture: v.rangeGesture === true, inkPaint: v.inkPaint === true,
    quickShape: v.quickShape !== false, fingerPaint: v.fingerPaint === true };
}
export const profileName = (value: string): string => value.trim().replace(/\s+/g, ' ').slice(0, 40);
export function readStudentProfiles(value: unknown): StudentProfiles {
  const v = obj(value), out: StudentProfiles = { version: 1, active: null, profiles: [] };
  if (v.version !== 1 || !Array.isArray(v.profiles)) return out;
  const ids = new Set<string>(), names = new Set<string>();
  for (const raw of v.profiles.slice(0, PROFILE_LIMIT)) {
    const p = obj(raw), name = profileName(typeof p.name === 'string' ? p.name : '');
    if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) || !name || ids.has(p.id) || names.has(name.toLowerCase())) continue;
    ids.add(p.id); names.add(name.toLowerCase()); out.profiles.push({ id: p.id, name, setup: readStudentSetup(p.setup) });
  }
  if (typeof v.active === 'string' && ids.has(v.active)) out.active = v.active;
  return out;
}
