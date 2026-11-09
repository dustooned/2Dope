import { describe, expect, it } from 'vitest';
import { iconSvg } from './icons';

// read the sources as text, so the check needs no DOM
const src = import.meta.glob(['./icons.ts', './bubbles.ts', './captioneditor.ts', './motion.ts', './effectspanel.ts', './commands.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const icons = src['./icons.ts']!;
const table = icons.slice(icons.indexOf('const P'), icons.indexOf('};', icons.indexOf('const P')));

/** Icon names a file asks for, in the forms the UI uses. */
function asked(file: string): string[] {
  const s = src[file]!, out = new Set<string>();
  const add = (re: RegExp, group = 1) => { for (const m of s.matchAll(re)) if (m[group]) out.add(m[group]!); };
  add(/decorate\([^,()]+,\s*'([A-Za-z0-9]+)'\)/g);
  add(/\bicon:\s*'([A-Za-z0-9]+)'/g);
  add(/'data-icon':\s*'([A-Za-z0-9]+)'/g);
  add(/iconSvg\('([A-Za-z0-9]+)'\)/g);
  // tool lists: ['key', 'Label', 'icon'] and the Letter row's ['style', 'Label', 'title', 'icon']
  add(/\['[a-z]+', '[A-Z][^']*', '([a-z][A-Za-z0-9]*)'\]/g);
  add(/\['[a-z]+', '[A-Z][^']*', '[^']+', '([a-z][A-Za-z0-9]*)'\]/g);
  // the Caption panel's label → icon map
  const map = s.match(/PANEL_ICONS: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (map) for (const m of map[1]!.matchAll(/:\s*'([A-Za-z0-9]+)'/g)) out.add(m[1]!);
  return [...out];
}

describe('icons', () => {
  it('every icon the tool rows, panels and menus ask for is drawn', () => {
    for (const file of Object.keys(src).filter(f => f !== './icons.ts')) {
      const missing = asked(file).filter(n => !iconSvg(n));
      expect(missing, `${file} asks for icons that do not exist`).toEqual([]);
    }
  });
  it('the Caption panel and Letter tool have their own icons for every control', () => {
    const names = asked('./captioneditor.ts');
    expect(names.length).toBeGreaterThan(40);
    for (const n of ['balloonSpeech', 'balloonThought', 'balloonShout', 'balloonWhisper', 'balloonBox', 'sfx', 'tailJoined', 'tailBubbles', 'tailLightning', 'lookClassic', 'captionStyles']) expect(iconSvg(n), n).not.toBe('');
  });
  it('no two icons share the same drawing (no placeholders)', () => {
    const bodies = new Map<string, string>();
    const dupes: string[] = [];
    for (const m of table.matchAll(/^\s*([A-Za-z0-9]+):\s*\n?\s*'([^']+)'/gm)) {
      const [, name, body] = m;
      const other = bodies.get(body!);
      if (other) dupes.push(`${other} = ${name}`); else bodies.set(body!, name!);
    }
    expect(dupes).toEqual([]);
  });
});
