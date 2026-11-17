import { Injectable } from '@nestjs/common';
import type {
  CreatePlaceData,
  Place,
  PlaceList,
  SaveGooglePlacesInput,
  UpdatePlaceData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { placeColumns } from './place-columns.js';
import { toPlace, type PlaceRow } from './places.mapper.js';

/** Upper bound until the list is paginated. */
export const PLACE_LIST_LIMIT = 500;

@Injectable()
export class PlacesService {
  constructor(private readonly db: DatabaseService) {}

  list(user: AuthUser): Promise<PlaceList> {
    return this.db.asUser(user, async (tx) => {
      const rows = await tx<PlaceRow[]>`
        select ${placeColumns(tx)}
        from app.places p
        where p.owner_id = ${user.id} and p.deleted_at is null
        order by p.created_at desc
        limit ${PLACE_LIST_LIMIT}
      `;
      return { items: rows.map(toPlace) };
    });
  }

  get(user: AuthUser, placeId: string): Promise<Place> {
    return this.db.asUser(user, async (tx) => toPlace(await findPlace(tx, user, placeId)));
  }

  /** A custom place the user typed in. */
  create(user: AuthUser, input: CreatePlaceData): Promise<Place> {
    return this.db.asUser(user, async (tx) => {
      await tx`insert into app.profiles (id) values (${user.id}) on conflict (id) do nothing`;
      const [inserted] = await tx<{ id: string }[]>`
        insert into app.places (owner_id, name, address, notes, category)
        values (${user.id}, ${input.name}, ${input.address}, ${input.notes}, ${input.category})
        returning id
      `;
      if (!inserted) throw new Error('Place insert returned no row.');
      return toPlace(await findPlace(tx, user, inserted.id));
    });
  }

  /**
   * Saves Google places by place ID only (no Google content is stored). One
   * row per Google place per user: saving again revives a deleted row and
   * keeps the user's notes. Optionally adds them all to a trip's wishlist.
   */
  saveGoogle(user: AuthUser, input: SaveGooglePlacesInput): Promise<{ places: Place[] }> {
    return this.db.asUser(user, async (tx) => {
      await tx`insert into app.profiles (id) values (${user.id}) on conflict (id) do nothing`;

      if (input.tripId) {
        const [trip] = await tx`
          select id from app.trips
          where id = ${input.tripId} and owner_id = ${user.id} and deleted_at is null
        `;
        if (!trip) throw notFound('Trip not found.');
      }

      const ids: string[] = [];
      for (const item of input.items) {
        const [row] = await tx<{ id: string }[]>`
          insert into app.places (owner_id, google_place_id, category)
          values (${user.id}, ${item.googlePlaceId}, ${item.category})
          on conflict (owner_id, google_place_id) where google_place_id is not null
          do update set
            category = case when app.places.deleted_at is null then app.places.category else excluded.category end,
            deleted_at = null
          returning id
        `;
        if (!row) throw new Error('Place upsert returned no row.');
        ids.push(row.id);

        if (input.tripId) {
          await tx`
            insert into app.trip_places (owner_id, trip_id, place_id)
            values (${user.id}, ${input.tripId}, ${row.id})
            on conflict (trip_id, place_id) do update
              set deleted_at = null, created_at = now()
              where app.trip_places.deleted_at is not null
          `;
        }
      }

      const places: Place[] = [];
      for (const id of ids) places.push(toPlace(await findPlace(tx, user, id)));
      return { places };
    });
  }

  update(user: AuthUser, placeId: string, input: UpdatePlaceData): Promise<Place> {
    return this.db.asUser(user, async (tx) => {
      const current = await findPlace(tx, user, placeId);
      if (current.google_place_id && (input.name !== undefined || input.address !== undefined)) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          "A Google place's name and address come from Google and can't be edited.",
        );
      }

      // Only the fields that were sent; null clears a field.
      const changes: Record<string, string | null> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.address !== undefined) changes.address = input.address;
      if (input.notes !== undefined) changes.notes = input.notes;
      if (input.category !== undefined) changes.category = input.category;

      if (Object.keys(changes).length > 0) {
        await tx`
          update app.places set ${tx(changes)}
          where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        `;
      }
      if (input.tags !== undefined) {
        await tx`
          update app.places set tags = ${tx.array(input.tags)}::text[]
          where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        `;
      }
      if (input.visited !== undefined) {
        await tx`
          update app.places
          set visited_at = ${input.visited ? tx`coalesce(visited_at, now())` : null}
          where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        `;
      }
      return toPlace(await findPlace(tx, user, placeId));
    });
  }

  /** Soft delete; also takes the place out of every trip. */
  remove(user: AuthUser, placeId: string): Promise<void> {
    return this.db.asUser(user, async (tx) => {
      const rows = await tx`
        update app.places set deleted_at = now()
        where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        returning id
      `;
      if (rows.length === 0) throw notFound('Place not found.');
      await tx`
        update app.trip_places set deleted_at = now()
        where place_id = ${placeId} and owner_id = ${user.id} and deleted_at is null
      `;
    });
  }
}

async function findPlace(tx: Tx, user: AuthUser, placeId: string): Promise<PlaceRow> {
  const [row] = await tx<PlaceRow[]>`
    select ${placeColumns(tx)}
    from app.places p
    where p.id = ${placeId} and p.owner_id = ${user.id} and p.deleted_at is null
  `;
  if (!row) throw notFound('Place not found.');
  return row;
}
