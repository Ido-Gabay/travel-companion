import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import type { Tx } from '../database/database.service.js';
import { placeColumns } from '../places/place-columns.js';
import type { PlaceRow } from '../places/places.mapper.js';
import type { TripRow } from './trips.mapper.js';

/**
 * D1 · SQL shared by the v1 adapter and the v2 trip services.
 * "Active visit" = not removed, its place still saved to the trip, the place
 * still in the collection.
 */

/** Shared column list for a trip row, including how many live places it has. */
export function tripColumns(tx: Tx) {
  return tx`
    t.id, t.title, t.destination,
    t.start_date::text as start_date,
    t.end_date::text as end_date,
    t.base_location,
    t.base_google_place_id,
    t.time_zone,
    t.time_zone_source,
    (
      select count(*)::int
      from app.trip_places tp
      join app.places p on p.id = tp.place_id and p.deleted_at is null
      where tp.trip_id = t.id and tp.deleted_at is null
    ) as place_count,
    t.created_at, t.updated_at, t.version
  `;
}

export async function findTrip(tx: Tx, user: AuthUser, tripId: string, lock = false): Promise<TripRow> {
  const [row] = await tx<TripRow[]>`
    select ${tripColumns(tx)}
    from app.trips t
    where t.id = ${tripId} and t.owner_id = ${user.id} and t.deleted_at is null
    ${lock ? tx`for update of t` : tx``}
  `;
  if (!row) throw notFound('Trip not found.');
  return row;
}

export function invalid(path: string, message: string): ApiException {
  return new ApiException(400, 'VALIDATION_FAILED', message, [{ path, message }]);
}

/** A 409 the installed (v1) app can parse: code CONFLICT, the reason in details. */
export function conflict(message: string, reason: string): ApiException {
  return new ApiException(409, 'CONFLICT', message, [{ path: 'reason', message: reason }]);
}

/** v1 adapter: the change needs what only the newer app can express (repeat visits, visit status, several stays). */
export function useNewerApp(message: string): ApiException {
  return conflict(`${message} Update the app to change this.`, 'USE_NEWER_APP');
}

/** Columns for a StopRow from `app.trip_stops s join app.trip_places tp`. */
export function stopColumns(tx: Tx) {
  return tx`
    s.id, s.trip_id, s.trip_place_id, tp.place_id,
    s.day::text as day, s.position,
    to_char(s.start_time, 'HH24:MI') as start_time,
    s.duration_minutes, s.time_zone, s.status,
    s.arrived_at, s.completed_at, s.skipped_at, s.completion_source,
    s.highlight, s.created_at, s.updated_at, s.version
  `;
}

/** Renumbers a day's active visits 0..n-1, keeping their order. */
export async function renumberStops(tx: Tx, tripId: string, day: string): Promise<void> {
  await tx`
    update app.trip_stops s
    set position = ranked.position
    from (
      select s2.id, (row_number() over (order by s2.position, s2.created_at, s2.id) - 1)::int as position
      from app.trip_stops s2
      join app.trip_places tp on tp.id = s2.trip_place_id and tp.deleted_at is null
      where s2.trip_id = ${tripId} and s2.day = ${day}::date and s2.deleted_at is null
    ) as ranked
    where s.id = ranked.id and s.position <> ranked.position
  `;
}

