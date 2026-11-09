import { describe, expect, it } from 'vitest';
import { balloonOutline, balloonShapes, detectBalloon, fitCaption, inside, mergeTail, type Pt } from './geometry';
import { captionValue, defaultCaption, readCaption } from './spec';
import { BUNDLED_FONTS, bundledFile, familyName, isFontFile } from './fonts';

const mono = (size: number) => (t: string) => t.length * size * 0.6;
const ellipse = (a: number, b: number, n = 200): Pt[] => Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2) * a, y: Math.sin((i / n) * Math.PI * 2) * b }));

describe('lettering stays portable', () => {
  it('imports nothing from the app (so a comics app can reuse it)', () => {
    const files = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [f, src] of Object.entries(files).filter(([f]) => !f.endsWith('.test.ts'))) {
      const imports = [...src.matchAll(/from '([^']+)'/g)].map(m => m[1]!);
      expect(imports.filter(i => !i.startsWith('./')), f).toEqual([]);
    }
  });
});

describe('text sets the balloon', () => {
  const o = { size: 34, leading: 1.15, maxA: 1000, maxB: 600 };
  it('grows with the words at a fixed lettering size and shapes lines like a diamond', () => {
    const short = fitCaption('HEY!', 'speech', mono(34), o), long = fitCaption('WAIT FOR ME, I LEFT MY LUNCH ON THE BUS!', 'speech', mono(34), o);
    expect(short.lines).toHaveLength(1);
    expect(long.lines.length).toBeGreaterThanOrEqual(3);
    expect(long.a).toBeGreaterThan(short.a);
    const widths = long.lines.map(l => l.width), mid = Math.floor(widths.length / 2);
    expect(widths[mid]).toBeGreaterThanOrEqual(widths[0]!);
    expect(widths[mid]).toBeGreaterThanOrEqual(widths[widths.length - 1]!);
    // every line fits inside the ellipse with room for the ink
    for (const l of long.lines) expect((l.width / 2 / long.a) ** 2 + (l.y / long.b) ** 2).toBeLessThan(1);
  });
  it('a wider balloon setting gives fewer, longer lines; the letters keep their size', () => {
    const text = 'WAIT FOR ME, I LEFT MY LUNCH ON THE BUS AND MY HOMEWORK TOO!';
    const usual = fitCaption(text, 'speech', mono(34), o), wide = fitCaption(text, 'speech', mono(34), { ...o, aspect: 2.2 }), tall = fitCaption(text, 'speech', mono(34), { ...o, aspect: 0.6 });
    expect(wide.lines.length).toBeLessThan(usual.lines.length);
    expect(tall.lines.length).toBeGreaterThan(usual.lines.length);
    expect(wide.a / wide.b).toBeGreaterThan(usual.a / usual.b);
    for (const f of [wide, tall]) for (const l of f.lines) expect((l.width / 2 / f.a) ** 2 + (l.y / f.b) ** 2).toBeLessThan(1);
    expect(readCaption({ ...defaultCaption(0, 0), shape: 9 }).shape).toBe(2.5);
    expect(readCaption({ ...defaultCaption(0, 0), shape: 1 }).shape).toBeUndefined();
  });
  it('keeps the student’s own line breaks, and never squeezes past the frame', () => {
    const own = fitCaption('ONE\nTWO WORDS', 'speech', mono(34), o);
    expect(own.lines.map(l => l.text)).toEqual(['ONE', 'TWO WORDS']);
    const huge = fitCaption(Array(200).fill('WORD').join(' '), 'speech', mono(34), { ...o, maxA: 300, maxB: 200 });
    expect(huge.tooLong).toBe(true);
    const sfx = fitCaption('POW', 'sfx', mono(80), o);
    expect(sfx.lines).toHaveLength(1);
  });
});

