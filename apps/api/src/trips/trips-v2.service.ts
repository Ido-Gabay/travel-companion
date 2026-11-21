import { Injectable } from '@nestjs/common';
import type { PendingQuery, Row } from 'postgres';
import type { AddTripMemberInput, TripDetailV2, TripV2, UpdateTripV2Data } from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { placeColumns } from '../places/place-columns.js';
import { conflict, findTrip, invalid, moveTripLengthStay, stayPlaces, stopColumns, stopsOutside } from './trip-queries.js';
import {
  toStay,
  toStop,
  toTripMember,
  toTripV2,
  type StayRow,
  type StopRow,
  type TripMemberRow,
} from './trips.mapper.js';
import { removeMembership } from './trips.service.js';

/** D1 · Trips (API v2): the trip with its saved places, visits and stays. */
@Injectable()
export class TripsV2Service {
  constructor(private readonly db: DatabaseService) {}

  get(user: AuthUser, tripId: string): Promise<TripDetailV2> {
    return this.db.asUser(user, (tx) => this.detailInTx(tx, user, tripId));
  }

  /**
   * D1 Q5: dates that leave visits outside are refused with the list
   * (409 STOPS_OUTSIDE_DATES) unless unscheduleOutside: then planned visits
   * outside are removed. Visits in progress, done or skipped are never removed.
   */
  update(user: AuthUser, tripId: string, input: UpdateTripV2Data): Promise<TripV2> {
    return this.db.asUser(user, async (tx) => {
      const before = await findTrip(tx, user, tripId, true);
      const start = input.startDate !== undefined ? input.startDate : before.start_date;
      const end = input.endDate !== undefined ? input.endDate : before.end_date;
      const datesChange = start !== before.start_date || end !== before.end_date;

      if (datesChange) {
        if (start && end && end < start) throw invalid('endDate', 'End date must be on or after the start date.');
        const outside = await stopsOutside(tx, tripId, start, end);
        const happened = outside.filter((stop) => stop.status !== 'planned');
        if (happened.length > 0 || (outside.length > 0 && !input.unscheduleOutside)) {
          throw new ApiException(
            409,
            'STOPS_OUTSIDE_DATES',
            happened.length > 0
              ? 'Visits that already started or happened fall outside the new dates; they are never removed.'
              : 'Some planned visits fall outside the new dates. Send unscheduleOutside: true to remove them.',
            outside.map((stop) => ({ path: `stops.${stop.id}`, message: `${stop.day} ${stop.status}` })),
          );
        }
        if (outside.length > 0) {
          await tx`update app.trip_stops set deleted_at = now() where id in ${tx(outside.map((stop) => stop.id))}`;
        }
      }

      const sets: PendingQuery<Row[]>[] = [];
      if (input.title !== undefined) sets.push(tx`title = ${input.title}`);
      if (input.destination !== undefined) sets.push(tx`destination = ${input.destination}`);
      if (input.startDate !== undefined) sets.push(tx`start_date = ${input.startDate}::date`);
      if (input.endDate !== undefined) sets.push(tx`end_date = ${input.endDate}::date`);
      if (input.timeZone !== undefined) {
        sets.push(tx`time_zone = ${input.timeZone}`);
        sets.push(tx`time_zone_source = ${input.timeZone === null ? null : 'user'}`);
      }
      if (sets.length > 0) {
        const assignments = sets.reduce((all, next) => tx`${all}, ${next}`);
        await tx`update app.trips set ${assignments} where id = ${tripId} and owner_id = ${user.id}`;
      }
      if (datesChange) {
        await moveTripLengthStay(tx, tripId, { start: before.start_date, end: before.end_date }, { start, end });
      }
      return toTripV2(await findTrip(tx, user, tripId));
    });
  }

