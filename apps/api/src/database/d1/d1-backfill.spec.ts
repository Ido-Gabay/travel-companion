import type { TestDb } from '../../testing/pg.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HOTEL_ISRAEL,
  HOTEL_NY,
  HOTEL_ROME,
  LABEL_ISRAEL,
  LABEL_NY,
  LABEL_ROME,
  P0_PROFILE,
  TRIP_ISRAEL,
  TRIP_NY,
  TRIP_ROME,
  USER_A,
  VISITED_P1,
  VISITED_P2,
  membershipId,
  placeId,
  profileCounts,
  seedP0Profile,
} from '../../testing/d1-fixture.js';
import { D1_VERSION, applyD1, createDatabase, legacyFingerprint, migrationFiles, rows, scalar } from '../../testing/pg.js';
import { closeAll } from '../../testing/pg.js';

const PRE_D1 = '20261118120000';

describe('migration chain', () => {
  it('applies every migration on an empty database, D1 last', async () => {
    const versions = migrationFiles().map((m) => m.version);
    expect(versions.at(-1)).toBe(D1_VERSION);
    const db = await createDatabase();
    const applied = await rows<{ version: string }>(db, 'select version from supabase_migrations.schema_migrations order by version');
    expect(applied.map((r) => r.version)).toEqual(versions);
    // The backfill on an empty database creates nothing.
    expect(await scalar(db, 'select count(*)::int from app.trip_stops')).toBe(0);
    expect(await scalar(db, 'select count(*)::int from app.trip_stays')).toBe(0);
  });

  it('creates the D1 objects (2 tables, the view, the mirror) with RLS on', async () => {
    const db = await createDatabase();
    const rls = await rows<{ relname: string; relrowsecurity: boolean }>(
      db,
      `select relname, relrowsecurity from pg_class where relnamespace = 'app'::regnamespace and relname in ('trip_stops','trip_stays','d1_backfill_created_places') order by 1`,
    );
    expect(rls).toEqual([
      { relname: 'd1_backfill_created_places', relrowsecurity: true },
      { relname: 'trip_stays', relrowsecurity: true },
      { relname: 'trip_stops', relrowsecurity: true },
    ]);
    expect(await scalar(db, `select count(*)::int from information_schema.views where table_schema='app' and table_name='place_visits'`)).toBe(1);
    const triggers = await rows<{ t: string }>(
      db,
      `select tgrelid::regclass::text || '.' || tgname as t from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'app.%' order by 1`,
    );
    // The six existing *_touch triggers (unverified on Supabase until the deploy step) + 3 new.
    expect(triggers.map((r) => r.t)).toEqual([
      'app.places.places_touch',
      'app.profiles.profiles_touch',
      'app.trip_journal_days.trip_journal_days_touch',
      'app.trip_places.trip_places_touch',
      'app.trip_stays.trip_stays_touch',
      'app.trip_stops.trip_stops_mirror_legacy',
      'app.trip_stops.trip_stops_touch',
      'app.trips.trips_touch',
      'app.user_preferences.user_preferences_touch',
    ]);
  });
});

