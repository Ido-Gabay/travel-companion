import type { TestDb } from '../../testing/pg.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TRIP_ISRAEL,
  TRIP_NY,
  USER_A,
  gid,
  membershipId,
  placeId,
  seedEdgeCases,
  seedP0Profile,
  tripId,
} from '../../testing/d1-fixture.js';
import { applyD1, asUser, createDatabase, rows, scalar } from '../../testing/pg.js';
import { closeAll } from '../../testing/pg.js';

const PRE_D1 = '20261118120000';

async function migratedEdgeCases(): Promise<TestDb> {
  const db = await createDatabase({ until: PRE_D1 });
  await seedEdgeCases(db);
  await applyD1(db);
  return db;
}

async function migratedP0(): Promise<TestDb> {
  const db = await createDatabase({ until: PRE_D1 });
  await seedP0Profile(db);
  await applyD1(db);
  return db;
}

/** Any statement that must be rejected by a constraint, policy or key. */
async function rejects(db: TestDb, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`expected rejection: ${sql}`);
}

describe('migration edge cases (not in P0, handled safely)', () => {
  it('attaches no ambiguous mark; every legacy mark survives and shows in history', async () => {
    const db = await migratedEdgeCases();
    const visits = await rows<{ place: string; status: string }>(
      db,
      `select tp.place_id as place, s.status from app.trip_stops s join app.trip_places tp on tp.id = s.trip_place_id order by 1, 2`,
    );
    expect(visits).toEqual([
      { place: placeId(201), status: 'planned' }, // B: marked outside the trip dates
      { place: placeId(202), status: 'planned' }, // C: scheduled in two trips
      { place: placeId(202), status: 'planned' },
      { place: placeId(204), status: 'planned' }, // E: trip without dates
      { place: placeId(206), status: 'completed' }, // A, even though the trip is deleted
    ]);
    const history = await rows<{ place_id: string; source: string }>(db, `select place_id, source from app.place_visits order by 1, 2`);
    expect(history).toEqual([
      { place_id: placeId(201), source: 'legacy_mark' },
      { place_id: placeId(202), source: 'legacy_mark' },
      { place_id: placeId(203), source: 'legacy_mark' }, // D: never scheduled
      { place_id: placeId(204), source: 'legacy_mark' },
      { place_id: placeId(206), source: 'visit' }, // Q4: a deleted trip's completed visit stays in history
    ]);
    expect(await scalar(db, `select count(*)::int from app.places where visited_at is not null`)).toBe(5);
  });

  it('one-day and undated trips get a whole-trip stay; text-only stays keep the text without inventing a place', async () => {
    const db = await migratedEdgeCases();
    const stays = await rows<{ trip_id: string; label: string | null; check_in: string | null; has_place: boolean }>(
      db,
      `select trip_id, label, check_in::text, place_id is not null as has_place from app.trip_stays order by trip_id`,
    );
    expect(stays).toEqual([
      { trip_id: tripId(203), label: "A friend's sofa", check_in: null, has_place: false },
      { trip_id: tripId(204), label: null, check_in: null, has_place: true },
      { trip_id: tripId(205), label: null, check_in: '2026-10-01', has_place: true },
    ]);
  });

  it('reuses a soft-deleted place with the hotel\'s Google ID without reviving or duplicating it', async () => {
    const db = await migratedEdgeCases();
    const hotel = await rows<{ id: string; deleted: boolean }>(
      db,
      `select p.id, p.deleted_at is not null as deleted from app.trip_stays s join app.places p on p.id = s.place_id where s.trip_id = $1`,
      [tripId(205)],
    );
    expect(hotel).toEqual([{ id: placeId(205), deleted: true }]);
    expect(await scalar(db, `select count(*)::int from app.places where google_place_id = $1`, [gid('deletedHotelPlace')])).toBe(1);
    expect(await scalar(db, `select count(*)::int from app.d1_backfill_created_places where place_id = $1`, [placeId(205)])).toBe(0);
  });
});

