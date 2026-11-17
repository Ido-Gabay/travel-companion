import type { TripPlace } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import {
  countByDay,
  dayTitle,
  formatStartTime,
  initialDay,
  moveId,
  placesForDay,
  wishlistPlaces,
} from './itinerary';

function place(id: string, day: string | null, position: number, addedAt = '2026-11-17T10:00:00.000Z'): TripPlace {
  return {
    id,
    source: 'custom',
    googlePlaceId: null,
    name: id,
    address: null,
    notes: null,
    category: 'food',
    tags: [],
    visitedAt: null,
    tripCount: 1,
    createdAt: addedAt,
    updatedAt: addedAt,
    version: 1,
    addedAt,
    day,
    startTime: null,
    position,
  };
}

const days = ['2026-11-23', '2026-11-24', '2026-11-25'];

describe('itinerary helpers', () => {
  const places = [place('c', '2026-11-24', 1), place('a', '2026-11-24', 0), place('w', null, 0), place('b', '2026-11-23', 0)];

  it('splits places into days (in order) and the wishlist', () => {
    expect(placesForDay(places, '2026-11-24').map((p) => p.id)).toEqual(['a', 'c']);
    expect(placesForDay(places, '2026-11-25')).toEqual([]);
    expect(wishlistPlaces(places).map((p) => p.id)).toEqual(['w']);
    expect(countByDay(places).get('2026-11-24')).toBe(2);
    expect(countByDay(places).has('2026-11-25')).toBe(false);
  });

  it('opens on today during the trip, otherwise the first day', () => {
    expect(initialDay(days, '2026-11-24')).toBe('2026-11-24');
    expect(initialDay(days, '2026-11-17')).toBe('2026-11-23');
    expect(initialDay([], '2026-11-17')).toBeNull();
  });

  it('moves an id up or down, and not past the ends', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(moveId(['a'], 'x', 1)).toBeNull();
  });

  it('formats days and times without shifting them', () => {
    expect(dayTitle('2026-11-23', 'en')).toBe('Monday, November 23');
    expect(formatStartTime('09:30', 'en')).toMatch(/^9:30\sAM$/);
    expect(formatStartTime('21:05', 'he')).toBe('21:05');
  });
});
