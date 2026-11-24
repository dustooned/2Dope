import { describe, expect, it } from 'vitest';
import { MAX_FAVS, MAX_RECENT, pushRecent, readEffectIds, toggleFavourite } from './effectfavs';

const valid = ['glow', 'blur', 'glitch', 'wipe', 'shake', 'tv', 'wave', 'grain', 'fill', 'echo', 'mirror', 'twirl', 'edges', 'mosaic'];

describe('favourite and recent effects', () => {
  it('reads only real effects, once each, and survives damaged data', () => {
    expect(readEffectIds(['glow', 'nope', 'glow', 5, null, 'blur'], valid, 12)).toEqual(['glow', 'blur']);
    expect(readEffectIds(undefined, valid, 12)).toEqual([]);
    expect(readEffectIds('glow', valid, 12)).toEqual([]);
    expect(readEffectIds({ 0: 'glow' }, valid, 12)).toEqual([]);
    expect(readEffectIds(valid, valid, 3)).toEqual(['glow', 'blur', 'glitch']);
  });
  it('stars and unstars an effect, keeping the order they were starred in', () => {
    let f: string[] = [];
    f = toggleFavourite(f, 'glow'); f = toggleFavourite(f, 'wipe'); f = toggleFavourite(f, 'blur');
    expect(f).toEqual(['glow', 'wipe', 'blur']);
    expect(toggleFavourite(f, 'wipe')).toEqual(['glow', 'blur']);
    expect(f).toEqual(['glow', 'wipe', 'blur']);
  });
  it('stops adding favourites at the limit but still lets one go', () => {
    const full = valid.slice(0, MAX_FAVS);
    expect(toggleFavourite(full, 'mosaic')).toEqual(full);
    expect(toggleFavourite(full, 'glow')).toHaveLength(MAX_FAVS - 1);
  });
  it('keeps the newest recent effect first, without repeats, up to the limit', () => {
    let r: string[] = [];
    for (const id of ['glow', 'blur', 'glow', 'tv']) r = pushRecent(r, id);
    expect(r).toEqual(['tv', 'glow', 'blur']);
    for (const id of valid) r = pushRecent(r, id);
    expect(r).toHaveLength(MAX_RECENT);
    expect(r[0]).toBe(valid[valid.length - 1]);
  });
});