describe('saved places and visits are independent', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await migratedP0();
  });

  it('a second visit to the same place is a separate record; the place stays saved once', async () => {
    await asUser(
      db,
      USER_A,
      async (tx) => {
        await tx.query(
          `insert into app.trip_stops (owner_id, trip_id, trip_place_id, day, position) values ($1, $2, $3, '2026-11-20', 0)`,
          [USER_A, TRIP_ISRAEL, membershipId(3)],
        );
        // Twice on the same day is allowed too (sunrise and sunset).
        await tx.query(
          `insert into app.trip_stops (owner_id, trip_id, trip_place_id, day, position) values ($1, $2, $3, '2026-11-20', 1)`,
          [USER_A, TRIP_ISRAEL, membershipId(3)],
        );
      },
      { commit: true },
    );
    expect(await scalar(db, `select count(*)::int from app.trip_stops where trip_place_id = $1`, [membershipId(3)])).toBe(3);
    expect(await scalar(db, `select count(*)::int from app.trip_places where trip_id = $1 and place_id = $2`, [TRIP_ISRAEL, placeId(3)])).toBe(1);
  });

  it('removing every visit keeps the place saved to the trip', async () => {
    const before = await rows(db, `select id, deleted_at, version from app.trip_places where id = $1`, [membershipId(6)]);
    await asUser(
      db,
      USER_A,
      (tx) => tx.query(`update app.trip_stops set deleted_at = now() where trip_place_id = $1`, [membershipId(6)]),
      { commit: true },
    );
    const after = await rows<{ deleted_at: string | null; day: string | null }>(
      db,
      `select deleted_at, day::text from app.trip_places where id = $1`,
      [membershipId(6)],
    );
    expect(before).toHaveLength(1);
    // Still saved (not deleted); the legacy mirror shows it unscheduled, as the old app expects.
    expect(after).toEqual([{ deleted_at: null, day: null }]);
  });

  it('scheduling a saved-only place adds a visit and does not remove it from saved places', async () => {
    await asUser(
      db,
      USER_A,
      (tx) =>
        tx.query(`insert into app.trip_stops (owner_id, trip_id, trip_place_id, day) values ($1, $2, $3, '2026-11-27')`, [
          USER_A,
          TRIP_NY,
          membershipId(11),
        ]),
      { commit: true },
    );
    expect(await scalar(db, `select deleted_at is null from app.trip_places where id = $1`, [membershipId(11)])).toBe(true);
    expect(await scalar(db, `select day::text from app.trip_places where id = $1`, [membershipId(11)])).toBe('2026-11-27');
  });
});

describe('compatibility mirror (legacy columns follow the earliest active visit)', () => {
  it('moves the legacy day to an earlier new visit and back when it is removed', async () => {
    const db = await migratedP0();
    const id = await asUser(
      db,
      USER_A,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            `insert into app.trip_stops (owner_id, trip_id, trip_place_id, day, position, start_time) values ($1, $2, $3, '2026-11-23', 0, '08:00') returning id`,
            [USER_A, TRIP_NY, membershipId(8)],
          )
        ).rows[0]!.id,
      { commit: true },
    );
    expect(await rows(db, `select day::text, start_time::text from app.trip_places where id = $1`, [membershipId(8)])).toEqual([
      { day: '2026-11-23', start_time: '08:00:00' },
    ]);
    await asUser(db, USER_A, (tx) => tx.query(`update app.trip_stops set deleted_at = now() where id = $1`, [id]), { commit: true });
    expect(await rows(db, `select day::text, start_time::text from app.trip_places where id = $1`, [membershipId(8)])).toEqual([
      { day: '2026-11-25', start_time: '09:00:00' },
    ]);
  });

  it('does not bump the legacy row when nothing visible changes', async () => {
    const db = await migratedP0();
    const v0 = await scalar<number>(db, `select version from app.trip_places where id = $1`, [membershipId(9)]);
    await asUser(
      db,
      USER_A,
      (tx) =>
        tx.query(`update app.trip_stops set status = 'completed', completed_at = now(), completion_source = 'user' where trip_place_id = $1`, [
          membershipId(9),
        ]),
      { commit: true },
    );
    expect(await scalar(db, `select version from app.trip_places where id = $1`, [membershipId(9)])).toBe(v0);
  });
});

describe('visit lifecycle', () => {
  let db: TestDb;
  let stop: string;
  beforeEach(async () => {
    db = await migratedP0();
    stop = await scalar<string>(db, `select id from app.trip_stops where trip_place_id = $1`, [membershipId(10)]);
  });

  it('allows planned → in progress → completed → reset to planned, and skip', async () => {
    await db.query(`update app.trip_stops set status = 'in_progress', arrived_at = now() where id = $1`, [stop]);
    await db.query(`update app.trip_stops set status = 'completed', completed_at = now(), completion_source = 'user' where id = $1`, [stop]);
    await db.query(
      `update app.trip_stops set status = 'planned', arrived_at = null, completed_at = null, completion_source = null where id = $1`,
      [stop],
    );
    await db.query(`update app.trip_stops set status = 'skipped', skipped_at = now() where id = $1`, [stop]);
    expect(await scalar(db, `select status from app.trip_stops where id = $1`, [stop])).toBe('skipped');
  });

  it.each([
    [`status = 'cancelled'`, 'trip_stops_status_valid'],
    [`completed_at = now()`, 'trip_stops_status_consistent'],
    [`status = 'in_progress'`, 'trip_stops_status_consistent'],
    [`status = 'completed', completed_at = now()`, 'trip_stops_completion_source_valid'],
    [`status = 'skipped', skipped_at = now(), completed_at = now()`, 'trip_stops_status_consistent'],
    [`completion_source = 'user'`, 'trip_stops_completion_source_valid'],
    [`duration_minutes = 2`, 'trip_stops_duration_range'],
    [`time_zone = 'not a zone'`, 'trip_stops_time_zone_format'],
  ])('rejects %s', async (set, constraint) => {
    expect(await rejects(db, `update app.trip_stops set ${set} where id = $1`, [stop])).toContain(constraint);
  });

  it('rejects a visit whose membership belongs to another trip (composite key)', async () => {
    const message = await rejects(
      db,
      `insert into app.trip_stops (owner_id, trip_id, trip_place_id, day) values ($1, $2, $3, '2026-11-24')`,
      [USER_A, TRIP_NY, membershipId(1)],
    );
    expect(message).toContain('trip_stops_membership_fk');
  });
});

