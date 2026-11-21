import type { TestDb } from '../../testing/pg.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRIP_ISRAEL, USER_A, USER_B, membershipId, placeId, seedP0Profile, seedSecondUser } from '../../testing/d1-fixture.js';
import { applyD1, asUser, createDatabase, scalar } from '../../testing/pg.js';
import { closeAll } from '../../testing/pg.js';

const B_TRIP = '90000000-0000-4000-8000-000000000001';
const B_PLACE = '90000000-0000-4000-8000-000000000002';
const B_MEMBERSHIP = '90000000-0000-4000-8000-000000000003';

async function denied(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the database to refuse');
}

describe('row-level security isolation (D1 tables and view)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createDatabase({ until: '20261118120000' });
    await seedP0Profile(db);
    await applyD1(db);
    await seedSecondUser(db);
    // User B has a trip, a place and a membership of their own.
    await db.query(`insert into app.trips (id, owner_id, title, start_date, end_date) values ($1, $2, 'B trip', '2026-12-01', '2026-12-03')`, [
      B_TRIP,
      USER_B,
    ]);
    await db.query(`insert into app.places (id, owner_id, name, category) values ($1, $2, 'B place', 'other')`, [B_PLACE, USER_B]);
    await db.query(`insert into app.trip_places (id, owner_id, trip_id, place_id) values ($1, $2, $3, $4)`, [
      B_MEMBERSHIP,
      USER_B,
      B_TRIP,
      B_PLACE,
    ]);
  });

  it('the owner sees their visits, stays and history', async () => {
    await asUser(db, USER_A, async (tx) => {
      expect(await scalar(tx, 'select count(*)::int from app.trip_stops')).toBe(12);
      expect(await scalar(tx, 'select count(*)::int from app.trip_stays')).toBe(28);
      expect(await scalar(tx, 'select count(*)::int from app.place_visits')).toBe(2);
    });
  });

  it("another user sees none of them, including through the history view", async () => {
    await asUser(db, USER_B, async (tx) => {
      expect(await scalar(tx, 'select count(*)::int from app.trip_stops')).toBe(0);
      expect(await scalar(tx, 'select count(*)::int from app.trip_stays')).toBe(0);
      expect(await scalar(tx, 'select count(*)::int from app.place_visits')).toBe(0);
    });
  });

  it('another user cannot add a visit to my trip, even with their own owner id', async () => {
    const message = await denied(() =>
      asUser(db, USER_B, (tx) =>
        tx.query(`insert into app.trip_stops (owner_id, trip_id, trip_place_id, day) values ($1, $2, $3, '2026-11-18')`, [
          USER_B,
          TRIP_ISRAEL,
          membershipId(1),
        ]),
      ),
    );
    expect(message).toMatch(/row-level security|violates/);
  });

  it('another user cannot point their trip at my membership or my place', async () => {
    expect(
      await denied(() =>
        asUser(db, USER_B, (tx) =>
          tx.query(`insert into app.trip_stops (owner_id, trip_id, trip_place_id, day) values ($1, $2, $3, '2026-12-01')`, [
            USER_B,
            B_TRIP,
            membershipId(1),
          ]),
        ),
      ),
    ).toMatch(/row-level security|violates/);
    expect(
      await denied(() =>
        asUser(db, USER_B, (tx) =>
          tx.query(`insert into app.trip_stays (owner_id, trip_id, place_id) values ($1, $2, $3)`, [USER_B, B_TRIP, placeId(1)]),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it("another user's updates touch nothing of mine", async () => {
    const changed = await asUser(db, USER_B, async (tx) => {
      const stops = await tx.query(`update app.trip_stops set day = '2026-11-19'`);
      const stays = await tx.query(`update app.trip_stays set label = 'mine now'`);
      return (stops.affectedRows ?? 0) + (stays.affectedRows ?? 0);
    });
    expect(changed).toBe(0);
    expect(await scalar(db, `select count(*)::int from app.trip_stays where label = 'mine now'`)).toBe(0);
  });

  it('a user can work with their own trip normally', async () => {
    await asUser(db, USER_B, async (tx) => {
      await tx.query(`insert into app.trip_stops (owner_id, trip_id, trip_place_id, day) values ($1, $2, $3, '2026-12-02')`, [
        USER_B,
        B_TRIP,
        B_MEMBERSHIP,
      ]);
      await tx.query(`insert into app.trip_stays (owner_id, trip_id, place_id, label) values ($1, $2, $3, 'Cabin')`, [USER_B, B_TRIP, B_PLACE]);
      expect(await scalar(tx, 'select count(*)::int from app.trip_stops')).toBe(1);
    });
  });

  it('nobody signed in can hard-delete visits or stays (soft delete only)', async () => {
    expect(await denied(() => asUser(db, USER_A, (tx) => tx.query('delete from app.trip_stops')))).toMatch(/permission denied/);
    expect(await denied(() => asUser(db, USER_A, (tx) => tx.query('delete from app.trip_stays')))).toMatch(/permission denied/);
  });

  it('the backfill bookkeeping table is invisible to users', async () => {
    expect(
      await denied(() => asUser(db, USER_A, (tx) => tx.query('select * from app.d1_backfill_created_places'))),
    ).toMatch(/permission denied/);
  });

  it('anonymous callers have no access at all', async () => {
    await db.exec('begin');
    try {
      await db.exec('set local role anon');
      const message = await denied(() => db.query('select * from app.trip_stops'));
      expect(message).toMatch(/permission denied/);
    } finally {
      await db.exec('rollback');
    }
  });
});

afterAll(closeAll);
