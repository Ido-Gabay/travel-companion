import { Injectable } from '@nestjs/common';
import type { PendingQuery, Row } from 'postgres';
import {
  TRIP_DAY_MAX_PLACES,
  type CreateTripData,
  type JournalDay,
  type ScheduleTripPlaceData,
  type TripJournal,
  type UpdateJournalDayData,
  type Trip,
  type TripDetail,
  type TripList,
  type UpdateTripData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { placeColumns } from '../places/place-columns.js';
import type { TripPlaceRow } from '../places/places.mapper.js';
import {
  findTrip,
  hotelPlaceId,
  invalid,
  moveTripLengthStay,
  nextPosition,
  renumberStops,
  stopsOnDay,
  stopsOutside,
  tripColumns,
  useNewerApp,
} from './trip-queries.js';
import { toJournalDay, toTrip, toTripDetail, type JournalDayRow, type TripRow } from './trips.mapper.js';

/** Upper bound until the list is paginated. Far above any personal trip count. */
export const TRIP_LIST_LIMIT = 200;

/**
 * API v1 trips. Since D1 the plan lives in visits (app.trip_stops): v1 reads
 * the legacy trip_places columns, which the database keeps equal to each
 * place's earliest active visit, and v1 writes are translated onto visits.
 * What v1 can't express (repeat visits, visit status, several stays) is
 * refused with 409 CONFLICT (reason USE_NEWER_APP) instead of guessed.
 */
@Injectable()
export class TripsService {
  constructor(private readonly db: DatabaseService) {}

  list(user: AuthUser): Promise<TripList> {
    return this.db.asUser(user, async (tx) => {
      const rows = await tx<TripRow[]>`
        select ${tripColumns(tx)}
        from app.trips t
        where t.owner_id = ${user.id} and t.deleted_at is null
        order by t.start_date asc nulls last, t.created_at desc
        limit ${TRIP_LIST_LIMIT}
      `;
      return { items: rows.map(toTrip) };
    });
  }

  get(user: AuthUser, tripId: string): Promise<TripDetail> {
    return this.db.asUser(user, (tx) => this.getInTx(tx, user, tripId));
  }

  create(user: AuthUser, input: CreateTripData): Promise<Trip> {
    return this.db.asUser(user, async (tx) => {
      // The profile row is created at sign-up; make sure it exists before the FK insert.
      await tx`insert into app.profiles (id) values (${user.id}) on conflict (id) do nothing`;
      const [inserted] = await tx<{ id: string }[]>`
        insert into app.trips (owner_id, title, destination, base_location, base_google_place_id, start_date, end_date)
        values (
          ${user.id},
          ${input.title},
          ${input.destination},
          ${input.baseLocation},
          ${input.basePlaceId},
          ${input.startDate}::date,
          ${input.endDate}::date
        )
        returning id
      `;
      if (!inserted) throw new Error('Trip insert returned no row.');
      // D1: "Staying at" / the pinned hotel become the trip's whole-trip stay.
      if (input.baseLocation !== null || input.basePlaceId !== null) {
        await tx`
          insert into app.trip_stays (owner_id, trip_id, place_id, label)
          values (
            ${user.id}, ${inserted.id},
            ${input.basePlaceId ? await hotelPlaceId(tx, user, input.basePlaceId) : null},
            ${input.baseLocation}
          )
        `;
      }
      return toTrip(await findTrip(tx, user, inserted.id));
    });
  }

  /**
   * Changes only the fields sent; null clears. Date order is also enforced by
   * the database. D1 Q5: dates that would leave visits outside are refused
   * (the older app can't ask first); the newer app gets the list via v2.
   */
  update(user: AuthUser, tripId: string, input: UpdateTripData): Promise<Trip> {
    return this.db.asUser(user, async (tx) => {
      const before = await findTrip(tx, user, tripId, true);
      const start = input.startDate !== undefined ? input.startDate : before.start_date;
      const end = input.endDate !== undefined ? input.endDate : before.end_date;
      const datesChange = start !== before.start_date || end !== before.end_date;

      if (datesChange) {
        if (start && end && end < start) throw invalid('endDate', 'End date must be on or after the start date.');
        const outside = await stopsOutside(tx, tripId, start, end);
        if (outside.length > 0) {
          throw new ApiException(
            400,
            'VALIDATION_FAILED',
            'Some places are planned on days outside the new dates. Move them to other days or back to the wishlist first.',
            [{ path: 'endDate', message: `${outside.length} planned place(s) fall outside the new dates.` }],
          );
        }
      }

      const location = input.baseLocation !== undefined ? input.baseLocation : before.base_location;
      const hotel = input.basePlaceId !== undefined ? input.basePlaceId : before.base_google_place_id;
      if (location !== before.base_location || hotel !== before.base_google_place_id) {
        await this.syncStayFromBase(tx, user, before, location, hotel);
      }

      const sets: PendingQuery<Row[]>[] = [];
      if (input.title !== undefined) sets.push(tx`title = ${input.title}`);
      if (input.destination !== undefined) sets.push(tx`destination = ${input.destination}`);
      if (input.baseLocation !== undefined) sets.push(tx`base_location = ${input.baseLocation}`);
      if (input.basePlaceId !== undefined) sets.push(tx`base_google_place_id = ${input.basePlaceId}`);
      if (input.startDate !== undefined) sets.push(tx`start_date = ${input.startDate}::date`);
      if (input.endDate !== undefined) sets.push(tx`end_date = ${input.endDate}::date`);
      const assignments = sets.reduce((all, next) => tx`${all}, ${next}`);
      await tx`
        update app.trips set ${assignments}
        where id = ${tripId} and owner_id = ${user.id} and deleted_at is null
      `;
      if (datesChange) {
        await moveTripLengthStay(tx, tripId, { start: before.start_date, end: before.end_date }, { start, end });
      }
      return toTrip(await findTrip(tx, user, tripId));
    });
  }

  /** Soft delete. Its places, visits and stays stay but are hidden with the trip; completed visits stay in place history. */
  remove(user: AuthUser, tripId: string): Promise<void> {
    return this.db.asUser(user, async (tx) => {
      const [row] = await tx<{ deleted_at: Date }[]>`
        update app.trips set deleted_at = now()
        where id = ${tripId} and owner_id = ${user.id} and deleted_at is null
        returning deleted_at
      `;
      if (!row) throw notFound('Trip not found.');
      // A3: stays are soft-deleted with their trip.
      await tx`update app.trip_stays set deleted_at = ${row.deleted_at} where trip_id = ${tripId} and deleted_at is null`;
    });
  }

  /** Adds a place from the user's collection to a trip. Adding twice is a no-op. */
  addPlace(user: AuthUser, tripId: string, placeId: string): Promise<TripDetail> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const [place] = await tx`
        select id from app.places
        where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
      `;
      if (!place) throw notFound('Place not found.');

      await tx`
        insert into app.trip_places (owner_id, trip_id, place_id)
        values (${user.id}, ${tripId}, ${placeId})
        on conflict (trip_id, place_id) do update
          set deleted_at = null, created_at = now()
          where app.trip_places.deleted_at is not null
      `;
      return this.getInTx(tx, user, tripId);
    });
  }

  /**
   * Removes a place from a trip (and its plan). The place stays in the
   * collection; visits that already happened (done, skipped) stay in history.
   * Idempotent.
   */
  removePlace(user: AuthUser, tripId: string, placeId: string): Promise<TripDetail> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const [link] = await tx<{ id: string }[]>`
        select id from app.trip_places
        where trip_id = ${tripId} and place_id = ${placeId}
          and owner_id = ${user.id} and deleted_at is null
        for update
      `;
      if (link) await removeMembership(tx, tripId, link.id);
      return this.getInTx(tx, user, tripId);
    });
  }

  /**
   * Plans a trip place for a day (appended at the end of that day; a time it
   * already has is kept), sets or clears its time, or moves it back to the
   * wishlist (day null, which also clears the time). D1: acts on the place's
   * single visit; places with several visits, or a visit that already
   * happened, need the newer app (409).
   */
  schedulePlace(
    user: AuthUser,
    tripId: string,
    placeId: string,
    input: ScheduleTripPlaceData,
  ): Promise<TripDetail> {
    return this.db.asUser(user, async (tx) => {
      const trip = await findTrip(tx, user, tripId);
      const [link] = await tx<{ id: string; duration_minutes: number | null; highlight: boolean }[]>`
        select tp.id, tp.duration_minutes, tp.highlight
        from app.trip_places tp
        join app.places p on p.id = tp.place_id and p.deleted_at is null
        where tp.trip_id = ${tripId} and tp.place_id = ${placeId}
          and tp.owner_id = ${user.id} and tp.deleted_at is null
        for update of tp
      `;
      if (!link) throw notFound('This place is not in the trip.');

      const stops = await tx<{ id: string; day: string; status: string }[]>`
        select id, day::text as day, status from app.trip_stops
        where trip_place_id = ${link.id} and deleted_at is null
        order by day, position, created_at, id
        for update
      `;
      if (stops.length > 1) throw useNewerApp('This place has several visits in the trip.');
      const stop = stops[0] ?? null;

      const day = input.day === undefined ? (stop?.day ?? null) : input.day;
      if (input.day !== undefined && input.day !== null) {
        if (!trip.start_date || !trip.end_date) {
          throw invalid('day', 'Set the trip dates before planning days.');
        }
        if (input.day < trip.start_date || input.day > trip.end_date) {
          throw invalid('day', 'The day must be within the trip dates.');
        }
      }
      if (typeof input.startTime === 'string' && day === null) {
        throw invalid('startTime', 'Plan the place for a day before setting a time.');
      }
      // A visit that already happened (in progress counts as planned here) keeps its day, time and length.
      if (stop && stop.status !== 'planned' && stop.status !== 'in_progress') {
        if (day !== stop.day || input.startTime !== undefined || input.durationMinutes !== undefined) {
          throw useNewerApp('This visit is already done or skipped.');
        }
      }

      if (!stop) {
        if (day !== null) {
          if ((await stopsOnDay(tx, tripId, day)) >= TRIP_DAY_MAX_PLACES) {
            throw invalid('day', `A day can hold up to ${TRIP_DAY_MAX_PLACES} places.`);
          }
          // A wishlist place's length and star (kept on the membership) move onto its new visit.
          await tx`
            insert into app.trip_stops (owner_id, trip_id, trip_place_id, day, position, start_time, duration_minutes, highlight)
            values (
              ${user.id}, ${tripId}, ${link.id}, ${day}::date, ${nextPosition(tx, tripId, day)},
              ${typeof input.startTime === 'string' ? input.startTime : null}::time,
              ${input.durationMinutes !== undefined ? input.durationMinutes : link.duration_minutes},
              ${input.highlight !== undefined ? input.highlight : link.highlight}
            )
          `;
        } else {
          // Still on the wishlist: length and star live on the membership.
          if (input.durationMinutes !== undefined) {
            await tx`update app.trip_places set duration_minutes = ${input.durationMinutes} where id = ${link.id}`;
          }
          if (input.highlight !== undefined) {
            await tx`update app.trip_places set highlight = ${input.highlight} where id = ${link.id}`;
          }
        }
        return this.getInTx(tx, user, tripId);
      }

      if (day === null) {
        // Back to the wishlist: the planned visit is removed (soft); length and star stay on the membership.
        await tx`update app.trip_stops set deleted_at = now() where id = ${stop.id}`;
        await renumberStops(tx, tripId, stop.day);
        if (input.durationMinutes !== undefined) {
          await tx`update app.trip_places set duration_minutes = ${input.durationMinutes} where id = ${link.id}`;
        }
        if (input.highlight !== undefined) {
          await tx`update app.trip_places set highlight = ${input.highlight} where id = ${link.id}`;
        }
        return this.getInTx(tx, user, tripId);
      }

      if (day !== stop.day) {
        if ((await stopsOnDay(tx, tripId, day, stop.id)) >= TRIP_DAY_MAX_PLACES) {
          throw invalid('day', `A day can hold up to ${TRIP_DAY_MAX_PLACES} places.`);
        }
        await tx`
          update app.trip_stops
          set day = ${day}::date, position = ${nextPosition(tx, tripId, day)}
          where id = ${stop.id}
        `;
        await renumberStops(tx, tripId, stop.day);
      }
      if (input.startTime !== undefined) {
        await tx`update app.trip_stops set start_time = ${input.startTime}::time where id = ${stop.id}`;
      }
      if (input.durationMinutes !== undefined) {
        await tx`update app.trip_stops set duration_minutes = ${input.durationMinutes} where id = ${stop.id}`;
      }
      if (input.highlight !== undefined) {
        await tx`update app.trip_stops set highlight = ${input.highlight} where id = ${stop.id}`;
      }
      return this.getInTx(tx, user, tripId);
    });
  }

  /**
   * Sets the order of one day. placeIds must be exactly the places planned for
   * that day, each with one visit there (else 409: the day changed, or it has
   * repeat visits only the newer app shows).
   */
  reorderDay(user: AuthUser, tripId: string, day: string, placeIds: string[]): Promise<TripDetail> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const current = await tx<{ id: string; place_id: string }[]>`
        select s.id, tp.place_id
        from app.trip_stops s
        join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
        join app.places p on p.id = tp.place_id and p.deleted_at is null
        where s.trip_id = ${tripId} and s.owner_id = ${user.id}
          and s.day = ${day}::date and s.deleted_at is null
        for update of s
      `;
      const byPlace = new Map<string, string>();
      for (const row of current) {
        if (byPlace.has(row.place_id)) throw useNewerApp('This day has more than one visit to the same place.');
        byPlace.set(row.place_id, row.id);
      }
      if (byPlace.size !== placeIds.length || placeIds.some((id) => !byPlace.has(id))) {
        throw new ApiException(
          409,
          'CONFLICT',
          'The day changed since it was loaded. Refresh and try again.',
        );
      }
      const stopIds = placeIds.map((id) => byPlace.get(id)!);
      await tx`
        update app.trip_stops s
        set position = ordered.position
        from (
          select id, (ordinality - 1)::int as position
          from unnest(${tx.array(stopIds)}::uuid[]) with ordinality as list(id, ordinality)
        ) as ordered
        where s.id = ordered.id and s.position <> ordered.position
      `;
      return this.getInTx(tx, user, tripId);
    });
  }

  /** M15: the trip's journal (days with a note or rating). */
  getJournal(user: AuthUser, tripId: string): Promise<TripJournal> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      return { days: (await journalRows(tx, user, tripId)).map(toJournalDay) };
    });
  }

  /** M15: sets a day's note and/or rating (creates the entry on first write). */
  updateJournalDay(user: AuthUser, tripId: string, day: string, input: UpdateJournalDayData): Promise<JournalDay> {
    return this.db.asUser(user, async (tx) => {
      const trip = await findTrip(tx, user, tripId);
      if (!trip.start_date || !trip.end_date || day < trip.start_date || day > trip.end_date) {
        throw invalid('day', 'The day must be within the trip dates.');
      }
      const note = input.note === undefined ? null : input.note;
      const rating = input.rating === undefined ? null : input.rating;
      // Insert, or update only the fields that were sent.
      const [row] = await tx<JournalDayRow[]>`
        insert into app.trip_journal_days (owner_id, trip_id, day, note, rating)
        values (${user.id}, ${tripId}, ${day}::date, ${note}, ${rating})
        on conflict (trip_id, day) do update set
          note = case when ${input.note !== undefined} then excluded.note else app.trip_journal_days.note end,
          rating = case when ${input.rating !== undefined} then excluded.rating else app.trip_journal_days.rating end,
          version = app.trip_journal_days.version + 1
        returning day::text as day, note, rating, updated_at
      `;
      if (!row) throw invalid('day', 'Could not save the journal entry.');
      return toJournalDay(row);
    });
  }

  /**
   * v1 "Staying at" / pinned hotel changed: update the trip's single
   * whole-trip stay (no dates, or exactly the trip's nights), create one, or
   * remove it when both are cleared. Several or partial stays → 409.
   */
  private async syncStayFromBase(
    tx: Tx,
    user: AuthUser,
    trip: TripRow,
    location: string | null,
    hotelGoogleId: string | null,
  ): Promise<void> {
    const stays = await tx<{ id: string; check_in: string | null; check_out: string | null }[]>`
      select id, check_in::text as check_in, check_out::text as check_out
      from app.trip_stays
      where trip_id = ${trip.id} and deleted_at is null
      for update
    `;
    const wholeTrip = (stay: { check_in: string | null; check_out: string | null }) =>
      stay.check_in === null || (stay.check_in === trip.start_date && stay.check_out === trip.end_date);
    if (stays.length > 1 || (stays.length === 1 && !wholeTrip(stays[0]!))) {
      throw useNewerApp('This trip has stays for different nights.');
    }
    const stay = stays[0] ?? null;
    const placeId = hotelGoogleId ? await hotelPlaceId(tx, user, hotelGoogleId) : null;
    if (location === null && placeId === null) {
      if (stay) await tx`update app.trip_stays set deleted_at = now() where id = ${stay.id}`;
      return;
    }
    if (stay) {
      // A different hotel: a zone derived for the old one no longer applies; one the user confirmed stays theirs.
      await tx`
        update app.trip_stays
        set label = ${location}, place_id = ${placeId},
            time_zone = case when time_zone_source = 'derived' and place_id is distinct from ${placeId}::uuid then null else time_zone end,
            time_zone_dataset = case when time_zone_source = 'derived' and place_id is distinct from ${placeId}::uuid then null else time_zone_dataset end,
            time_zone_source = case when time_zone_source = 'derived' and place_id is distinct from ${placeId}::uuid then null else time_zone_source end
        where id = ${stay.id}
      `;
      return;
    }
    await tx`
      insert into app.trip_stays (owner_id, trip_id, place_id, label)
      values (${user.id}, ${trip.id}, ${placeId}, ${location})
    `;
  }

  private async getInTx(tx: Tx, user: AuthUser, tripId: string): Promise<TripDetail> {
    const trip = await findTrip(tx, user, tripId);
    const places = await tx<TripPlaceRow[]>`
      select ${placeColumns(tx)},
        tp.created_at as added_at,
        tp.day::text as day,
        to_char(tp.start_time, 'HH24:MI') as start_time,
        tp.position,
        tp.duration_minutes,
        tp.highlight
      from app.trip_places tp
      join app.places p on p.id = tp.place_id and p.deleted_at is null
      where tp.trip_id = ${tripId} and tp.owner_id = ${user.id} and tp.deleted_at is null
      order by tp.day asc nulls last, tp.position asc, tp.created_at asc
    `;
    return toTripDetail(trip, places);
  }
}

