import { describe, expect, it } from 'vitest';
import {
  COORDS_MAX_AGE_MS,
  COORDS_SOURCE,
  coordLookup,
  isCoordValid,
  parseCoords,
  pruneCoords,
  upsertCoord,
  type CachedCoord,
} from './coords';

const NOW = Date.UTC(2026, 10, 24, 12);
const DAY = 24 * 60 * 60 * 1000;
const coord = (placeId: string, ageMs: number): CachedCoord => ({
  placeId,
  latitude: 40.75,
  longitude: -73.98,
  source: COORDS_SOURCE,
  cachedAt: NOW - ageMs,
});

describe('coordinate cache (Google terms: ≤ 30 days)', () => {
  it('is valid until just before 30 days and invalid at exactly 30 days', () => {
    expect(isCoordValid(coord('a', COORDS_MAX_AGE_MS - 1), NOW)).toBe(true);
    expect(isCoordValid(coord('a', COORDS_MAX_AGE_MS), NOW)).toBe(false);
    expect(isCoordValid(coord('a', 45 * DAY), NOW)).toBe(false);
  });

  it('rejects entries from the future and entries with another source', () => {
    expect(isCoordValid(coord('a', -DAY), NOW)).toBe(false);
    expect(isCoordValid({ ...coord('a', DAY), source: 'other' as typeof COORDS_SOURCE }, NOW)).toBe(false);
  });

  it('never returns expired coordinates from a lookup', () => {
    const lookup = coordLookup([coord('fresh', DAY), coord('old', 31 * DAY)], NOW);
    expect(lookup.get('fresh')).toEqual({ latitude: 40.75, longitude: -73.98 });
    expect(lookup.has('old')).toBe(false);
  });

  it('prunes expired entries and places no longer in a saved trip', () => {
    const kept = pruneCoords([coord('a', DAY), coord('b', 31 * DAY), coord('c', DAY)], NOW, new Set(['a', 'b']));
    expect(kept.map((entry) => entry.placeId)).toEqual(['a']);
  });

  it('records source and fetch time, and a new Google response restarts the clock', () => {
    const entries = upsertCoord([coord('a', 29 * DAY)], 'a', { latitude: 1, longitude: 2 }, NOW);
    expect(entries).toEqual([{ placeId: 'a', latitude: 1, longitude: 2, source: COORDS_SOURCE, cachedAt: NOW }]);
  });

  it('drops malformed stored rows', () => {
    expect(parseCoords([coord('a', 1), { placeId: 'x' }, null, 'junk']).map((entry) => entry.placeId)).toEqual(['a']);
    expect(parseCoords({ not: 'an array' })).toEqual([]);
  });
});
