import { describe, expect, it } from 'vitest';
import { tripDetail, tripPlace } from '../offline/test-fixtures';
import { buildRecap, recapText } from './recap';

const D1 = '2026-11-23';
const D2 = '2026-11-24';
const DAYS = [D1, D2, '2026-11-25'];
const trip = tripDetail([
  tripPlace(1, { day: D1, visitedAt: '2026-11-23T17:00:00.000Z', myLabel: 'Met' }),
  tripPlace(2, { day: D1, visitedAt: '2026-11-23T15:00:00.000Z', myLabel: 'Zoo', highlight: true }),
  tripPlace(3, { day: D2, myLabel: 'Bridge' }),
  tripPlace(4, { day: null, position: 0, myLabel: 'Wish', highlight: true }),
]);
const LOCATIONS: Record<string, { latitude: number; longitude: number }> = {
  Met: { latitude: 40.7794, longitude: -73.9632 },
  Zoo: { latitude: 40.7678, longitude: -73.9718 },
};
const locationOf = (place: { myLabel: string | null }) => LOCATIONS[place.myLabel ?? ''] ?? null;

describe('trip recap', () => {
  it('counts days, visited and planned stops, and lists highlights in itinerary order', () => {
    const recap = buildRecap(trip, { days: [] }, DAYS, locationOf);
    expect(recap).toMatchObject({ days: 3, visited: 2, planned: 3 });
    expect(recap.highlights.map((place) => place.myLabel)).toEqual(['Zoo', 'Wish']);
  });

  it('lists what you did each day in the order you did it, with the note and rating', () => {
    const recap = buildRecap(
      trip,
      { days: [{ day: D1, note: 'Rain, then sun', rating: 4, updatedAt: '2026-11-23T23:00:00.000Z' }] },
      DAYS,
      locationOf,
    );
    expect(recap.entries[0]).toMatchObject({ day: D1, note: 'Rain, then sun', rating: 4 });
    expect(recap.entries[0]?.done.map((place) => place.myLabel)).toEqual(['Zoo', 'Met']);
    expect(recap.entries[1]?.done).toEqual([]);
  });

  it('estimates distance between visited places with known locations, or says unknown', () => {
    expect(buildRecap(trip, undefined, DAYS, locationOf).meters).toBeGreaterThan(1000);
    expect(buildRecap(trip, undefined, DAYS, () => null).meters).toBeNull();
  });

  it('builds share text that skips empty days', () => {
    const recap = buildRecap(
      trip,
      { days: [{ day: D1, note: 'Rain, then sun', rating: 4, updatedAt: '2026-11-23T23:00:00.000Z' }] },
      DAYS,
      locationOf,
    );
    const text = recapText(recap, {
      title: 'New York',
      dates: 'Nov 23–25',
      summary: '3 days · 2 places',
      highlightsLabel: 'Highlights',
      nameOf: (place) => place.myLabel ?? '',
      dayTitle: (day) => day,
    });
    expect(text).toBe(
      ['New York · Nov 23–25', '3 days · 2 places', '', 'Highlights: Zoo, Wish', '', `${D1} ★★★★`, 'Zoo → Met', 'Rain, then sun'].join('\n'),
    );
  });
});
