import { meSchema, placeSchema, tripDetailSchema, tripSchema } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { toMe } from './me/me.mapper.js';
import { toPlace } from './places/places.mapper.js';
import { toTrip, toTripDetail } from './trips/trips.mapper.js';

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
      place_count: 2,
      created_at: created,
      updated_at: created,
      version: 1,
    });
    expect(tripSchema.parse(trip)).toEqual(trip);
    expect(trip.startDate).toBe('2026-11-23');
  });
});

describe('toTripDetail', () => {
  it('matches the shared contract', () => {
    const detail = toTripDetail(
      {
        id: '0b8f6c1a-2d3e-4f5a-9b8c-7d6e5f4a3b2c',
        title: 'New York',
        destination: null,
        start_date: null,
        end_date: null,
        place_count: 1,
        created_at: created,
        updated_at: created,
        version: 1,
      },
      [
        {
          place_id: '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e',
          name: 'The Met',
          address: '1000 5th Ave',
          notes: null,
          added_at: updated,
        },
      ],
    );
    expect(tripDetailSchema.parse(detail)).toEqual(detail);
    expect(detail.places[0]?.addedAt).toBe('2026-11-16T11:30:00.000Z');
  });
});

describe('toPlace', () => {
  it('matches the shared contract', () => {
    const place = toPlace({
      id: '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e',
      name: 'The Met',
      address: null,
      notes: 'Closed Wednesdays',
      trip_count: 0,
      created_at: created,
      updated_at: updated,
      version: 1,
    });
    expect(placeSchema.parse(place)).toEqual(place);
  });
});
