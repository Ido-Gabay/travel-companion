import { Injectable } from '@nestjs/common';
import {
  TRIP_DAY_MAX_PLACES,
  type AddStopData,
  type StopTransition,
  type StopTransitionData,
  type StopWriteResponse,
  type TimeZoneSuggestion,
  type TripDetailV2,
  type UpdateStopData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { TimeZonesService } from '../timezones/timezones.service.js';
import {
  conflict,
  findTrip,
  invalid,
  nextPosition,
  renumberStops,
  stopColumns,
  stopsOnDay,
} from './trip-queries.js';
import { toStop, type StopRow, type TripRow } from './trips.mapper.js';
import { TripsV2Service } from './trips-v2.service.js';
import { decideZone, placePin } from './zone-input.js';

/** An offline action may arrive late, but not from the future (small clock skew allowed). */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * D1 · Visits (API v2). A visit belongs to a place saved to the trip; a place
 * can be visited any number of times. Lifecycle: planned → in_progress →
 * completed, or → skipped; reset returns to planned. Repeating the transition
 * a visit is already in is a no-op (safe retries); anything else that
 * doesn't fit is 409 INVALID_TRANSITION.
 */
@Injectable()
export class StopsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly timeZones: TimeZonesService,
    private readonly trips: TripsV2Service,
  ) {}

  add(user: AuthUser, tripId: string, input: AddStopData): Promise<StopWriteResponse> {
    return this.db.asUser(user, async (tx) => {
      const trip = await findTrip(tx, user, tripId);
      if (input.id) {
        // Idempotent retry of an offline-created visit.
        const existing = await findStop(tx, user, input.id, false);
        if (existing) {
          if (existing.trip_id !== tripId) throw conflict('This visit id is already used.', 'ID_IN_USE');
          return { stop: toStop(existing), timeZoneSuggestion: null };
        }
      }
      const membership = await findMembership(tx, user, tripId, input.tripPlaceId);
      checkDay(trip, input.day);
      if ((await stopsOnDay(tx, tripId, input.day)) >= TRIP_DAY_MAX_PLACES) {
        throw invalid('day', `A day can hold up to ${TRIP_DAY_MAX_PLACES} visits.`);
      }
      const zone = decideZone(this.timeZones, input, await placePin(tx, user.id, membership.place_id), true);
      const [row] = await tx<{ id: string }[]>`
        insert into app.trip_stops (
          id, owner_id, trip_id, trip_place_id, day, position, start_time, duration_minutes, highlight, time_zone
        ) values (
          coalesce(${input.id ?? null}::uuid, gen_random_uuid()), ${user.id}, ${tripId}, ${membership.id},
          ${input.day}::date, ${nextPosition(tx, tripId, input.day)},
          ${input.startTime ?? null}::time,
          ${input.durationMinutes !== undefined ? input.durationMinutes : membership.duration_minutes},
          ${input.highlight ?? false},
          ${zone.store ? zone.store.timeZone : null}
        )
        returning id
      `;
      return this.respond(tx, user, row!.id, zone.suggestion);
    });
  }

  update(user: AuthUser, tripId: string, stopId: string, input: UpdateStopData): Promise<StopWriteResponse> {
    return this.db.asUser(user, async (tx) => {
      const trip = await findTrip(tx, user, tripId);
      const stop = await activeStop(tx, user, tripId, stopId);
      const planChange =
        input.day !== undefined ||
        input.startTime !== undefined ||
        input.durationMinutes !== undefined ||
        input.tripPlaceId !== undefined;
      if (planChange && stop.status !== 'planned' && stop.status !== 'in_progress') {
        throw new ApiException(409, 'INVALID_TRANSITION', 'A visit that is done or skipped keeps its day, time, length and place.');
      }

      let suggestion: TimeZoneSuggestion | null = null;
      if (input.tripPlaceId !== undefined && input.tripPlaceId !== stop.trip_place_id) {
        const membership = await findMembership(tx, user, tripId, input.tripPlaceId);
        // A different place: its own zone (explicit, or derived from its pin), else none.
        const zone = decideZone(this.timeZones, input, await placePin(tx, user.id, membership.place_id), true);
        suggestion = zone.suggestion;
        await tx`
          update app.trip_stops
          set trip_place_id = ${membership.id}, time_zone = ${zone.store ? zone.store.timeZone : null}
          where id = ${stop.id}
        `;
      } else if (input.timeZone !== undefined || input.location !== undefined) {
        const zone = decideZone(this.timeZones, input, null, false);
        suggestion = zone.suggestion;
        if (zone.store !== undefined) {
          await tx`update app.trip_stops set time_zone = ${zone.store ? zone.store.timeZone : null} where id = ${stop.id}`;
        }
      }

      if (input.day !== undefined && input.day !== stop.day) {
        checkDay(trip, input.day);
        if ((await stopsOnDay(tx, tripId, input.day, stop.id)) >= TRIP_DAY_MAX_PLACES) {
          throw invalid('day', `A day can hold up to ${TRIP_DAY_MAX_PLACES} visits.`);
        }
        await tx`
          update app.trip_stops set day = ${input.day}::date, position = ${nextPosition(tx, tripId, input.day)}
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
      return this.respond(tx, user, stop.id, suggestion);
    });
  }

  transition(
    user: AuthUser,
    tripId: string,
    stopId: string,
    action: StopTransition,
    input: StopTransitionData,
  ): Promise<StopWriteResponse> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const stop = await activeStop(tx, user, tripId, stopId);
      if (input.at && Date.parse(input.at) > Date.now() + FUTURE_SKEW_MS) {
        throw invalid('at', 'The time of a visit change cannot be in the future.');
      }
      const at = input.at ?? null;
      const from = stop.status;
      const refuse = () =>
        new ApiException(409, 'INVALID_TRANSITION', `A ${from.replace('_', ' ')} visit can't ${action}.`, [
          { path: 'status', message: from },
        ]);

      switch (action) {
        case 'arrive':
          if (from === 'in_progress') break;
          if (from !== 'planned') throw refuse();
          await tx`
            update app.trip_stops set status = 'in_progress', arrived_at = coalesce(${at}::timestamptz, now())
            where id = ${stop.id}
          `;
          break;
        case 'complete':
          if (from === 'completed') break;
          if (from === 'skipped') throw refuse();
          await tx`
            update app.trip_stops
            set status = 'completed', completed_at = coalesce(${at}::timestamptz, now()), completion_source = 'user'
            where id = ${stop.id}
          `;
          break;
        case 'skip':
          if (from === 'skipped') break;
          if (from === 'completed') throw refuse();
          await tx`
            update app.trip_stops set status = 'skipped', skipped_at = coalesce(${at}::timestamptz, now())
            where id = ${stop.id}
          `;
          break;
        case 'reset':
          if (from === 'planned') break;
          await tx`
            update app.trip_stops
            set status = 'planned', arrived_at = null, completed_at = null, skipped_at = null, completion_source = null
            where id = ${stop.id}
          `;
          break;
      }
      return this.respond(tx, user, stop.id, null);
    });
  }

  /** Removes a visit (soft). A completed visit is part of history: removing it needs confirm. Idempotent. */
  remove(user: AuthUser, tripId: string, stopId: string, confirm: boolean): Promise<TripDetailV2> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const stop = await findStop(tx, user, stopId, true);
      if (stop && stop.trip_id === tripId) {
        if (stop.status === 'completed' && !confirm) {
          throw conflict('This visit is done. Removing it also removes it from the place history; confirm to remove.', 'CONFIRM_REQUIRED');
        }
        await tx`update app.trip_stops set deleted_at = now() where id = ${stop.id}`;
        await renumberStops(tx, tripId, stop.day);
      }
      return this.trips.detailInTx(tx, user, tripId);
    });
  }

  /** Sets the order of one day: stopIds must be exactly that day's active visits. */
  reorder(user: AuthUser, tripId: string, day: string, stopIds: string[]): Promise<TripDetailV2> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const current = await tx<{ id: string }[]>`
        select s.id
        from app.trip_stops s
        join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
        join app.places p on p.id = tp.place_id and p.deleted_at is null
        where s.trip_id = ${tripId} and s.owner_id = ${user.id} and s.day = ${day}::date and s.deleted_at is null
        for update of s
      `;
      const ids = new Set(current.map((row) => row.id));
      if (ids.size !== stopIds.length || stopIds.some((id) => !ids.has(id))) {
        throw conflict('The day changed since it was loaded. Refresh and try again.', 'DAY_CHANGED');
      }
      await tx`
        update app.trip_stops s
        set position = ordered.position
        from (
          select id, (ordinality - 1)::int as position
          from unnest(${tx.array(stopIds)}::uuid[]) with ordinality as list(id, ordinality)
        ) as ordered
        where s.id = ordered.id and s.position <> ordered.position
      `;
      return this.trips.detailInTx(tx, user, tripId);
    });
  }

  private async respond(tx: Tx, user: AuthUser, stopId: string, suggestion: TimeZoneSuggestion | null): Promise<StopWriteResponse> {
    const row = await findStop(tx, user, stopId, false);
    if (!row) throw new Error('Visit not found after write.');
    return { stop: toStop(row), timeZoneSuggestion: suggestion };
  }
}