describe('stay and place constraints', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await migratedP0();
  });

  it.each([
    [`check_in = '2026-11-20', check_out = '2026-11-20'`, 'trip_stays_dates_valid'],
    [`check_in = '2026-11-20', check_out = null`, 'trip_stays_dates_valid'],
    [`label = repeat('x', 201)`, 'trip_stays_label_valid'],
    [`label = ' padded'`, 'trip_stays_label_valid'],
    [`place_id = null, label = null`, 'trip_stays_has_place_or_label'],
    [`time_zone = 'Mars/Olympus Mons'`, 'trip_stays_time_zone_format'],
    [`time_zone = 'America/New_York'`, 'trip_stays_time_zone_source_valid'],
    [`time_zone = 'America/New_York', time_zone_source = 'user', time_zone_dataset = '2025c'`, 'trip_stays_time_zone_dataset_valid'],
  ])('stays reject %s', async (set, constraint) => {
    expect(await rejects(db, `update app.trip_stays set ${set} where trip_id = $1`, [TRIP_ISRAEL])).toContain(constraint);
  });

  it('stays accept a confirmed zone and a derived zone with its dataset', async () => {
    await db.query(`update app.trip_stays set time_zone = 'Asia/Jerusalem', time_zone_source = 'user' where trip_id = $1`, [TRIP_ISRAEL]);
    await db.query(
      `update app.trip_stays set time_zone = 'America/New_York', time_zone_source = 'derived', time_zone_dataset = '2025c' where trip_id = $1`,
      [TRIP_NY],
    );
    expect(await scalar(db, `select count(*)::int from app.trip_stays where time_zone is not null`)).toBe(2);
  });

  it('Google places can never carry stored coordinates', async () => {
    expect(await rejects(db, `update app.places set latitude = 40.7, longitude = -73.9 where id = $1`, [placeId(1)])).toContain(
      'places_location_custom_only',
    );
    expect(
      await rejects(db, `update app.places set linked_google_place_id = $2 where id = $1`, [placeId(1), gid('other')]),
    ).toContain('places_linked_google_custom_only');
  });

  it('"Use my own pin": a custom place with user coordinates linked to a Google ID by ID only', async () => {
    await db.query(
      `insert into app.places (owner_id, name, category, latitude, longitude, linked_google_place_id) values ($1, 'My entrance', 'other', 32.08, 34.78, $2)`,
      [USER_A, gid('place1')],
    );
    expect(await scalar(db, `select count(*)::int from app.places where linked_google_place_id is not null`)).toBe(1);
    // The Google place itself is untouched.
    expect(await scalar(db, `select latitude is null and name is null from app.places where id = $1`, [placeId(1)])).toBe(true);
  });

  it.each([
    [`latitude = 32.08`, 'places_location_pair'],
    [`latitude = 91, longitude = 0`, 'places_location_range'],
    [`latitude = 0, longitude = 0`, 'places_location_not_null_island'],
  ])('custom places reject %s', async (set, constraint) => {
    const id = await scalar<string>(db, `insert into app.places (owner_id, name, category) values ($1, 'Market', 'other') returning id`, [USER_A]);
    expect(await rejects(db, `update app.places set ${set} where id = $1`, [id])).toContain(constraint);
  });
});

describe('soft deletion', () => {
  it('deleting a trip hides its stays and visits from active views but keeps completed visits in history', async () => {
    const db = await migratedP0();
    await asUser(db, USER_A, (tx) => tx.query(`update app.trips set deleted_at = now() where id = $1`, [TRIP_ISRAEL]), { commit: true });
    const active = await scalar(
      db,
      `select count(*)::int from app.trip_stays s join app.trips t on t.id = s.trip_id where s.deleted_at is null and t.deleted_at is null`,
    );
    expect(active).toBe(2);
    expect(await scalar(db, `select count(*)::int from app.place_visits where trip_id = $1`, [TRIP_ISRAEL])).toBe(2);
    // Rows are still there (soft delete), nothing was hard-deleted.
    expect(await scalar(db, `select count(*)::int from app.trip_stops where trip_id = $1`, [TRIP_ISRAEL])).toBe(4);
  });
});

afterEach(closeAll);
