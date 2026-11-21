import { Injectable } from '@nestjs/common';
import {
  PLACE_LABEL_MAX,
  PLACE_NOTES_MAX,
  type CreatePlaceData,
  type LinkGooglePlaceInput,
  type Place,
  type PlaceList,
  type PlaceVisitList,
  type SaveGooglePlacesInput,
  type UpdatePlaceData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { TimeZonesService } from '../timezones/timezones.service.js';
import { placeColumns } from './place-columns.js';
import { toPlace, type PlaceRow } from './places.mapper.js';

/** Upper bound until the list is paginated. */
export const PLACE_LIST_LIMIT = 500;

@Injectable()
export class PlacesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly timeZones: TimeZonesService,
  ) { }

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

  /**
   * A custom place the user typed in. D1: optionally with the user's own pin,
   * and the Google place it stands in for ("Use my own pin": ID only; Google's
   * own data is never copied or changed).
   */
  create(user: AuthUser, input: CreatePlaceData): Promise<Place> {
    return this.db.asUser(user, async (tx) => {
      await tx`insert into app.profiles (id) values (${user.id}) on conflict (id) do nothing`;
      const [inserted] = await tx<{ id: string }[]>`
        insert into app.places (owner_id, name, address, notes, category, latitude, longitude, linked_google_place_id)
        values (
          ${user.id}, ${input.name}, ${input.address}, ${input.notes}, ${input.category},
          ${input.latitude ?? null}, ${input.longitude ?? null}, ${input.linkedGooglePlaceId ?? null}
        )
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
            category = case
              when app.places.deleted_at is null and app.places.category <> 'other' then app.places.category
              else excluded.category
            end,
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
      // D1 Q2: Google's location is never overridden; "Use my own pin" makes a custom place instead.
      if (current.google_place_id && (input.latitude !== undefined || input.longitude !== undefined)) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          "A Google place's location comes from Google. Use your own pin to make a custom place instead.",
          [{ path: 'latitude', message: 'Custom places only.' }],
        );
      }

      // Only the fields that were sent; null clears a field.
      const changes: Record<string, string | null> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.address !== undefined) changes.address = input.address;
      if (input.notes !== undefined) changes.notes = input.notes;
      // The user's own label: allowed on Google places too (it is theirs, not Google's).
      if (input.myLabel !== undefined) changes.my_label = input.myLabel;
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
      if (input.latitude !== undefined && input.longitude !== undefined) {
        await tx`
          update app.places set latitude = ${input.latitude}, longitude = ${input.longitude}
          where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        `;
        // Stays whose zone the server derived from this pin follow it (a zone the user confirmed stays theirs).
        const derived =
          input.latitude !== null && input.longitude !== null ? this.timeZones.derive(input.latitude, input.longitude) : null;
        await tx`
          update app.trip_stays
          set time_zone = ${derived?.timeZone ?? null},
              time_zone_source = ${derived ? 'derived' : null},
              time_zone_dataset = ${derived?.dataset ?? null}
          where place_id = ${placeId} and owner_id = ${user.id} and time_zone_source = 'derived'
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

  /**
   * Links one of the user's own places (typed or imported by name) to the Google
   * place they picked, keeping everything that hangs off it:
   * - not saved yet: the same row becomes the Google place (same id, trips and
   *   visits); the user's name stays as their label, their address goes to notes;
   *   Google's text and location are never stored.
   * - already saved (even deleted): its trips, visits and stays move to that row
   *   and this one is soft-deleted. No visit is dropped.
   */
  linkGoogle(user: AuthUser, placeId: string, input: LinkGooglePlaceInput): Promise<Place> {
    return this.db.asUser(user, async (tx) => {
      const current = await findPlace(tx, user, placeId);
      if (current.google_place_id) {
        if (current.google_place_id === input.googlePlaceId) return toPlace(current);
        throw new ApiException(409, 'CONFLICT', 'This place is already linked to Google Maps.');
      }
      const label = current.my_label ?? (current.name ? current.name.slice(0, PLACE_LABEL_MAX).trim() : null);
      const notes = joinText(current.notes, current.address, PLACE_NOTES_MAX);
      // 'other' means unclassified: take the Google place's category; a category the user chose stays.
      const category = current.category !== 'other' ? current.category : (input.category ?? 'other');
      const [existing] = await tx<{ id: string }[]>`
        select id from app.places
        where owner_id = ${user.id} and google_place_id = ${input.googlePlaceId}
      `;

      if (!existing) {
        await tx`
          update app.places
          set google_place_id = ${input.googlePlaceId}, name = null, address = null,
              latitude = null, longitude = null, linked_google_place_id = null,
              my_label = ${label}, notes = ${notes}, category = ${category}
          where id = ${placeId} and owner_id = ${user.id} and deleted_at is null
        `;
        return toPlace(await findPlace(tx, user, placeId));
      }

      const target = existing.id;
      await tx`
        update app.places
        set deleted_at = null,
            my_label = coalesce(my_label, ${label}),
            notes = coalesce(notes, ${notes}),
            category = case when category = 'other' then ${category} else category end,
            visited_at = least(visited_at, ${current.visited_at})
        where id = ${target} and owner_id = ${user.id}
      `;
      const memberships = await tx<{ id: string; trip_id: string }[]>`
        select id, trip_id from app.trip_places
        where place_id = ${placeId} and owner_id = ${user.id} and deleted_at is null
      `;
      for (const membership of memberships) {
        const [other] = await tx<{ id: string }[]>`
          select id from app.trip_places
          where trip_id = ${membership.trip_id} and place_id = ${target} and owner_id = ${user.id}
        `;
        if (!other) {
          await tx`update app.trip_places set place_id = ${target} where id = ${membership.id}`;
          continue;
        }
        // The trip already has the Google place: these visits join it.
        await tx`update app.trip_places set deleted_at = null where id = ${other.id}`;
        await tx`update app.trip_stops set trip_place_id = ${other.id} where trip_place_id = ${membership.id}`;
        await tx`update app.trip_places set deleted_at = now() where id = ${membership.id}`;
      }
      await tx`update app.trip_stays set place_id = ${target} where place_id = ${placeId} and owner_id = ${user.id}`;
      await tx`update app.places set deleted_at = now() where id = ${placeId} and owner_id = ${user.id}`;
      return toPlace(await findPlace(tx, user, target));
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
      // Planned visits go with it; visits that already happened stay in history.
      await tx`
        update app.trip_stops s set deleted_at = now()
        from app.trip_places tp
        where tp.id = s.trip_place_id and tp.place_id = ${placeId} and tp.owner_id = ${user.id}
          and s.deleted_at is null and s.status in ('planned', 'in_progress')
      `;
      await tx`
        update app.trip_places set deleted_at = now()
        where place_id = ${placeId} and owner_id = ${user.id} and deleted_at is null
      `;
    });
  }

  /**
   * D1 · Visit history: completed visits (also those of deleted trips, Q4)
   * and the older "visited" mark when no visit explains it. Newest first.
   */
  visits(user: AuthUser, placeId: string): Promise<PlaceVisitList> {
    return this.db.asUser(user, async (tx) => {
      await findPlace(tx, user, placeId);
      const rows = await tx<
        { source: 'visit' | 'legacy_mark'; trip_id: string | null; trip_title: string | null; stop_id: string | null; day: string | null; completed_at: Date }[]
      >`
        select v.source, v.trip_id, t.title as trip_title, v.stop_id, v.day::text as day, v.completed_at
        from app.place_visits v
        left join app.trips t on t.id = v.trip_id
        where v.place_id = ${placeId} and v.owner_id = ${user.id}
        order by v.completed_at desc
      `;
      return {
        items: rows.map((row) => ({
          source: row.source,
          tripId: row.trip_id,
          tripTitle: row.trip_title,
          stopId: row.stop_id,
          day: row.day,
          completedAt: row.completed_at.toISOString(),
        })),
      };
    });
  }
}

/** Two pieces of the user's own text in one field, within its limit. */
function joinText(first: string | null, second: string | null, max: number): string | null {
  const text = [first, second].filter((part): part is string => Boolean(part?.trim())).join('\n');
  return text ? text.slice(0, max) : null;
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
