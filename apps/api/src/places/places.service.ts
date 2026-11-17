import { Injectable } from '@nestjs/common';
import type {
  CreatePlaceData,
  Place,
  PlaceList,
  UpdatePlaceData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { toPlace, type PlaceRow } from './places.mapper.js';

/** Upper bound until the list is paginated. */
export const PLACE_LIST_LIMIT = 500;

function placeColumns(tx: Tx) {
  return tx`
    p.id, p.name, p.address, p.notes,
    (
      select count(*)::int
      from app.trip_places tp
      join app.trips t on t.id = tp.trip_id and t.deleted_at is null
      where tp.place_id = p.id and tp.deleted_at is null
    ) as trip_count,
    p.created_at, p.updated_at, p.version
  `;
}

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

  create(user: AuthUser, input: CreatePlaceData): Promise<Place> {
    return this.db.asUser(user, async (tx) => {
      await tx`insert into app.profiles (id) values (${user.id}) on conflict (id) do nothing`;
      const [inserted] = await tx<{ id: string }[]>`
        insert into app.places (owner_id, name, address, notes)
        values (${user.id}, ${input.name}, ${input.address}, ${input.notes})
        returning id
      `;
      if (!inserted) throw new Error('Place insert returned no row.');
      return toPlace(await findPlace(tx, user, inserted.id));
    });
  }

  update(user: AuthUser, placeId: string, input: UpdatePlaceData): Promise<Place> {
    // Only the fields that were sent; null clears a field.
    const changes: Record<string, string | null> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.address !== undefined) changes.address = input.address;
    if (input.notes !== undefined) changes.notes = input.notes;

    return this.db.asUser(user, async (tx) => {
      const rows = await tx`
        update app.places set ${tx(changes)}
        where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        returning id
      `;
      if (rows.length === 0) throw notFound('Place not found.');
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
