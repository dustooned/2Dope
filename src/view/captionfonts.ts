/**
 * Loading caption fonts into the browser: bundled faces from public/fonts, project fonts from their
 * stored bytes. A face loads once; until then captions draw in a fallback face and the canvas
 * redraws when the real one arrives. Exports call `captionFontsReady` first.
 */
import type { Project } from '../core/project';
import { bundledFile, bundledFont, customFontId, familyName, isCustomFont } from '../lettering/fonts';
import type { CaptionSpec } from '../lettering/spec';

const faces = new Map<string, { state: 'loading' | 'ready' | 'failed'; promise: Promise<void> }>();
let redraw: () => void = () => {};
let assetSource: (path: string) => Promise<Uint8Array | null> = async () => null;
let currentProject: () => Project | null = () => null;

/** Set by the app: what redraws the canvas, and where project font bytes come from. */
export function setCaptionFontHooks(h: { redraw: () => void; source: (path: string) => Promise<Uint8Array | null>; project: () => Project | null }): void {
  redraw = h.redraw;
  assetSource = h.source;
  currentProject = h.project;
}

/** The open project (captions read its size and fonts). */
export const captionProject = (): Project | null => currentProject();

const FALLBACK = '"Comic Sans MS", "Chalkboard SE", "Comic Neue", system-ui, sans-serif';

function load(project: Project, font: string, bold: boolean, italic: boolean): Promise<void> {
  const family = familyName(font, bold, italic), have = faces.get(family);
  if (have) return have.promise;
  const entry = { state: 'loading' as 'loading' | 'ready' | 'failed', promise: Promise.resolve() };
  entry.promise = (async () => {
    try {
      let face: FontFace;
      if (isCustomFont(font)) {
        const asset = project.fonts.get(customFontId(font));
        if (!asset) throw new Error('missing font');
        const bytes = asset.bytes ?? (await assetSource(asset.path));
        if (!bytes) throw new Error('missing font bytes');
        face = new FontFace(family, bytes.slice().buffer);
      } else {
        const f = bundledFont(font) ?? bundledFont('comic-neue')!;
        const { file } = bundledFile(f, bold, italic);
        face = new FontFace(family, `url(${import.meta.env.BASE_URL}fonts/${file})`);
      }
      await face.load();
      document.fonts.add(face);
      entry.state = 'ready';
      redraw();
    } catch {
      entry.state = 'failed';
    }
  })();
  faces.set(family, entry);
  return entry.promise;
}

/**
 * The CSS font for a caption at a pixel size: its own face when loaded, otherwise a fallback (and
 * the face starts loading). Synthetic bold and italic apply when a font has no such face.
 */
export function captionFont(c: CaptionSpec, px: number): string {
  const family = familyName(c.font, c.bold, c.italic), have = faces.get(family), project = currentProject();
  if (!have && project) void load(project, c.font, c.bold, c.italic);
  const face = have?.state === 'ready' ? `"${family}", ${FALLBACK}` : FALLBACK;
  return `${c.italic ? 'italic ' : ''}${c.bold ? '700 ' : '400 '}${px.toFixed(2)}px ${face}`;
}

/** Wait until every caption's font in the project has loaded (or failed): exports call this first. */
export async function captionFontsReady(project: Project): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const c of project.comps.values()) for (const l of c.layers) {
    const cap = l.kind === 'drawings' ? l.caption : undefined;
    if (!cap) continue;
    jobs.push(load(project, cap.font, cap.bold, cap.italic));
    // marked-up words use the bold and italic faces too
    const words = [cap.text, ...(cap.links ?? []).map(k => k.text)].join(' ');
    if (words.includes('*')) jobs.push(load(project, cap.font, true, cap.italic), load(project, cap.font, true, true));
    if (words.includes('_')) jobs.push(load(project, cap.font, cap.bold, true), load(project, cap.font, true, true));
  }
  await Promise.all(jobs);
}


/** Is a caption's own face loaded (for layout caches)? */
export function captionFontReady(c: CaptionSpec): boolean { return faces.get(familyName(c.font, c.bold, c.italic))?.state === 'ready'; }