describe('backfill on the P0 profile', () => {
  let db: TestDb;
  let before: Record<string, string>;
  let profile: Record<string, number>;

  beforeAll(async () => {
    db = await createDatabase({ until: PRE_D1 });
    await seedP0Profile(db);
    profile = await profileCounts(db);
    before = await legacyFingerprint(db);
    await applyD1(db);
  });

  it('the fixture reproduces the real P0 numbers', () => {
    expect(profile).toEqual(P0_PROFILE);
  });

  it('changes no existing value, version or timestamp (data preservation)', async () => {
    expect(await legacyFingerprint(db)).toEqual(before);
    const marks = await rows<{ id: string; visited_at: string }>(
      db,
      `select id, to_char(visited_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as visited_at from app.places where visited_at is not null order by id`,
    );
    expect(marks).toEqual([
      { id: placeId(1), visited_at: VISITED_P1 },
      { id: placeId(2), visited_at: VISITED_P2 },
    ]);
  });

  it('creates exactly one visit per scheduled membership: 12, copied field by field', async () => {
    expect(await scalar(db, 'select count(*)::int from app.trip_stops')).toBe(12);
    expect(await scalar(db, 'select count(*)::int from app.trip_stops where not from_legacy')).toBe(0);
    const mismatches = await scalar(
      db,
      `select count(*)::int from app.trip_stops s join app.trip_places tp on tp.id = s.trip_place_id
       where (s.trip_id, s.day, s.position, s.start_time, s.duration_minutes, s.highlight, s.owner_id)
         is distinct from (tp.trip_id, tp.day, tp.position, tp.start_time, tp.duration_minutes, tp.highlight, tp.owner_id)`,
    );
    expect(mismatches).toBe(0);
    expect(await scalar(db, 'select count(*)::int from app.trip_stops where start_time is not null')).toBe(6);
    // Saved-only memberships get no visit and stay saved.
    expect(
      await scalar(db, `select count(*)::int from app.trip_places tp where tp.deleted_at is null and tp.day is null
        and not exists (select 1 from app.trip_stops s where s.trip_place_id = tp.id)`),
    ).toBe(4);
  });

  it('turns the two unambiguous marks into completed visits at the exact marked moment', async () => {
    const completed = await rows<{ trip_place_id: string; completed_at: string; completion_source: string }>(
      db,
      `select trip_place_id, to_char(completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as completed_at, completion_source
       from app.trip_stops where status = 'completed' order by trip_place_id`,
    );
    expect(completed).toEqual([
      { trip_place_id: membershipId(1), completed_at: VISITED_P1, completion_source: 'migrated' },
      { trip_place_id: membershipId(2), completed_at: VISITED_P2, completion_source: 'migrated' },
    ]);
    expect(await scalar(db, `select count(*)::int from app.trip_stops where status = 'planned'`)).toBe(10);
    expect(await scalar(db, `select count(*)::int from app.trip_stops where arrived_at is not null or skipped_at is not null`)).toBe(0);
  });

  it('history shows each visit once (no duplicate legacy mark)', async () => {
    const history = await rows<{ place_id: string; source: string }>(
      db,
      `select place_id, source from app.place_visits order by place_id, source`,
    );
    expect(history).toEqual([
      { place_id: placeId(1), source: 'visit' },
      { place_id: placeId(2), source: 'visit' },
    ]);
  });

  it('keeps the user\'s "Staying at" text byte for byte, including a 200-character Hebrew label', async () => {
    const stays = await rows<{ trip_id: string; label: string; check_in: string; check_out: string; gid: string; category: string }>(
      db,
      `select s.trip_id, s.label, s.check_in::text, s.check_out::text, p.google_place_id as gid, p.category
       from app.trip_stays s join app.places p on p.id = s.place_id
       join app.trips t on t.id = s.trip_id
       where s.deleted_at is null and t.deleted_at is null order by s.trip_id`,
    );
    expect(stays).toEqual([
      { trip_id: TRIP_ISRAEL, label: LABEL_ISRAEL, check_in: '2026-11-16', check_out: '2026-11-20', gid: HOTEL_ISRAEL, category: 'stay' },
      { trip_id: TRIP_NY, label: LABEL_NY, check_in: '2026-11-23', check_out: '2026-11-29', gid: HOTEL_NY, category: 'stay' },
      { trip_id: TRIP_ROME, label: LABEL_ROME, check_in: '2027-03-01', check_out: '2027-03-05', gid: HOTEL_ROME, category: 'stay' },
    ]);
    expect(LABEL_ROME.length).toBe(200);
    const equal = await scalar(
      db,
      `select bool_and(s.label is not distinct from t.base_location and octet_length(s.label) is not distinct from octet_length(t.base_location))
       from app.trip_stays s join app.trips t on t.id = s.trip_id`,
    );
    expect(equal).toBe(true);
  });

  it('preserves stays of deleted trips, deleted with their trip and hidden from active views', async () => {
    // 20 deleted trips with a hotel + 5 with text only.
    const deleted = await rows<{ n: number; same_time: boolean; label_only: number }>(
      db,
      `select count(*)::int as n,
              bool_and(s.deleted_at = t.deleted_at) as same_time,
              count(*) filter (where s.place_id is null)::int as label_only
       from app.trip_stays s join app.trips t on t.id = s.trip_id where t.deleted_at is not null`,
    );
    expect(deleted).toEqual([{ n: 25, same_time: true, label_only: 5 }]);
    // What an active-trip query sees.
    expect(
      await scalar(db, `select count(*)::int from app.trip_stays s join app.trips t on t.id = s.trip_id
        where s.deleted_at is null and t.deleted_at is null`),
    ).toBe(3);
  });

  it('creates hotel places only where missing: under Stays, one per hotel, deleted when only deleted trips use it', async () => {
    const created = await rows<{ active: number; deleted: number; all_stay: boolean }>(
      db,
      `select count(*) filter (where p.deleted_at is null)::int as active,
              count(*) filter (where p.deleted_at is not null)::int as deleted,
              bool_and(p.category = 'stay') as all_stay
       from app.d1_backfill_created_places c join app.places p on p.id = c.place_id`,
    );
    // 3 active hotels (NY is also used by a deleted trip) + 18 hotels used only by deleted trips (one shared by two).
    expect(created).toEqual([{ active: 3, deleted: 18, all_stay: true }]);
    // Main Saved list (not Stays) is unchanged: the 13 active places.
    expect(await scalar(db, `select count(*)::int from app.places where deleted_at is null and category <> 'stay'`)).toBe(13);
    expect(await scalar(db, `select count(*)::int from app.places where deleted_at is null and category = 'stay'`)).toBe(3);
    // Nothing stored from Google but IDs: hotel places carry no name, address or coordinates.
    expect(
      await scalar(db, `select count(*)::int from app.d1_backfill_created_places c join app.places p on p.id = c.place_id
        where p.name is not null or p.address is not null or p.latitude is not null`),
    ).toBe(0);
  });

  it('does not touch the owner, journal or usage tables', async () => {
    expect(await scalar(db, 'select count(*)::int from app.trip_journal_days')).toBe(0);
    expect(await scalar(db, 'select count(*)::int from app.provider_usage')).toBe(11);
    expect(await scalar(db, `select count(distinct owner_id)::int from app.trip_stops`)).toBe(1);
    expect(await scalar(db, `select min(owner_id::text) from app.trip_stays`)).toBe(USER_A);
  });
});

afterAll(closeAll);
