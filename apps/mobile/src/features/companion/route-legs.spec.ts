import { describe, expect, it } from 'vitest';
import { ROUTE_LEGS_MAX } from '@travel-companion/shared';
import { buildLookup, decodePolyline, legKey, routeRequests } from './route-legs';

const BRYANT = { latitude: 40.7536, longitude: -73.9832 };
const MOMA = { latitude: 40.7614, longitude: -73.9776 };
const BROOKLYN = { latitude: 40.6782, longitude: -73.9442 };

describe('decodePolyline', () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });
  it('stops cleanly on a broken string', () => {
    expect(decodePolyline('_p~iF')).toEqual([]);
  });
});

describe('routeRequests', () => {
  it('asks once per real leg, walk for short and transit (at the planned time) for long', () => {
    const requests = routeRequests(
      [
        { from: BRYANT, to: MOMA, departMinutes: 600 },
        { from: BRYANT, to: MOMA, departMinutes: 600 },
        { from: MOMA, to: BROOKLYN, departMinutes: 720 },
      ],
      '2026-11-24',
      'America/New_York',
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({ from: BRYANT, to: MOMA, mode: 'walk' });
    expect(requests[1]).toMatchObject({ mode: 'transit', departAt: '2026-11-24T17:00:00.000Z' });
  });

  it('skips missing, invalid, same-spot and absurd legs, and never asks for more than the limit', () => {
    expect(
      routeRequests(
        [
          { from: null, to: MOMA, departMinutes: null },
          { from: { latitude: 0, longitude: 0 }, to: MOMA, departMinutes: null },
          { from: MOMA, to: MOMA, departMinutes: null },
          { from: MOMA, to: { latitude: 32.08, longitude: 34.78 }, departMinutes: null },
        ],
        null,
        null,
      ),
    ).toEqual([]);
    const many = Array.from({ length: 25 }, (_, i) => ({
      from: { latitude: 40.75 + i * 0.01, longitude: -73.98 },
      to: { latitude: 40.75 + i * 0.01 + 0.005, longitude: -73.97 },
      departMinutes: null,
    }));
    expect(routeRequests(many, null, null)).toHaveLength(ROUTE_LEGS_MAX);
  });
});

describe('buildLookup', () => {
  it('finds legs that got a route; the rest stay estimates', () => {
    const requests = routeRequests(
      [
        { from: BRYANT, to: MOMA, departMinutes: null },
        { from: MOMA, to: BROOKLYN, departMinutes: null },
      ],
      null,
      null,
    );
    const lookup = buildLookup(requests, {
      legs: [{ minutes: 12, meters: 1100, mode: 'walk', polyline: '_p~iF~ps|U_ulLnnqC' }, null],
      limited: true,
    });
    expect(lookup?.(BRYANT, MOMA)).toMatchObject({ minutes: 12, meters: 1100, mode: 'walk', source: 'google' });
    expect(lookup?.(BRYANT, MOMA)?.path).toHaveLength(2);
    expect(lookup?.(MOMA, BROOKLYN)).toBeNull();
    expect(legKey(BRYANT, MOMA)).toBe('40.7536,-73.9832>40.7614,-73.9776');
  });

  it('is undefined when nothing came back (offline, capped or an error)', () => {
    expect(buildLookup([], undefined)).toBeUndefined();
    expect(buildLookup([{ from: BRYANT, to: MOMA, mode: 'walk' }], { legs: [null], limited: true })).toBeUndefined();
  });
});
