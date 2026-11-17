import type { Tx } from '../database/database.service.js';

/** Columns for a PlaceRow from `app.places p`, including how many live trips it's in. */
export function placeColumns(tx: Tx) {
  return tx`
    p.id, p.google_place_id, p.name, p.address, p.notes, p.category, p.tags, p.visited_at,
    (
      select count(*)::int
      from app.trip_places tp
      join app.trips t on t.id = tp.trip_id and t.deleted_at is null
      where tp.place_id = p.id and tp.deleted_at is null
    ) as trip_count,
    p.created_at, p.updated_at, p.version
  `;
}
