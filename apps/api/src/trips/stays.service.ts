import { Injectable } from '@nestjs/common';
import type { CreateStayData, StayWriteResponse, TimeZoneSuggestion, TripDetailV2, UpdateStayData } from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { ApiException, notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { TimeZonesService } from '../timezones/timezones.service.js';
import { conflict, findTrip, invalid, stayPlaces, syncLegacyBase } from './trip-queries.js';
import { toStay, type StayRow } from './trips.mapper.js';
import { TripsV2Service } from './trips-v2.service.js';
import { decideZone, placePin } from './zone-input.js';

function stayColumns(tx: Tx) {
  return tx`
    s.id, s.trip_id, s.place_id, s.label,
    s.check_in::text as check_in, s.check_out::text as check_out,
    s.time_zone, s.time_zone_source, s.created_at, s.updated_at, s.version
  `;
}

/**
 * D1 · Stays (API v2): where the user sleeps, by nights [checkIn, checkOut).
 * Dated stays may not share a night; at most one whole-trip stay (no dates),
 * which covers the nights no dated stay does. After each change the legacy
 * trip fields read by v1 (baseLocation/basePlaceId) are refreshed.
 */
@Injectable()
export class StaysService {
  constructor(
    private readonly db: DatabaseService,
    private readonly timeZones: TimeZonesService,
    private readonly trips: TripsV2Service,
  ) {}

  create(user: AuthUser, tripId: string, input: CreateStayData): Promise<StayWriteResponse> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId, true);
      if (input.id) {
        const existing = await findStay(tx, user, input.id);
        if (existing) {
          if (existing.trip_id !== tripId) throw conflict('This stay id is already used.', 'ID_IN_USE');
          return { stay: toStay(existing, await stayPlaces(tx, user, [existing.place_id])), timeZoneSuggestion: null };
        }
      }
      if (input.placeId) await checkPlace(tx, user, input.placeId);
      await checkOverlap(tx, tripId, input.checkIn, input.checkOut, null);
      const zone = decideZone(this.timeZones, input, await placePin(tx, user.id, input.placeId), true);
      const [row] = await tx<{ id: string }[]>`
        insert into app.trip_stays (
          id, owner_id, trip_id, place_id, label, check_in, check_out, time_zone, time_zone_source, time_zone_dataset
        ) values (
          coalesce(${input.id ?? null}::uuid, gen_random_uuid()), ${user.id}, ${tripId}, ${input.placeId}, ${input.label},
          ${input.checkIn}::date, ${input.checkOut}::date,
          ${zone.store?.timeZone ?? null}, ${zone.store?.source ?? null}, ${zone.store?.dataset ?? null}
        )
        returning id
      `;
      await syncLegacyBase(tx, tripId);
      return this.respond(tx, user, row!.id, zone.suggestion);
    });
  }

  update(user: AuthUser, tripId: string, stayId: string, input: UpdateStayData): Promise<StayWriteResponse> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId, true);
      const stay = await findStay(tx, user, stayId);
      if (!stay || stay.trip_id !== tripId || stay.deleted_at) throw notFound('Stay not found.');

      const placeId = input.placeId !== undefined ? input.placeId : stay.place_id;
      const label = input.label !== undefined ? input.label : stay.label;
      if (placeId === null && label === null) throw invalid('label', 'Pin a place or type where you stay.');
      if (input.placeId) await checkPlace(tx, user, input.placeId);
      const checkIn = input.checkIn !== undefined ? input.checkIn : stay.check_in;
      const checkOut = input.checkOut !== undefined ? input.checkOut : stay.check_out;
      if (input.checkIn !== undefined) await checkOverlap(tx, tripId, checkIn, checkOut, stay.id);

      // Zone: what the user sent wins; a new place re-derives a zone the server derived (never one the user confirmed).
      const placeChanged = placeId !== stay.place_id;
      let suggestion: TimeZoneSuggestion | null = null;
      let store: { timeZone: string; source: string; dataset: string | null } | null | undefined;
      if (input.timeZone !== undefined || input.location !== undefined || (placeChanged && stay.time_zone_source !== 'user')) {
        const zone = decideZone(this.timeZones, input, await placePin(tx, user.id, placeId), placeChanged && stay.time_zone_source !== 'user');
        suggestion = zone.suggestion;
        store = zone.store;
        if (store === undefined && placeChanged && stay.time_zone_source === 'derived') store = null;
      }

      await tx`
        update app.trip_stays
        set place_id = ${placeId}, label = ${label},
            check_in = ${checkIn}::date, check_out = ${checkOut}::date
        where id = ${stay.id}
      `;
      if (store !== undefined) {
        await tx`
          update app.trip_stays
          set time_zone = ${store?.timeZone ?? null}, time_zone_source = ${store?.source ?? null},
              time_zone_dataset = ${store?.dataset ?? null}
          where id = ${stay.id}
        `;
      }
      await syncLegacyBase(tx, tripId);
      return this.respond(tx, user, stay.id, suggestion);
    });
  }

  /** Removes a stay (soft). Idempotent. */
  remove(user: AuthUser, tripId: string, stayId: string): Promise<TripDetailV2> {
    return this.db.asUser(user, async (tx) => {
      await findTrip(tx, user, tripId, true);
      await tx`
        update app.trip_stays set deleted_at = now()
        where id = ${stayId} and trip_id = ${tripId} and owner_id = ${user.id} and deleted_at is null
      `;
      await syncLegacyBase(tx, tripId);
      return this.trips.detailInTx(tx, user, tripId);
    });
  }

  private async respond(tx: Tx, user: AuthUser, stayId: string, suggestion: TimeZoneSuggestion | null): Promise<StayWriteResponse> {
    const row = await findStay(tx, user, stayId);
    if (!row) throw new Error('Stay not found after write.');
    return { stay: toStay(row, await stayPlaces(tx, user, [row.place_id])), timeZoneSuggestion: suggestion };
  }
}

