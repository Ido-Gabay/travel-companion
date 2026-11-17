import { Injectable } from '@nestjs/common';
import {
  categoryForGoogleType,
  DEFAULT_LOCALE,
  localeSchema,
  type DiscoverSearchRequest,
  type DiscoverSearchResponse,
  type InterpretResponse,
  type SupportedLocale,
} from '@travel-companion/shared';
import { AiService } from '../ai/ai.service.js';
import type { InterpretContext } from '../ai/interpret-prompt.js';
import type { AuthUser } from '../auth/auth.types.js';
import { notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { GooglePlacesService } from '../google/google-places.service.js';

type InterpretBody = {
  query: string;
  tripId?: string | undefined;
  clarifications?: { question: string; answer: string }[] | undefined;
};

/**
 * Discovery. Standard search: the app sends a plan built from what the user
 * typed or tapped (plus an area) straight to search. AI search: interpret
 * first, then search with the AI's plan. Either way Google returns real
 * places and the user chooses what to save (POST /v1/places/google).
 * Google results are never passed to the AI.
 */
@Injectable()
export class DiscoverService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AiService,
    private readonly google: GooglePlacesService,
  ) {}

  async interpret(user: AuthUser, body: InterpretBody): Promise<InterpretResponse> {
    const { locale, trip } = await this.db.asUser(user, async (tx) => ({
      locale: await userLocale(tx, user),
      trip: body.tripId ? await tripContext(tx, user, body.tripId) : null,
    }));
    const context: InterpretContext = {
      locale,
      trip,
      clarifications: body.clarifications ?? [],
    };
    return this.ai.interpret(body.query, context);
  }

  async search(user: AuthUser, body: DiscoverSearchRequest): Promise<DiscoverSearchResponse> {
    const locale = await this.db.asUser(user, async (tx) => {
      if (body.tripId) await tripContext(tx, user, body.tripId);
      return userLocale(tx, user);
    });

    const places = await this.google.searchText(body.plan, locale, body.area);
    if (places.length === 0) return { results: [] };

    // Which results the user already has (by Google place ID), and in this trip.
    const saved = await this.db.asUser(user, (tx) =>
      tx<{ id: string; google_place_id: string; in_trip: boolean }[]>`
        select p.id, p.google_place_id,
          ${
            body.tripId
              ? tx`exists (
                  select 1 from app.trip_places tp
                  where tp.place_id = p.id and tp.trip_id = ${body.tripId} and tp.deleted_at is null
                )`
              : tx`false`
          } as in_trip
        from app.places p
        where p.owner_id = ${user.id}
          and p.deleted_at is null
          and p.google_place_id = any(${tx.array(places.map((place) => place.placeId))}::text[])
      `,
    );
    const byGoogleId = new Map(saved.map((row) => [row.google_place_id, row]));

    return {
      results: places.map((place) => {
        const row = byGoogleId.get(place.placeId);
        return {
          ...place,
          savedPlaceId: row?.id ?? null,
          inTrip: row?.in_trip ?? false,
          category: categoryForGoogleType(place.primaryType, body.plan.category),
        };
      }),
    };
  }
}

async function userLocale(tx: Tx, user: AuthUser): Promise<SupportedLocale> {
  const [row] = await tx<{ locale: string }[]>`
    select locale from app.user_preferences where user_id = ${user.id}
  `;
  const parsed = localeSchema.safeParse(row?.locale);
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}

async function tripContext(tx: Tx, user: AuthUser, tripId: string): Promise<InterpretContext['trip']> {
  const [row] = await tx<
    {
      title: string;
      destination: string | null;
      base_location: string | null;
      start_date: string | null;
      end_date: string | null;
    }[]
  >`
    select title, destination, base_location, start_date::text as start_date, end_date::text as end_date
    from app.trips
    where id = ${tripId} and owner_id = ${user.id} and deleted_at is null
  `;
  if (!row) throw notFound('Trip not found.');
  return {
    title: row.title,
    destination: row.destination,
    baseLocation: row.base_location,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

