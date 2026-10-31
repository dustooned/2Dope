import { describe, expect, it } from 'vitest';
import { boardCues, boardSpeakers, cleanSpeaker, cueAt, formatDialogue, parseDialogue, splitPanel, toSrt, toVtt } from './dialogue';

describe('panel dialogue lines', () => {
  it('reads speakers and keeps free text from older projects', () => {
    expect(parseDialogue('MOM: Dinner is ready!\n\n  Kid:   coming  \njust a sound effect')).toEqual([
      { who: 'MOM', text: 'Dinner is ready!' },
      { who: 'Kid', text: 'coming' },
      { who: '', text: 'just a sound effect' },
    ]);
    expect(parseDialogue(undefined)).toEqual([]);
    expect(parseDialogue('Time is 10:30 now')).toEqual([{ who: '', text: 'Time is 10:30 now' }]);
    expect(parseDialogue('Dr. Who (V.O.): hello')).toEqual([{ who: 'Dr. Who (V.O.)', text: 'hello' }]);
  });

  it('round-trips through the stored text', () => {
    const lines = [{ who: ' Sam: ', text: 'Hi\nthere ' }, { who: '', text: 'Wind blows' }, { who: 'Ann', text: '   ' }];
    const s = formatDialogue(lines);
    expect(s).toBe('Sam: Hi there\nWind blows');
    expect(parseDialogue(s)).toEqual([{ who: 'Sam', text: 'Hi there' }, { who: '', text: 'Wind blows' }]);
    expect(formatDialogue(parseDialogue(s))).toBe(s);
    expect(cleanSpeaker('A:B\nC'.padEnd(50, 'x')).length).toBeLessThanOrEqual(30);
  });

  it('shares a panel between its lines, longer lines for longer text', () => {
    const parts = splitPanel([{ who: '', text: 'Hi' }, { who: '', text: 'This is a much longer line of dialogue' }], 48);
    expect(parts[0]!.start).toBe(0);
    expect(parts[1]!.end).toBe(48);
    expect(parts[0]!.end).toBe(parts[1]!.start);
    expect(parts[1]!.end - parts[1]!.start).toBeGreaterThan(parts[0]!.end - parts[0]!.start);
    // more lines than frames: every frame gets one line, the rest are left out
    const tight = splitPanel([{ who: '', text: 'a' }, { who: '', text: 'b' }, { who: '', text: 'c' }], 2);
    expect(tight.map((p) => [p.start, p.end])).toEqual([[0, 1], [1, 2]]);
    expect(splitPanel([{ who: '', text: 'a' }], 0)).toEqual([]);
  });

  it('places cues on the comp clock and finds the one showing', () => {
    const ex = [
      { drawing: 'a', length: 24, dialogue: 'A: one' },
      { drawing: 'b', length: 12 },
      { drawing: 'c', length: 24, dialogue: 'B: two\nA: three' },
    ];
    const cues = boardCues(ex, 10);
    expect(cues.map((c) => [c.panel, c.start, c.who])).toEqual([[0, 10, 'A'], [2, 46, 'B'], [2, cues[2]!.start, 'A']]);
    expect(cues[2]!.end).toBe(70);
    expect(cueAt(cues, 9)).toBeNull();
    expect(cueAt(cues, 10)?.text).toBe('one');
    expect(cueAt(cues, 40)).toBeNull();
    expect(cueAt(cues, 69)?.text).toBe('three');
    expect(boardSpeakers([...ex, { drawing: 'd', length: 1, dialogue: 'a: again' }])).toEqual(['A', 'B']);
  });

  it('writes SRT and WebVTT subtitles', () => {
    const cues = boardCues([{ drawing: 'a', length: 24, dialogue: 'Sam: <hi> & bye' }, { drawing: 'b', length: 36, dialogue: 'Wind' }], 0);
    expect(toSrt(cues, 24)).toBe('1\r\n00:00:00,000 --> 00:00:01,000\r\nSam: <hi> & bye\r\n\r\n2\r\n00:00:01,000 --> 00:00:02,500\r\nWind\r\n');
    const vtt = toVtt(cues, 24);
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.500\nWind');
    expect(vtt).toContain('<v Sam>&lt;hi&gt; &amp; bye');
    expect(toSrt(boardCues([{ drawing: 'a', length: 30, dialogue: 'x' }], 30), 30, 30)).toContain('00:00:00,000 --> 00:00:01,000');
  });
});