/** How many active visits a day has (optionally not counting one). */
export async function stopsOnDay(tx: Tx, tripId: string, day: string, exceptStopId: string | null = null): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    select count(*)::int as count
    from app.trip_stops s
    join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
    where s.trip_id = ${tripId} and s.day = ${day}::date and s.deleted_at is null
      ${exceptStopId ? tx`and s.id <> ${exceptStopId}` : tx``}
  `;
  return row?.count ?? 0;
}

/** Next position at the end of a day. */
export function nextPosition(tx: Tx, tripId: string, day: string) {
  return tx`(
    select coalesce(max(s.position) + 1, 0)
    from app.trip_stops s
    join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
    where s.trip_id = ${tripId} and s.day = ${day}::date and s.deleted_at is null
  )`;
}

export interface OutsideStop {
  id: string;
  day: string;
  status: string;
}

/** Active visits on days that the dates [start, end] would no longer include (all of them when a date is missing). */
export async function stopsOutside(tx: Tx, tripId: string, start: string | null, end: string | null): Promise<OutsideStop[]> {
  return tx<OutsideStop[]>`
    select s.id, s.day::text as day, s.status
    from app.trip_stops s
    join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
    join app.places p on p.id = tp.place_id and p.deleted_at is null
    where s.trip_id = ${tripId} and s.deleted_at is null
      and (${start}::date is null or ${end}::date is null or s.day < ${start}::date or s.day > ${end}::date)
    order by s.day, s.position
  `;
}

/**
 * Trip dates changed: a stay whose nights were exactly the old trip dates
 * follows the new dates (no nights left → a whole-trip stay). Other stays are
 * the user's own choice and are left as they are.
 */
export async function moveTripLengthStay(
  tx: Tx,
  tripId: string,
  before: { start: string | null; end: string | null },
  after: { start: string | null; end: string | null },
): Promise<void> {
  if (!before.start || !before.end || before.end <= before.start) return;
  const nights = after.start && after.end && after.end > after.start;
  await tx`
    update app.trip_stays
    set check_in = ${nights ? after.start : null}::date,
        check_out = ${nights ? after.end : null}::date
    where trip_id = ${tripId} and deleted_at is null
      and check_in = ${before.start}::date and check_out = ${before.end}::date
  `;
}

/**
 * The Google hotel pinned through v1 (basePlaceId) as a place in the user's
 * collection (category "stay", ID only), reusing the one they already have.
 */
export async function hotelPlaceId(tx: Tx, user: AuthUser, googlePlaceId: string): Promise<string> {
  await tx`
    insert into app.places (owner_id, google_place_id, category)
    values (${user.id}, ${googlePlaceId}, 'stay')
    on conflict (owner_id, google_place_id) where google_place_id is not null do nothing
  `;
  const [row] = await tx<{ id: string }[]>`
    select id from app.places where owner_id = ${user.id} and google_place_id = ${googlePlaceId}
  `;
  if (!row) throw new Error('Hotel place upsert returned no row.');
  return row.id;
}

/**
 * Keeps the legacy trip fields (base_location, base_google_place_id) that v1
 * reads in step with the stays after a v2 change: the stay for the first night,
 * else the whole-trip stay, else the earliest. Writes only when a value changes.
 */
export async function syncLegacyBase(tx: Tx, tripId: string): Promise<void> {
  await tx`
    with t as (select id, start_date from app.trips where id = ${tripId}),
    primary_stay as (
      select s.label, p.google_place_id, p.name
      from app.trip_stays s
      cross join t
      left join app.places p on p.id = s.place_id
      where s.trip_id = t.id and s.deleted_at is null
      order by
        (s.check_in is not null and t.start_date is not null and s.check_in <= t.start_date and s.check_out > t.start_date) desc,
        (s.check_in is null) desc,
        s.check_in nulls last, s.created_at, s.id
      limit 1
    ),
    target as (
      select
        (select coalesce(label, case when google_place_id is null then name end) from primary_stay) as base_location,
        (select google_place_id from primary_stay) as base_google_place_id
    )
    update app.trips tr
    set base_location = target.base_location, base_google_place_id = target.base_google_place_id
    from target
    where tr.id = ${tripId}
      and (tr.base_location, tr.base_google_place_id) is distinct from (target.base_location, target.base_google_place_id)
  `;
}

/** The places stays point to (hotels), by id, for the stay responses. */
export async function stayPlaces(tx: Tx, user: AuthUser, placeIds: readonly (string | null)[]): Promise<Map<string, PlaceRow>> {
  const ids = [...new Set(placeIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await tx<PlaceRow[]>`
    select ${placeColumns(tx)} from app.places p
    where p.owner_id = ${user.id} and p.id in ${tx(ids)}
  `;
  return new Map(rows.map((row) => [row.id, row]));
}
