import { describe, expect, it } from 'vitest';
import { guessSeconds, parseScript, SCRIPT_MAX_PANELS, speakerName } from './script';

const FOUNTAIN = `Title: The Door
Author: Class 7B

INT. HALLWAY - NIGHT

Sam creeps toward the door. Wind howls.

SAM
(whispering)
Is anyone there?

MRS. LEE (V.O.)
Go home, Sam.

CUT TO:

EXT. STREET - CONTINUOUS

[[make this a wide shot]]
Papers blow across the road.`;

describe('parseScript', () => {
  it('turns Fountain into numbered panels with action and dialogue', () => {
    const r = parseScript(FOUNTAIN, 24);
    expect(r.scenes).toBe(2);
    expect(r.panels.map((p) => p.shot)).toEqual(['Sc 1 · Sh 1 · INT. HALLWAY - NIGHT', 'Sc 1 · Sh 2', 'Sc 1 · Sh 3', 'Sc 2 · Sh 1 · EXT. STREET - CONTINUOUS']);
    expect(r.panels[0]!.action).toBe('Sam creeps toward the door. Wind howls.');
    expect(r.panels[1]!.dialogue).toBe('Sam: Is anyone there?');
    expect(r.panels[2]!.dialogue).toBe('Mrs. Lee: Go home, Sam.');
    expect(r.panels[3]!.action).toBe('Papers blow across the road.');
    expect(r.panels.every((p) => p.length >= 48 && p.length <= 192)).toBe(true);
  });

  it('reads plain text: paragraphs are actions, "Name: words" lines are dialogue', () => {
    const r = parseScript('A cat sits on a wall.\n\nCat: Meow.\nDog: Woof!\n\nThe dog runs off.', 25);
    expect(r.scenes).toBe(1);
    expect(r.panels.map((p) => p.action ?? p.dialogue)).toEqual(['A cat sits on a wall.', 'Cat: Meow.\nDog: Woof!', 'The dog runs off.']);
    expect(r.panels[0]!.shot).toBe('Sc 1 · Sh 1');
  });

  it('skips transitions, sections, synopses and page breaks, and stops at the panel limit', () => {
    expect(parseScript('# Act one\n\n= the setup\n\n===\n\nFADE OUT.\n\n> THE END', 24).panels).toEqual([]);
    const many = Array.from({ length: SCRIPT_MAX_PANELS + 5 }, (_, i) => `Beat ${i}.`).join('\n\n');
    const r = parseScript(many, 24);
    expect(r.panels.length).toBe(SCRIPT_MAX_PANELS);
    expect(r.dropped).toBe(5);
  });
});

describe('speakerName and guessSeconds', () => {
  it('drops extensions and shouting', () => {
    expect(speakerName('MRS. LEE (V.O.)')).toBe('Mrs. Lee');
    expect(speakerName('McCLANE')).toBe('McCLANE');
    expect(speakerName('BOB^')).toBe('Bob');
  });
  it('estimates between 2 and 8 seconds', () => {
    expect(guessSeconds('Hi.', true)).toBe(2);
    expect(guessSeconds(Array(40).fill('word').join(' '), true)).toBe(8);
    expect(guessSeconds(Array(12).fill('word').join(' '), false)).toBe(4);
  });
});
