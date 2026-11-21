import type { Tx } from '../database/database.service.js';

/** Columns for a PlaceRow from `app.places p`, including how many live trips it's in. Needs D1 (trip_stops). */
export function placeColumns(tx: Tx) {
  return tx`
    p.id, p.google_place_id, p.name, p.address, p.notes, p.my_label, p.category, p.tags,
    p.latitude, p.longitude, p.linked_google_place_id,
    -- The legacy "visited" mark, else the latest completed visit (D1; shown by older apps as visited).
    coalesce(p.visited_at, (
      select max(s.completed_at)
      from app.trip_stops s
      join app.trip_places vtp on vtp.id = s.trip_place_id
      where vtp.place_id = p.id and s.status = 'completed' and s.deleted_at is null
    )) as visited_at,
    (
      select count(*)::int
      from app.trip_places tp
      join app.trips t on t.id = tp.trip_id and t.deleted_at is null
      where tp.place_id = p.id and tp.deleted_at is null
    ) as trip_count,
    p.created_at, p.updated_at, p.version
  `;
}
