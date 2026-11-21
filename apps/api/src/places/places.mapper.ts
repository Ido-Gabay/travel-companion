import type { Place, PlaceCategory, TripPlace } from '@travel-companion/shared';

export interface PlaceRow {
  id: string;
  google_place_id: string | null;
  name: string | null;
  address: string | null;
  notes: string | null;
  /** User-typed (M12a); never from Google. */
  my_label: string | null;
  category: PlaceCategory;
  tags: string[];
  /** The legacy mark, else the latest completed visit (D1). */
  visited_at: Date | null;
  /** D1: the user's own pin (custom places only). */
  latitude: number | null;
  longitude: number | null;
  linked_google_place_id: string | null;
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
  highlight: boolean;
}

/** Place fields as they were before D1 (v1 trip responses stay byte-identical). */
function basePlace(row: PlaceRow): Place {
  return {
    id: row.id,
    source: row.google_place_id ? 'google' : 'custom',
    googlePlaceId: row.google_place_id,
    name: row.name,
    address: row.address,
    notes: row.notes,
    myLabel: row.my_label,
    category: row.category,
    tags: row.tags,
    visitedAt: row.visited_at ? row.visited_at.toISOString() : null,
    tripCount: row.trip_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toPlace(row: PlaceRow): Place {
  const place = basePlace(row);
  return {
    ...place,
    latitude: row.latitude,
    longitude: row.longitude,
    linkedGooglePlaceId: row.linked_google_place_id,
  };
}

export function toTripPlace(row: TripPlaceRow): TripPlace {
  return {
    ...basePlace(row),
    addedAt: row.added_at.toISOString(),
    day: row.day,
    startTime: row.start_time,
    position: row.position,
    durationMinutes: row.duration_minutes,
    highlight: row.highlight,
  };
}
