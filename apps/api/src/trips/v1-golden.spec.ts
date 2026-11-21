import { afterEach, describe, expect, it } from 'vitest';
import { apiServices, asAuthUser } from '../testing/api.js';
import { USER_A, seedEdgeCases, seedP0Profile } from '../testing/d1-fixture.js';
import { legacyV1Reads } from '../testing/legacy-v1.js';
import { D1_VERSION, applyD1, closeAll, createDatabase, rows, type TestDb } from '../testing/pg.js';

/**
 * D1 golden tests: the installed app's v1 reads answer exactly as before the
 * migration. Before = a frozen copy of the pre-D1 queries on the pre-D1
 * schema; after = today's API services on the migrated database.
 */
afterEach(closeAll);

const BEFORE_D1 = String(Number(D1_VERSION) - 1);
const user = asAuthUser(USER_A);
const D1_PLACE_FIELDS = ['latitude', 'longitude', 'linkedGooglePlaceId'];

async function compare(seed: (db: TestDb) => Promise<void>) {
  const db = await createDatabase({ until: BEFORE_D1 });
  await seed(db);
  const before = await legacyV1Reads(await db.url(), USER_A);
  await applyD1(db);
  const api = await apiServices(db);
  const list = await api.trips.list(user);
  const details = [];
  for (const trip of list.items) details.push(await api.trips.get(user, trip.id));
  const places = await api.places.list(user);
  const created = new Set(
    (await rows<{ place_id: string }>(db, 'select place_id from app.d1_backfill_created_places')).map((row) => row.place_id),
  );
  return { before, after: { list, details, places }, created };
}

describe('v1 golden: identical responses before and after D1', () => {
  for (const [name, seed] of [
    ['P0 profile', seedP0Profile],
    ['edge cases', seedEdgeCases],
  ] as const) {
    it(`GET /v1/trips and GET /v1/trips/:id are byte-identical (${name})`, async () => {
      const { before, after } = await compare(seed);
      expect(JSON.stringify(after.list)).toBe(JSON.stringify(before.list));
      expect(JSON.stringify(after.details)).toBe(JSON.stringify(before.details));
      expect(after.details.length).toBeGreaterThan(0);
    });

    it(`GET /v1/places only adds the D1 fields and the backfilled hotels (${name})`, async () => {
      const { before, after, created } = await compare(seed);
      const strip = (place: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(place).filter(([key]) => !D1_PLACE_FIELDS.includes(key)));
      const kept = after.places.items.filter((place) => !created.has(place.id)).map(strip);
      expect(JSON.stringify(kept)).toBe(JSON.stringify(before.places.items));
      for (const place of after.places.items) {
        expect(place.latitude).toBeNull();
        expect(place.longitude).toBeNull();
        expect(place.linkedGooglePlaceId).toBeNull();
      }
      // A2: hotels the backfill created are 'stay' places (the newer app shows them under Stays).
      for (const place of after.places.items.filter((p) => created.has(p.id))) expect(place.category).toBe('stay');
    });
  }
});