/**
 * Takes a place out of a trip: the membership and its planned visits are
 * removed (soft); visits that already happened (in progress counts as
 * planned) stay in history. With nothing left, the old "length" is cleared
 * as before D1.
 */
export async function removeMembership(tx: Tx, tripId: string, tripPlaceId: string): Promise<void> {
  const removed = await tx<{ day: string }[]>`
    update app.trip_stops set deleted_at = now()
    where trip_place_id = ${tripPlaceId} and deleted_at is null and status in ('planned', 'in_progress')
    returning day::text as day
  `;
  await tx`
    update app.trip_places
    set deleted_at = now(),
        duration_minutes = case
          when exists (select 1 from app.trip_stops s where s.trip_place_id = ${tripPlaceId} and s.deleted_at is null)
          then duration_minutes else null end
    where id = ${tripPlaceId}
  `;
  for (const day of new Set(removed.map((row) => row.day))) await renumberStops(tx, tripId, day);
}

async function journalRows(tx: Tx, user: AuthUser, tripId: string): Promise<JournalDayRow[]> {
  return tx<JournalDayRow[]>`
    select day::text as day, note, rating, updated_at
    from app.trip_journal_days
    where trip_id = ${tripId} and owner_id = ${user.id}
      and (note is not null or rating is not null)
    order by day
  `;
}