describe('balloons and tails', () => {
  it('draws closed outlines for every style', () => {
    for (const s of ['speech', 'whisper', 'thought', 'shout', 'box'] as const) {
      const p = balloonOutline(s, 120, 80, 3);
      expect(p.length).toBeGreaterThan(20);
      expect(inside(p, { x: 0, y: 0 })).toBe(true);
      expect(inside(p, { x: 400, y: 0 })).toBe(false);
    }
  });
  it('merges a tail into the outline, or falls back to a seam, never a broken outline', () => {
    const m = mergeTail(ellipse(120, 80), { x: -60, y: 200 }, null, 30)!;
    expect(m.some(p => Math.hypot(p.x + 60, p.y - 200) < 1)).toBe(true);
    expect(inside(m, { x: 0, y: 0 })).toBe(true);
    const shapes = balloonShapes(balloonOutline('speech', 120, 80), [{ x: 200, y: 260, join: 'merged', width: 1 }, { x: -220, y: -200, join: 'bubbles', width: 1 }, { x: 260, y: -120, join: 'lightning', width: 1 }], 0, 0, 30);
    expect(shapes.bubbles).toHaveLength(3);
    expect(shapes.zigzags).toHaveLength(1);
    expect(shapes.outline.some(p => Math.hypot(p.x - 200, p.y - 260) < 1) || shapes.seams.length === 1).toBe(true);
  });
});

describe('detecting a drawn balloon', () => {
  it('recognises a sloppy oval, box and star, and an open line', () => {
    const wobble = (pts: Pt[]) => pts.map((p, i) => ({ x: p.x + Math.sin(i * 1.7) * 1.5, y: p.y + Math.cos(i * 2.3) * 1.5 }));
    expect(detectBalloon(wobble(ellipse(150, 100)))).toBe('speech');
    // a long, flat oval is still an oval, not a box
    expect(detectBalloon(ellipse(90, 50))).toBe('speech');
    expect(detectBalloon(ellipse(200, 60).map((p, i) => ({ x: p.x + Math.sin(i * 0.4) * 2, y: p.y + Math.cos(i * 0.3) * 2 })))).toBe('speech');
    const box: Pt[] = [];
    for (let i = 0; i < 50; i++) box.push({ x: -150 + i * 6, y: -90 });
    for (let i = 0; i < 30; i++) box.push({ x: 150, y: -90 + i * 6 });
    for (let i = 0; i < 50; i++) box.push({ x: 150 - i * 6, y: 90 });
    for (let i = 0; i < 30; i++) box.push({ x: -150, y: 90 - i * 6 });
    expect(detectBalloon(wobble(box))).toBe('box');
    const star = Array.from({ length: 24 }, (_, i) => { const t = (i / 24) * Math.PI * 2, r = i % 2 ? 90 : 150; return { x: Math.cos(t) * r, y: Math.sin(t) * r }; });
    const drawn: Pt[] = [];
    star.forEach((p, i) => { const q = star[(i + 1) % star.length]!; for (let k = 0; k < 8; k++) drawn.push({ x: p.x + ((q.x - p.x) * k) / 8, y: p.y + ((q.y - p.y) * k) / 8 }); });
    expect(detectBalloon(drawn)).toBe('shout');
    expect(detectBalloon(ellipse(150, 100).slice(0, 80))).toBe('open');
  });
});

describe('caption data', () => {
  it('reads back what it writes, clamps values and refuses unknown versions', () => {
    const c = { ...defaultCaption(100, 80), text: 'HI', values: { reveal: 50, tracking: 900 } };
    const back = readCaption(JSON.parse(JSON.stringify(c)));
    expect(back.text).toBe('HI');
    expect(captionValue(back, 'reveal')).toBe(50);
    expect(captionValue(back, 'tracking')).toBe(300);
    expect(captionValue(back, 'balloon')).toBe(100);
    expect(() => readCaption({ v: 2 })).toThrow();
    expect(readCaption({ v: 1, style: 'nope', font: '../evil' }).style).toBe('speech');
  });
  it('lists only fonts with files, and names faces uniquely', () => {
    for (const f of BUNDLED_FONTS) expect(f.files.regular).toMatch(/\.ttf$/);
    expect(bundledFile(BUNDLED_FONTS.find(f => f.id === 'bangers')!, true, false)).toEqual({ file: 'Bangers-Regular.ttf', synthetic: true });
    expect(familyName('comic-neue', true, true)).not.toBe(familyName('comic-neue', true, false));
    expect(isFontFile('a.ttf', new Uint8Array([0, 1, 0, 0]))).toBe(true);
    expect(isFontFile('a.woff2', new TextEncoder().encode('wOF2'))).toBe(true);
    expect(isFontFile('a.png', new Uint8Array([0, 1, 0, 0]))).toBe(false);
  });
});
