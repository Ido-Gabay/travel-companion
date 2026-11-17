import { Injectable } from '@nestjs/common';
import type { PendingQuery, Row } from 'postgres';
import type { CreateTripData, Trip, TripDetail, TripList, UpdateTripData } from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { placeColumns } from '../places/place-columns.js';
import type { TripPlaceRow } from '../places/places.mapper.js';
import { toTrip, toTripDetail, type TripRow } from './trips.mapper.js';

/** Upper bound until the list is paginated. Far above any personal trip count. */
export const TRIP_LIST_LIMIT = 200;

/** Shared column list for a trip row, including how many live places it has. */
function tripColumns(tx: Tx) {
  return tx`
    t.id, t.title, t.destination,
    t.start_date::text as start_date,
    t.end_date::text as end_date,
    t.base_location,
    (
      select count(*)::int
      from app.trip_places tp
      join app.places p on p.id = tp.place_id and p.deleted_at is null
      where tp.trip_id = t.id and tp.deleted_at is null
    ) as place_count,
    t.created_at, t.updated_at, t.version
  `;
}

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
        insert into app.trips (owner_id, title, destination, base_location, start_date, end_date)
        values (
          ${user.id},
          ${input.title},
          ${input.destination},
          ${input.baseLocation},
          ${input.startDate}::date,
          ${input.endDate}::date
        )
        returning id
      `;
      if (!inserted) throw new Error('Trip insert returned no row.');
      return toTrip(await findTrip(tx, user, inserted.id));
    });
  }

  /** Changes only the fields sent; null clears. Date order is also enforced by the database. */
  update(user: AuthUser, tripId: string, input: UpdateTripData): Promise<Trip> {
    return this.db.asUser(user, async (tx) => {
      const sets: PendingQuery<Row[]>[] = [];
      if (input.title !== undefined) sets.push(tx`title = ${input.title}`);
      if (input.destination !== undefined) sets.push(tx`destination = ${input.destination}`);
      if (input.baseLocation !== undefined) sets.push(tx`base_location = ${input.baseLocation}`);
      if (input.startDate !== undefined) sets.push(tx`start_date = ${input.startDate}::date`);
      if (input.endDate !== undefined) sets.push(tx`end_date = ${input.endDate}::date`);
      const assignments = sets.reduce((all, next) => tx`${all}, ${next}`);

      const rows = await tx`
        update app.trips set ${assignments}
        where id = ${tripId} and owner_id = ${user.id} and deleted_at is null
        returning id
      `;
      if (rows.length === 0) throw notFound('Trip not found.');
      return toTrip(await findTrip(tx, user, tripId));
    });
  }

  /** Soft delete. The trip's place links stay but are hidden with the trip. */
  remove(user: AuthUser, tripId: string): Promise<void> {
    return this.db.asUser(user, async (tx) => {
      const rows = await tx`
        update app.trips set deleted_at = now()
        where id = ${tripId} and owner_id = ${user.id} and deleted_at is null
        returning id
      `;
      if (rows.length === 0) throw notFound('Trip not found.');
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
          set deleted_at = null
          where app.trip_places.deleted_at is not null
      `;
      return this.getInTx(tx, user, tripId);
    });
  }

  /** Removes a place from a trip. The place stays in the collection. Idempotent. */
  removePlace(user: AuthUser, tripId: string, placeId: string): Promise<TripDetail> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId);
      await tx`
        update app.trip_places set deleted_at = now()
        where trip_id = ${tripId} and place_id = ${placeId}
          and owner_id = ${user.id} and deleted_at is null
      `;
      return this.getInTx(tx, user, tripId);
    });
  }

  private async getInTx(tx: Tx, user: AuthUser, tripId: string): Promise<TripDetail> {
    const trip = await findTrip(tx, user, tripId);
    const places = await tx<TripPlaceRow[]>`
      select ${placeColumns(tx)}, tp.updated_at as added_at
      from app.trip_places tp
      join app.places p on p.id = tp.place_id and p.deleted_at is null
      where tp.trip_id = ${tripId} and tp.owner_id = ${user.id} and tp.deleted_at is null
      order by tp.updated_at asc
    `;
    return toTripDetail(trip, places);
  }
}

async function findTrip(tx: Tx, user: AuthUser, tripId: string): Promise<TripRow> {
  const [row] = await tx<TripRow[]>`
    select ${tripColumns(tx)}
    from app.trips t
    where t.id = ${tripId} and t.owner_id = ${user.id} and t.deleted_at is null
  `;
  if (!row) throw notFound('Trip not found.');
  return row;
}
