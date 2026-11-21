import { journalDaySchema, meSchema, placeSchema, tripDetailSchema, tripSchema } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { toMe } from './me/me.mapper.js';
import { toPlace } from './places/places.mapper.js';
import { toJournalDay, toTrip, toTripDetail } from './trips/trips.mapper.js';

const created = new Date('2026-11-16T10:00:00.000Z');
const updated = new Date('2026-11-16T11:30:00.000Z');

describe('toMe', () => {
  it('produces a response that matches the shared contract', () => {
    const me = toMe(
      {
        id: '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e',
        display_name: null,
        created_at: created,
        updated_at: updated,
        version: 2,
        locale: 'he',
        distance_unit: 'km',
        preferences_updated_at: updated,
        preferences_version: 1,
      },
      'traveler@example.com',
    );
    expect(meSchema.parse(me)).toEqual(me);
    expect(me.preferences.locale).toBe('he');
    expect(me.updatedAt).toBe('2026-11-16T11:30:00.000Z');
  });
});

describe('toTrip', () => {
  it('keeps calendar dates as plain strings', () => {
    const trip = toTrip({
      id: '0b8f6c1a-2d3e-4f5a-9b8c-7d6e5f4a3b2c',
      title: 'New York',
      destination: 'New York, USA',
      start_date: '2026-11-23',
      end_date: '2026-11-29',
      base_location: 'Midtown',
      base_google_place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      time_zone: null,
      time_zone_source: null,
      place_count: 2,
      created_at: created,
      updated_at: created,
      version: 1,
    });
    expect(tripSchema.parse(trip)).toEqual(trip);
    expect(trip.startDate).toBe('2026-11-23');
  });
});

const placeRow = {
  id: '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e',
  google_place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  name: null,
  address: null,
  notes: 'Pastrami on rye',
  my_label: null,
  latitude: null,
  longitude: null,
  linked_google_place_id: null,
  category: 'food' as const,
  tags: ['must'],
  visited_at: null,
  trip_count: 1,
  created_at: created,
  updated_at: updated,
  version: 1,
};

describe('toTripDetail', () => {
  it('matches the shared contract', () => {
    const detail = toTripDetail(
      {
        id: '0b8f6c1a-2d3e-4f5a-9b8c-7d6e5f4a3b2c',
        title: 'New York',
        destination: null,
        start_date: null,
        end_date: null,
        base_location: null,
        base_google_place_id: null,
        time_zone: null,
        time_zone_source: null,
        place_count: 1,
        created_at: created,
        updated_at: created,
        version: 1,
      },
      [{ ...placeRow, added_at: updated, day: '2026-11-24', start_time: '09:30', position: 0, duration_minutes: 45, highlight: true }],
    );
    expect(tripDetailSchema.parse(detail)).toEqual(detail);
    expect(detail.places[0]?.addedAt).toBe('2026-11-16T11:30:00.000Z');
    expect(detail.places[0]?.source).toBe('google');
    expect(detail.places[0]?.day).toBe('2026-11-24');
    expect(detail.places[0]?.startTime).toBe('09:30');
    expect(detail.places[0]?.durationMinutes).toBe(45);
    expect(detail.places[0]?.highlight).toBe(true);
  });
});

describe('toJournalDay', () => {
  it('returns a day entry that matches the shared schema', () => {
    const entry = toJournalDay({ day: '2026-11-24', note: 'Best pastrami', rating: 5, updated_at: updated });
    expect(journalDaySchema.parse(entry)).toEqual(entry);
    expect(entry).toEqual({ day: '2026-11-24', note: 'Best pastrami', rating: 5, updatedAt: '2026-11-16T11:30:00.000Z' });
  });
});

describe('toPlace', () => {
  it('marks Google places and keeps their copied text empty', () => {
    const place = toPlace(placeRow);
    expect(placeSchema.parse(place)).toEqual(place);
    expect(place.source).toBe('google');
    expect(place.name).toBeNull();
    expect(place.myLabel).toBeNull();
  });

  it("returns the user's own label", () => {
    const place = toPlace({ ...placeRow, my_label: 'Best bagels' });
    expect(placeSchema.parse(place)).toEqual(place);
    expect(place.myLabel).toBe('Best bagels');
  });

  it('marks custom places', () => {
    const place = toPlace({ ...placeRow, google_place_id: null, name: 'Aunt Dina', visited_at: updated });
    expect(placeSchema.parse(place)).toEqual(place);
    expect(place.source).toBe('custom');
    expect(place.visitedAt).toBe('2026-11-16T11:30:00.000Z');
  });
});
