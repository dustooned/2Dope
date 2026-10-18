import { describe, expect, it } from 'vitest';
import { mediaKind } from './media';

describe('mediaKind', () => {
  it('sorts files into pictures, movies and sounds by type or extension', () => {
    expect(mediaKind('a.png', 'image/png')).toBe('picture');
    expect(mediaKind('IMG_1.HEIC.jpg', '')).toBe('picture');
    expect(mediaKind('clip.mov', 'video/quicktime')).toBe('movie');
    expect(mediaKind('clip.MP4', '')).toBe('movie');
    expect(mediaKind('line.m4a', 'audio/mp4')).toBe('sound');
    expect(mediaKind('take.wav', '')).toBe('sound');
    expect(mediaKind('notes.txt', 'text/plain')).toBeNull();
  });
});
