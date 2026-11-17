import type { Place } from '@travel-companion/shared';

export interface PlaceRow {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  /** Selected as ::int. */
  trip_count: number;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export function toPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    notes: row.notes,
    tripCount: row.trip_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}