  /**
   * Soft delete with its stays (A3). D1 Q4: completed visits stay in place
   * history unless deleteHistory is set (the app asks, separately).
   */
  remove(user: AuthUser, tripId: string, deleteHistory: boolean): Promise<void> {
    return this.db.asUser(user, async (tx) => {
      const [row] = await tx<{ deleted_at: Date }[]>`
        update app.trips set deleted_at = now()
        where id = ${tripId} and owner_id = ${user.id} and deleted_at is null
        returning deleted_at
      `;
      if (!row) throw notFound('Trip not found.');
      await tx`update app.trip_stays set deleted_at = ${row.deleted_at} where trip_id = ${tripId} and deleted_at is null`;
      if (deleteHistory) {
        await tx`update app.trip_stops set deleted_at = ${row.deleted_at} where trip_id = ${tripId} and deleted_at is null`;
      }
    });
  }

  /** Saves a place to the trip (no visit). Saving again is a no-op and returns the existing membership. */
  addMember(user: AuthUser, tripId: string, input: AddTripMemberInput): Promise<TripDetailV2> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const [place] = await tx`
        select id from app.places where id = ${input.placeId} and owner_id = ${user.id} and deleted_at is null
      `;
      if (!place) throw notFound('Place not found.');
      if (input.id) {
        const [taken] = await tx<{ trip_id: string; place_id: string }[]>`
          select trip_id, place_id from app.trip_places where id = ${input.id}
        `;
        if (taken && (taken.trip_id !== tripId || taken.place_id !== input.placeId)) {
          throw conflict('This id is already used.', 'ID_IN_USE');
        }
      }
      await tx`
        insert into app.trip_places (id, owner_id, trip_id, place_id)
        values (coalesce(${input.id ?? null}::uuid, gen_random_uuid()), ${user.id}, ${tripId}, ${input.placeId})
        on conflict (trip_id, place_id) do update
          set deleted_at = null, created_at = now()
          where app.trip_places.deleted_at is not null
      `;
      return this.detailInTx(tx, user, tripId);
    });
  }

  /** Removes a saved place from the trip; planned visits go with it, visits that happened stay in history. Idempotent. */
  removeMember(user: AuthUser, tripId: string, tripPlaceId: string): Promise<TripDetailV2> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      const [link] = await tx<{ id: string }[]>`
        select id from app.trip_places
        where id = ${tripPlaceId} and trip_id = ${tripId} and owner_id = ${user.id} and deleted_at is null
        for update
      `;
      if (link) await removeMembership(tx, tripId, link.id);
      return this.detailInTx(tx, user, tripId);
    });
  }

  async detailInTx(tx: Tx, user: AuthUser, tripId: string): Promise<TripDetailV2> {
    const trip = await findTrip(tx, user, tripId);
    const places = await tx<TripMemberRow[]>`
      select ${placeColumns(tx)}, tp.id as trip_place_id, tp.created_at as saved_at
      from app.trip_places tp
      join app.places p on p.id = tp.place_id and p.deleted_at is null
      where tp.trip_id = ${tripId} and tp.owner_id = ${user.id} and tp.deleted_at is null
      order by tp.created_at, tp.id
    `;
    const stops = await tx<StopRow[]>`
      select ${stopColumns(tx)}
      from app.trip_stops s
      join app.trip_places tp on tp.id = s.trip_place_id and tp.deleted_at is null
      join app.places p on p.id = tp.place_id and p.deleted_at is null
      where s.trip_id = ${tripId} and s.owner_id = ${user.id} and s.deleted_at is null
      order by s.day, s.position, s.created_at, s.id
    `;
    const stays = await tx<StayRow[]>`
      select s.id, s.trip_id, s.place_id, s.label,
        s.check_in::text as check_in, s.check_out::text as check_out,
        s.time_zone, s.time_zone_source, s.created_at, s.updated_at, s.version
      from app.trip_stays s
      where s.trip_id = ${tripId} and s.owner_id = ${user.id} and s.deleted_at is null
      order by s.check_in nulls first, s.created_at, s.id
    `;
    const hotels = await stayPlaces(tx, user, stays.map((stay) => stay.place_id));
    return {
      trip: toTripV2(trip),
      places: places.map(toTripMember),
      stops: stops.map(toStop),
      stays: stays.map((stay) => toStay(stay, hotels)),
    };
  }
}

