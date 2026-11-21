import type { Trip, TripPlace } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { zonedNow } from '../companion/zoned-time';
import {
  countByDay,
  dayTitle,
  formatStartTime,
  initialDay,
  moveId,
  nextStop,
  tripMode,
  daysBetween,
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
    myLabel: null,
    highlight: false,
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
    durationMinutes: null,
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

function trip(id: string, startDate: string | null, endDate: string | null): Trip {
  return {
    id,
    title: id,
    destination: null,
    startDate,
    endDate,
    baseLocation: null,
    basePlaceId: null,
    placeCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    version: 1,
  };
}

describe('trip mode', () => {
  const ny = trip('ny', '2026-11-23', '2026-11-29');
  const later = trip('later', '2027-03-01', '2027-03-05');
  const undated = trip('undated', null, null);

  it('counts whole days', () => {
    expect(daysBetween('2026-11-17', '2026-11-23')).toBe(6);
    expect(daysBetween('2026-11-23', '2026-11-23')).toBe(0);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('shows the countdown before the trip, only within 30 days', () => {
    expect(tripMode([later, ny, undated], '2026-11-17')).toEqual({ phase: 'before', trip: ny, daysUntil: 6 });
    expect(tripMode([later, ny], '2026-10-01')).toBeNull();
  });

  it('shows the trip day during the trip and nothing after', () => {
    expect(tripMode([ny, later], '2026-11-23')).toEqual({ phase: 'during', trip: ny, dayNumber: 1, totalDays: 7 });
    expect(tripMode([ny], '2026-11-29')).toMatchObject({ phase: 'during', dayNumber: 7 });
    expect(tripMode([ny], '2026-11-30')).toBeNull();
  });

  it("is upcoming until the first day in the trip's zone (the phone may already be a day ahead)", () => {
    const at = Date.parse('2026-11-23T03:00:00Z');
    expect(tripMode([ny], zonedNow(at, 'Asia/Jerusalem').day)).toMatchObject({ phase: 'during', dayNumber: 1 });
    expect(tripMode([ny], zonedNow(at, 'America/New_York').day)).toEqual({ phase: 'before', trip: ny, daysUntil: 1 });
  });

  it('finds the next stop not yet visited', () => {
    const done = { ...place('a', '2026-11-24', 0), visitedAt: '2026-11-24T10:00:00.000Z' };
    const open = place('b', '2026-11-24', 1);
    expect(nextStop([done, open])?.id).toBe('b');
    expect(nextStop([done])).toBeNull();
  });
});
