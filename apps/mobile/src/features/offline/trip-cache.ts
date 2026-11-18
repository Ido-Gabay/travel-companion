import {
  meSchema,
  tripDetailSchema,
  tripJournalSchema,
  tripListSchema,
  type Me,
  type TripDetail,
  type TripJournal,
  type TripList,
} from '@travel-companion/shared';
import type { z } from 'zod';
import { parseCoords, pruneCoords, type CachedCoord } from './coords';
import type { KeyValueStore } from './storage';

/**
 * M12a saved copy of the user's OWN data, so trips, the itinerary and Today open
 * without a connection. Stored per user under `tc.offline.v1.<userId>.…` and wiped
 * on sign-out. Never stores Google content except coordinates (see coords.ts).
 * Kept behind this small module so a SQLite/PowerSync store can replace it later.
 */
export const OFFLINE_PREFIX = 'tc.offline.v1.';
export const userPrefix = (userId: string) => `${OFFLINE_PREFIX}${userId}.`;
const TRIPS = 'trips';
const TRIP = 'trip.';
const ME = 'me';
const COORDS = 'coords';
const JOURNAL = 'journal.';

export interface Cached<T> {
  /** When this copy came from the server (ms since epoch). */
  savedAt: number;
  data: T;
}

export interface OfflineSnapshot {
  trips: Cached<TripList> | null;
  details: Cached<TripDetail>[];
  me: Cached<Me> | null;
  coords: CachedCoord[];
  /** M15: trip journals (the user's notes and ratings), by trip id. */
  journals: { tripId: string; journal: Cached<TripJournal> }[];
}

/**
 * Belt and braces for the Google terms: Google places never carry a name or
 * address in our data (the API and a DB constraint already ensure it), so make
 * sure nothing like that can reach the device copy either.
 */
export function sanitizeTripDetail(detail: TripDetail): TripDetail {
  return {
    ...detail,
    places: detail.places.map((place) =>
      place.source === 'google' ? { ...place, name: null, address: null } : place,
    ),
  };
}

/** Google place IDs used by a trip (its stops and its pinned hotel). */
export function tripGoogleIds(detail: TripDetail): string[] {
  const ids = detail.places.flatMap((place) => (place.googlePlaceId ? [place.googlePlaceId] : []));
  return detail.basePlaceId ? [...ids, detail.basePlaceId] : ids;
}

function parse<S extends z.ZodType>(raw: string | null, schema: S): Cached<z.output<S>> | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as { savedAt?: unknown; data?: unknown };
    const parsed = schema.safeParse(json.data);
    if (!parsed.success || typeof json.savedAt !== 'number') return null;
    return { savedAt: json.savedAt, data: parsed.data };
  } catch {
    return null;
  }
}

export class TripCache {
  constructor(
    private readonly store: KeyValueStore,
    private readonly userId: string,
  ) {}

  private key(name: string): string {
    return `${userPrefix(this.userId)}${name}`;
  }

  async saveTrips(list: TripList, nowMs: number): Promise<void> {
    await this.store.setItem(this.key(TRIPS), JSON.stringify({ savedAt: nowMs, data: list }));
    // Drop saved details of trips that no longer exist.
    const ids = new Set(list.items.map((trip) => trip.id));
    const stale = (await this.store.getAllKeys()).filter(
      (key) =>
        (key.startsWith(this.key(TRIP)) && !ids.has(key.slice(this.key(TRIP).length))) ||
        (key.startsWith(this.key(JOURNAL)) && !ids.has(key.slice(this.key(JOURNAL).length))),
    );
    if (stale.length > 0) await this.store.multiRemove(stale);
  }

  async saveTrip(detail: TripDetail, nowMs: number): Promise<void> {
    await this.store.setItem(
      this.key(`${TRIP}${detail.id}`),
      JSON.stringify({ savedAt: nowMs, data: sanitizeTripDetail(detail) }),
    );
  }

  async removeTrip(tripId: string): Promise<void> {
    await this.store.removeItem(this.key(`${TRIP}${tripId}`));
    await this.store.removeItem(this.key(`${JOURNAL}${tripId}`));
  }

  async saveJournal(tripId: string, journal: TripJournal, nowMs: number): Promise<void> {
    await this.store.setItem(this.key(`${JOURNAL}${tripId}`), JSON.stringify({ savedAt: nowMs, data: journal }));
  }

  async saveMe(me: Me, nowMs: number): Promise<void> {
    await this.store.setItem(this.key(ME), JSON.stringify({ savedAt: nowMs, data: me }));
  }

  async saveCoords(entries: readonly CachedCoord[]): Promise<void> {
    await this.store.setItem(this.key(COORDS), JSON.stringify(entries));
  }

  /** Reads everything saved for this user. Invalid or expired entries are dropped (and deleted). */
  async load(nowMs: number): Promise<OfflineSnapshot> {
    const keys = (await this.store.getAllKeys()).filter((key) => key.startsWith(userPrefix(this.userId)));
    const trips = parse(keys.includes(this.key(TRIPS)) ? await this.store.getItem(this.key(TRIPS)) : null, tripListSchema);
    const me = parse(keys.includes(this.key(ME)) ? await this.store.getItem(this.key(ME)) : null, meSchema);
    const details: Cached<TripDetail>[] = [];
    for (const key of keys.filter((item) => item.startsWith(this.key(TRIP)))) {
      const detail = parse(await this.store.getItem(key), tripDetailSchema);
      if (detail) details.push({ ...detail, data: sanitizeTripDetail(detail.data) });
      else await this.store.removeItem(key);
    }

    const journals: OfflineSnapshot['journals'] = [];
    for (const key of keys.filter((item) => item.startsWith(this.key(JOURNAL)))) {
      const journal = parse(await this.store.getItem(key), tripJournalSchema);
      if (journal) journals.push({ tripId: key.slice(this.key(JOURNAL).length), journal });
      else await this.store.removeItem(key);
    }

    let coords: CachedCoord[] = [];
    if (keys.includes(this.key(COORDS))) {
      let raw: unknown = null;
      try {
        raw = JSON.parse((await this.store.getItem(this.key(COORDS))) ?? 'null');
      } catch {
        raw = null;
      }
      const all = parseCoords(raw);
      const keep = new Set(details.flatMap((item) => tripGoogleIds(item.data)));
      coords = pruneCoords(all, nowMs, keep);
      const rawLength = Array.isArray(raw) ? raw.length : 0;
      if (coords.length !== rawLength) await this.saveCoords(coords);
    }
    return { trips, details, me, coords, journals };
  }
}

/** Removes every user's saved copy (sign-out). */
export async function clearAllOffline(store: KeyValueStore): Promise<void> {
  const keys = (await store.getAllKeys()).filter((key) => key.startsWith(OFFLINE_PREFIX));
  if (keys.length > 0) await store.multiRemove(keys);
}

/** Removes saved copies that belong to anyone but `userId` (defense if a sign-out wipe failed). */
export async function clearOtherUsers(store: KeyValueStore, userId: string): Promise<void> {
  const keys = (await store.getAllKeys()).filter(
    (key) => key.startsWith(OFFLINE_PREFIX) && !key.startsWith(userPrefix(userId)),
  );
  if (keys.length > 0) await store.multiRemove(keys);
}