function checkDay(trip: TripRow, day: string): void {
  if (!trip.start_date || !trip.end_date) throw invalid('day', 'Set the trip dates before planning days.');
  if (day < trip.start_date || day > trip.end_date) throw invalid('day', 'The day must be within the trip dates.');
}

interface MembershipRow {
  id: string;
  place_id: string;
  duration_minutes: number | null;
}

async function findMembership(tx: Tx, user: AuthUser, tripId: string, tripPlaceId: string): Promise<MembershipRow> {
  const [row] = await tx<MembershipRow[]>`
    select tp.id, tp.place_id, tp.duration_minutes
    from app.trip_places tp
    join app.places p on p.id = tp.place_id and p.deleted_at is null
    where tp.id = ${tripPlaceId} and tp.trip_id = ${tripId} and tp.owner_id = ${user.id} and tp.deleted_at is null
  `;
  if (!row) throw notFound('This place is not saved to the trip.');
  return row;
}

async function findStop(tx: Tx, user: AuthUser, stopId: string, lock: boolean): Promise<StopRow | null> {
  const [row] = await tx<(StopRow & { deleted_at: Date | null })[]>`
    select ${stopColumns(tx)}, s.deleted_at
    from app.trip_stops s
    join app.trip_places tp on tp.id = s.trip_place_id
    where s.id = ${stopId} and s.owner_id = ${user.id}
    ${lock ? tx`for update of s` : tx``}
  `;
  if (!row || (lock && row.deleted_at)) return null;
  return row;
}

/** A visit the user can still change: not removed, its place still saved to the trip and in the collection. */
async function activeStop(tx: Tx, user: AuthUser, tripId: string, stopId: string): Promise<StopRow> {
  const [row] = await tx<StopRow[]>`
    select ${stopColumns(tx)}
    from app.trip_stops s
    join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
    join app.places p on p.id = tp.place_id and p.deleted_at is null
    where s.id = ${stopId} and s.trip_id = ${tripId} and s.owner_id = ${user.id} and s.deleted_at is null
    for update of s
  `;
  if (!row) throw notFound('Visit not found.');
  return row;
}
