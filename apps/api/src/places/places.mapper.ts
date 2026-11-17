import type { Place, PlaceCategory, TripPlace } from '@travel-companion/shared';

export interface PlaceRow {
  id: string;
  google_place_id: string | null;
  name: string | null;
  address: string | null;
  notes: string | null;
  category: PlaceCategory;
  tags: string[];
  visited_at: Date | null;
  /** Selected as ::int. */
  trip_count: number;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export interface TripPlaceRow extends PlaceRow {
  added_at: Date;
  /** Selected as ::text so the calendar day never shifts with server time zones. */
  day: string | null;
  /** Selected as to_char(..., 'HH24:MI'). */
  start_time: string | null;
  position: number;
  duration_minutes: number | null;
}

export function toPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    source: row.google_place_id ? 'google' : 'custom',
    googlePlaceId: row.google_place_id,
    name: row.name,
    address: row.address,
    notes: row.notes,
    category: row.category,
    tags: row.tags,
    visitedAt: row.visited_at ? row.visited_at.toISOString() : null,
    tripCount: row.trip_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toTripPlace(row: TripPlaceRow): TripPlace {
  return {
    ...toPlace(row),
    addedAt: row.added_at.toISOString(),
    day: row.day,
    startTime: row.start_time,
    position: row.position,
    durationMinutes: row.duration_minutes,
  };
}