async function findStay(tx: Tx, user: AuthUser, stayId: string): Promise<(StayRow & { deleted_at: Date | null }) | null> {
  const [row] = await tx<(StayRow & { deleted_at: Date | null })[]>`
    select ${stayColumns(tx)}, s.deleted_at from app.trip_stays s where s.id = ${stayId} and s.owner_id = ${user.id}
  `;
  return row ?? null;
}

async function checkPlace(tx: Tx, user: AuthUser, placeId: string): Promise<void> {
  const [row] = await tx`select 1 from app.places where id = ${placeId} and owner_id = ${user.id} and deleted_at is null`;
  if (!row) throw notFound('Place not found.');
}

/** 409 STAY_OVERLAP naming the other stay: dated stays may not share a night; only one whole-trip stay. */
async function checkOverlap(tx: Tx, tripId: string, checkIn: string | null, checkOut: string | null, exceptId: string | null): Promise<void> {
  const [other] = await tx<{ id: string; label: string | null; check_in: string | null; check_out: string | null }[]>`
    select id, label, check_in::text as check_in, check_out::text as check_out
    from app.trip_stays
    where trip_id = ${tripId} and deleted_at is null
      and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)
      and (
        (${checkIn}::date is null and check_in is null)
        or (${checkIn}::date is not null and check_in is not null
            and check_in < ${checkOut}::date and ${checkIn}::date < check_out)
      )
    order by check_in nulls first
    limit 1
  `;
  if (other) {
    const nights = other.check_in ? `${other.check_in}..${other.check_out}` : 'whole trip';
    throw new ApiException(409, 'STAY_OVERLAP', 'These nights overlap another stay.', [
      { path: `stays.${other.id}`, message: `${other.label ?? 'Stay'} (${nights})` },
    ]);
  }
}
