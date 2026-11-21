import { readFileSync } from 'node:fs';
import type { TestDb } from '../../testing/pg.js';
import { afterEach, describe, expect, it } from 'vitest';
import { TRIP_NY, USER_A, membershipId, seedP0Profile } from '../../testing/d1-fixture.js';
import {
  D1_VERSION,
  applyD1,
  applyMigration,
  asUser,
  createDatabase,
  legacyFingerprint,
  migrationFiles,
  rows,
  runD1Down,
  scalar,
  schemaFingerprint,
} from '../../testing/pg.js';
import { closeAll } from '../../testing/pg.js';

const PRE_D1 = '20261118120000';

async function seeded(): Promise<{ db: TestDb; schema: string[]; data: Record<string, string> }> {
  const db = await createDatabase({ until: PRE_D1 });
  await seedP0Profile(db);
  return { db, schema: await schemaFingerprint(db), data: await legacyFingerprint(db) };
}

describe('D1 rollback and atomicity', () => {
  it('a failing migration leaves no trace (one transaction)', async () => {
    const { db, schema, data } = await seeded();
    const d1 = readFileSync(migrationFiles().find((m) => m.version === D1_VERSION)!.file, 'utf8');
    await expect(applyMigration(db, D1_VERSION, `${d1}\nselect 1 / 0;`)).rejects.toThrow(/division by zero/);
    expect(await schemaFingerprint(db)).toEqual(schema);
    expect(await legacyFingerprint(db)).toEqual(data);
    expect(await scalar(db, `select count(*)::int from supabase_migrations.schema_migrations where version = $1`, [D1_VERSION])).toBe(0);
  });

  it('the down script restores the exact pre-D1 schema and data', async () => {
    const { db, schema, data } = await seeded();
    await applyD1(db);
    expect(await schemaFingerprint(db)).not.toEqual(schema);
    await runD1Down(db);
    expect(await schemaFingerprint(db)).toEqual(schema);
    expect(await legacyFingerprint(db)).toEqual(data);
    // Hotel places created by the backfill are gone; nothing else was removed.
    expect(await scalar(db, 'select count(*)::int from app.places')).toBe(34);
    expect(await scalar(db, `select count(*)::int from supabase_migrations.schema_migrations where version = $1`, [D1_VERSION])).toBe(0);
  });

  it('D1 can be applied again after a rollback, with the same result', async () => {
    const { db } = await seeded();
    await applyD1(db);
    const first = await rows(db, `select trip_place_id, status, completed_at from app.trip_stops order by trip_place_id`);
    await runD1Down(db);
    await applyD1(db);
    expect(await rows(db, `select trip_place_id, status, completed_at from app.trip_stops order by trip_place_id`)).toEqual(first);
    expect(await scalar(db, `select count(*)::int from app.trip_stays`)).toBe(28);
  });

  it('refuses to roll back while data exists only in D1 structures', async () => {
    const { db } = await seeded();
    await applyD1(db);
    // A repeat visit (exists only in trip_stops).
    await asUser(
      db,
      USER_A,
      (tx) =>
        tx.query(`insert into app.trip_stops (owner_id, trip_id, trip_place_id, day) values ($1, $2, $3, '2026-11-28')`, [
          USER_A,
          TRIP_NY,
          membershipId(6),
        ]),
      { commit: true },
    );
    await expect(runD1Down(db)).rejects.toThrow(/D1 rollback refused: .*visits created after the migration/);
    // Nothing was dropped by the refused attempt.
    expect(await scalar(db, 'select count(*)::int from app.trip_stops')).toBe(13);
  });

  it.each([
    [`update app.trip_stops set status = 'skipped', skipped_at = now() where trip_place_id = '${membershipId(7)}'`, 'migrated visits edited'],
    [`update app.trip_stays set check_in = '2026-11-24' where trip_id = '${TRIP_NY}'`, 'stays created or edited'],
    [`update app.trips set time_zone = 'America/New_York', time_zone_source = 'user' where id = '${TRIP_NY}'`, 'trip time zones'],
    [`insert into app.places (owner_id, name, category, latitude, longitude) values ('${USER_A}', 'Pin', 'other', 40.7, -73.9)`, 'custom-place coordinates'],
  ])('refuses after: %s', async (sql, reason) => {
    const { db } = await seeded();
    await applyD1(db);
    await db.query(sql);
    await expect(runD1Down(db)).rejects.toThrow(new RegExp(reason));
  });

  it('a forced rollback leaves legacy columns showing the earliest visit (what the old app reads)', async () => {
    const { db } = await seeded();
    await applyD1(db);
    await asUser(
      db,
      USER_A,
      (tx) =>
        tx.query(`insert into app.trip_stops (owner_id, trip_id, trip_place_id, day, position) values ($1, $2, $3, '2026-11-23', 0)`, [
          USER_A,
          TRIP_NY,
          membershipId(9),
        ]),
      { commit: true },
    );
    await runD1Down(db, true);
    expect(await rows(db, `select day::text from app.trip_places where id = $1`, [membershipId(9)])).toEqual([{ day: '2026-11-23' }]);
    expect(await scalar(db, `select count(*)::int from information_schema.tables where table_schema = 'app' and table_name = 'trip_stops'`)).toBe(0);
  });
});

afterEach(closeAll);
