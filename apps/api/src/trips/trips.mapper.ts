import type { Trip, TripDetail, TripPlace } from '@travel-companion/shared';

export interface TripRow {
  id: string;
  title: string;
  destination: string | null;
  /** Selected as ::text so calendar dates never shift with server time zones. */
  start_date: string | null;
  end_date: string | null;
  /** Selected as ::int (Postgres count() is bigint, which the driver returns as a string). */
  place_count: number;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export interface TripPlaceRow {
  place_id: string;
  name: string;
  address: string | null;
  notes: string | null;
  added_at: Date;
}

export function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    placeCount: row.place_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toTripPlace(row: TripPlaceRow): TripPlace {
  return {
    placeId: row.place_id,
    name: row.name,
    address: row.address,
    notes: row.notes,
    addedAt: row.added_at.toISOString(),
  };
}

export function toTripDetail(row: TripRow, places: TripPlaceRow[]): TripDetail {
  return { ...toTrip(row), places: places.map(toTripPlace) };
}
