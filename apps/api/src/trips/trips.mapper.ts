import type {
  JournalDay,
  Stay,
  Stop,
  StopStatus,
  TimeZoneSource,
  Trip,
  TripDetail,
  TripMember,
  TripV2,
} from '@travel-companion/shared';
import { toPlace, toTripPlace, type PlaceRow, type TripPlaceRow } from '../places/places.mapper.js';

export interface TripRow {
  id: string;
  title: string;
  destination: string | null;
  /** Selected as ::text so calendar dates never shift with server time zones. */
  start_date: string | null;
  end_date: string | null;
  base_location: string | null;
  base_google_place_id: string | null;
  /** D1: trip default zone. */
  time_zone: string | null;
  time_zone_source: TimeZoneSource | null;
  /** Selected as ::int (Postgres count() is bigint, which the driver returns as a string). */
  place_count: number;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    baseLocation: row.base_location,
    basePlaceId: row.base_google_place_id,
    placeCount: row.place_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toTripDetail(row: TripRow, places: TripPlaceRow[]): TripDetail {
  return { ...toTrip(row), places: places.map(toTripPlace) };
}

export interface JournalDayRow {
  /** Selected as ::text so the calendar day never shifts with server time zones. */
  day: string;
  note: string | null;
  rating: number | null;
  updated_at: Date;
}

export function toJournalDay(row: JournalDayRow): JournalDay {
  return { day: row.day, note: row.note, rating: row.rating, updatedAt: row.updated_at.toISOString() };
}

/** D1 · v2: the trip without the legacy base fields (stays replace them). */
export function toTripV2(row: TripRow): TripV2 {
  const { baseLocation: _location, basePlaceId: _place, ...trip } = toTrip(row);
  return { ...trip, timeZone: row.time_zone, timeZoneSource: row.time_zone_source };
}

export interface TripMemberRow extends PlaceRow {
  trip_place_id: string;
  saved_at: Date;
}

export function toTripMember(row: TripMemberRow): TripMember {
  return { ...toPlace(row), tripPlaceId: row.trip_place_id, savedAt: row.saved_at.toISOString() };
}

export interface StopRow {
  id: string;
  trip_id: string;
  trip_place_id: string;
  place_id: string;
  /** Selected as ::text. */
  day: string;
  position: number;
  /** Selected as to_char(..., 'HH24:MI'). */
  start_time: string | null;
  duration_minutes: number | null;
  time_zone: string | null;
  status: StopStatus;
  arrived_at: Date | null;
  completed_at: Date | null;
  skipped_at: Date | null;
  completion_source: 'user' | 'migrated' | null;
  highlight: boolean;
  created_at: Date;
  updated_at: Date;
  version: number;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export function toStop(row: StopRow): Stop {
  return {
    id: row.id,
    tripId: row.trip_id,
    tripPlaceId: row.trip_place_id,
    placeId: row.place_id,
    day: row.day,
    position: row.position,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    timeZone: row.time_zone,
    status: row.status,
    arrivedAt: iso(row.arrived_at),
    completedAt: iso(row.completed_at),
    skippedAt: iso(row.skipped_at),
    completionSource: row.completion_source,
    highlight: row.highlight,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export interface StayRow {
  id: string;
  trip_id: string;
  place_id: string | null;
  label: string | null;
  /** Selected as ::text. */
  check_in: string | null;
  check_out: string | null;
  time_zone: string | null;
  time_zone_source: TimeZoneSource | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export function toStay(row: StayRow, places: ReadonlyMap<string, PlaceRow> = new Map()): Stay {
  const place = row.place_id ? places.get(row.place_id) : undefined;
  return {
    id: row.id,
    tripId: row.trip_id,
    placeId: row.place_id,
    place: place ? toPlace(place) : null,
    label: row.label,
    checkIn: row.check_in,
    checkOut: row.check_out,
    timeZone: row.time_zone,
    timeZoneSource: row.time_zone_source,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}
