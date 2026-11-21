import type { TestDb } from './pg.js';

/**
 * Synthetic data reproducing the real P0 profile (Nov 18, 2026), with no real
 * content: 1 user; 38 trips (3 active, all dated, all with a Google hotel AND
 * typed "Staying at" text; 35 soft-deleted); 34 places (13 active, all Google;
 * 21 soft-deleted); 49 trip memberships (16 active: 12 scheduled, 4 saved only,
 * 6 with a start time; 33 soft-deleted); 3 places in more than one trip;
 * 2 visited marks, both made on their scheduled day (case A); 0 journal rows;
 * 11 usage rows. A second user exists only for RLS tests.
 */

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';

const uuid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const tripId = (n: number) => uuid('10', n);
export const placeId = (n: number) => uuid('20', n);
export const membershipId = (n: number) => uuid('30', n);
/** A fake Google place ID; the separator keeps e.g. place1 and place10 distinct. */
export const gid = (label: string) => `ChIJ${`${label}_`.padEnd(16, '0')}`;

export const TRIP_ISRAEL = tripId(1);
export const TRIP_NY = tripId(2);
export const TRIP_ROME = tripId(3);

/** The user's own "Staying at" texts (must survive byte for byte). */
export const LABEL_ISRAEL = 'Hotel near the beach, Tel Aviv';
export const LABEL_NY = 'Pod Times Square (room 1204, ask for late checkout)';
/** 200 characters exactly, Hebrew + punctuation: longer than places.my_label allows. */
export const LABEL_ROME = ('מלון ליד הקולוסיאום — כניסה מהחצר, קוד 4711. ').repeat(5).slice(0, 200).trimEnd().padEnd(200, 'א');

export const HOTEL_ISRAEL = gid('hotelIsrael');
export const HOTEL_NY = gid('hotelNewYork');
export const HOTEL_ROME = gid('hotelRome');

export const VISITED_P1 = '2026-11-18T09:02:57.487510Z';
export const VISITED_P2 = '2026-11-18T09:42:01.932842Z';

/** The fixture's single real-profile user (P0 had exactly one). */
export async function seedUsers(db: TestDb): Promise<void> {
  await db.query(`insert into auth.users (id, email) values ($1, 'a@example.test')`, [USER_A]);
}

/** A second user, only for row-level security tests. */
export async function seedSecondUser(db: TestDb): Promise<void> {
  await db.query(`insert into auth.users (id, email) values ($1, 'b@example.test')`, [USER_B]);
}

/** The P0 profile. Run on a database migrated up to (not including) D1. */
export async function seedP0Profile(db: TestDb): Promise<void> {
  await seedUsers(db);

  // Active trips: dated, Google hotel + the user's own text.
  await db.query(
    `insert into app.trips (id, owner_id, title, destination, start_date, end_date, base_location, base_google_place_id) values
     ($1, $4, 'Israel', 'Tel Aviv', '2026-11-16', '2026-11-20', $5, $8),
     ($2, $4, 'New York', 'New York', '2026-11-23', '2026-11-29', $6, $9),
     ($3, $4, 'Rome', 'Rome', '2027-03-01', '2027-03-05', $7, $10)`,
    [TRIP_ISRAEL, TRIP_NY, TRIP_ROME, USER_A, LABEL_ISRAEL, LABEL_NY, LABEL_ROME, HOTEL_ISRAEL, HOTEL_NY, HOTEL_ROME],
  );

  // 35 soft-deleted trips: 20 with a Google hotel (one shares the NY hotel,
  // one shares hotel D1 with another deleted trip), 5 with text only, 10 with neither.
  for (let n = 101; n <= 135; n += 1) {
    const i = n - 100;
    const hotel = i <= 20 ? (i === 1 ? HOTEL_NY : i === 3 ? gid('deletedHotel2') : gid(`deletedHotel${i}`)) : null;
    const text = i <= 20 ? (i % 2 === 0 ? `Old stay ${i}` : null) : i <= 25 ? `Friend's flat ${i}` : null;
    await db.query(
      `insert into app.trips (id, owner_id, title, start_date, end_date, base_location, base_google_place_id, deleted_at)
       values ($1, $2, $3, '2026-10-01', '2026-10-04', $4, $5, $6)`,
      [tripId(n), USER_A, `Test trip ${i}`, text, hotel, `2026-11-${String(10 + (i % 8)).padStart(2, '0')}T12:00:00Z`],
    );
  }

  // 13 active Google places; P1 and P2 carry the two visited marks.
  for (let n = 1; n <= 13; n += 1) {
    await db.query(`insert into app.places (id, owner_id, google_place_id, category, visited_at) values ($1, $2, $3, $4, $5)`, [
      placeId(n),
      USER_A,
      gid(`place${n}`),
      n === 1 ? 'coffee' : n === 2 ? 'food' : 'sights',
      n === 1 ? VISITED_P1 : n === 2 ? VISITED_P2 : null,
    ]);
  }
  // 21 soft-deleted Google places.
  for (let n = 101; n <= 121; n += 1) {
    await db.query(
      `insert into app.places (id, owner_id, google_place_id, category, deleted_at) values ($1, $2, $3, 'other', '2026-11-12T08:00:00Z')`,
      [placeId(n), USER_A, gid(`gone${n}`)],
    );
  }

  // 16 active memberships in active trips: 12 scheduled (6 with a time), 4 saved only.
  // Places in more than one trip: P1 (Israel + NY), P3 (Israel + Rome), P6 (NY + Rome).
  const active: [number, string, number, string | null, number, string | null][] = [
    // [membership, trip, place, day, position, start_time]
    [1, TRIP_ISRAEL, 1, '2026-11-18', 0, '09:30'],
    [2, TRIP_ISRAEL, 2, '2026-11-18', 1, '10:10'],
    [3, TRIP_ISRAEL, 3, '2026-11-19', 0, null],
    [4, TRIP_ISRAEL, 4, '2026-11-19', 1, null],
    [5, TRIP_ISRAEL, 5, null, 0, null],
    [6, TRIP_NY, 6, '2026-11-24', 0, '10:00'],
    [7, TRIP_NY, 7, '2026-11-24', 1, '13:00'],
    [8, TRIP_NY, 8, '2026-11-25', 0, '09:00'],
    [9, TRIP_NY, 9, '2026-11-25', 1, null],
    [10, TRIP_NY, 10, '2026-11-26', 0, null],
    [11, TRIP_NY, 11, null, 0, null],
    [12, TRIP_NY, 1, null, 0, null],
    [13, TRIP_ROME, 12, '2027-03-02', 0, '11:00'],
    [14, TRIP_ROME, 13, '2027-03-02', 1, null],
    [15, TRIP_ROME, 6, '2027-03-03', 0, null],
    [16, TRIP_ROME, 3, null, 0, null],
  ];
  for (const [m, trip, place, day, position, time] of active) {
    await db.query(
      `insert into app.trip_places (id, owner_id, trip_id, place_id, day, position, start_time) values ($1, $2, $3, $4, $5, $6, $7)`,
      [membershipId(m), USER_A, trip, placeId(place), day, position, time],
    );
  }

  // 33 soft-deleted memberships (removed places: day cleared, as the API does).
  for (let n = 101; n <= 133; n += 1) {
    const i = n - 100;
    const trip = i <= 6 ? TRIP_NY : tripId(100 + i);
    await db.query(
      `insert into app.trip_places (id, owner_id, trip_id, place_id, day, position, deleted_at) values ($1, $2, $3, $4, null, 0, '2026-11-13T09:00:00Z')`,
      [membershipId(n), USER_A, trip, placeId(100 + ((i - 1) % 21) + 1)],
    );
  }

  // 11 usage rows (service table, no user data).
  for (let d = 1; d <= 11; d += 1) {
    await db.query(`insert into app.provider_usage (day, metric, count) values ($1, 'google_place_details', $2)`, [
      `2026-11-${String(d).padStart(2, '0')}`,
      d * 3,
    ]);
  }
}

/** The P0 profile counts, computed the same way as the P0 query (02_profile.sql). */
export async function profileCounts(db: TestDb): Promise<Record<string, number>> {
  const q = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0]?.n ?? -1);
  const sched = `select tp.* from app.trip_places tp join app.trips t on t.id = tp.trip_id
                 where tp.deleted_at is null and t.deleted_at is null and tp.day is not null`;
  return {
    users: await q(`select count(*)::int as n from app.profiles`),
    trips_total: await q(`select count(*)::int as n from app.trips`),
    trips_active: await q(`select count(*)::int as n from app.trips where deleted_at is null`),
    trips_active_dated: await q(`select count(*)::int as n from app.trips where deleted_at is null and start_date is not null`),
    trips_active_google_and_text: await q(
      `select count(*)::int as n from app.trips where deleted_at is null and base_google_place_id is not null and base_location is not null`,
    ),
    hotels_in_collection: await q(
      `select count(*)::int as n from app.trips t where deleted_at is null and base_google_place_id is not null
       and exists (select 1 from app.places p where p.owner_id = t.owner_id and p.google_place_id = t.base_google_place_id and p.deleted_at is null)`,
    ),
    places_total: await q(`select count(*)::int as n from app.places`),
    places_active: await q(`select count(*)::int as n from app.places where deleted_at is null`),
    places_active_google: await q(`select count(*)::int as n from app.places where deleted_at is null and google_place_id is not null`),
    places_visited: await q(`select count(*)::int as n from app.places where deleted_at is null and visited_at is not null`),
    places_multi_trip: await q(
      `select count(*)::int as n from (select tp.place_id from app.trip_places tp join app.trips t on t.id = tp.trip_id
       where tp.deleted_at is null and t.deleted_at is null group by tp.place_id having count(distinct tp.trip_id) > 1) x`,
    ),
    memberships_total: await q(`select count(*)::int as n from app.trip_places`),
    memberships_deleted: await q(`select count(*)::int as n from app.trip_places where deleted_at is not null`),
    memberships_active: await q(
      `select count(*)::int as n from app.trip_places tp join app.trips t on t.id = tp.trip_id where tp.deleted_at is null and t.deleted_at is null`,
    ),
    scheduled: await q(`select count(*)::int as n from (${sched}) s`),
    scheduled_with_time: await q(`select count(*)::int as n from (${sched}) s where start_time is not null`),
    journal: await q(`select count(*)::int as n from app.trip_journal_days`),
    usage_rows: await q(`select count(*)::int as n from app.provider_usage`),
  };
}

/** The real numbers from P0 (out_02_profile.json, Nov 18). */
export const P0_PROFILE: Record<string, number> = {
  users: 1,
  trips_total: 38,
  trips_active: 3,
  trips_active_dated: 3,
  trips_active_google_and_text: 3,
  hotels_in_collection: 0,
  places_total: 34,
  places_active: 13,
  places_active_google: 13,
  places_visited: 2,
  places_multi_trip: 3,
  memberships_total: 49,
  memberships_deleted: 33,
  memberships_active: 16,
  scheduled: 12,
  scheduled_with_time: 6,
  journal: 0,
  usage_rows: 11,
};

/**
 * Edge cases P0 did not contain but the migration must handle safely.
 * Seeded for USER_A on top of seedUsers (not with the P0 profile).
 */
export async function seedEdgeCases(db: TestDb): Promise<void> {
  await seedUsers(db);
  await db.query(
    `insert into app.trips (id, owner_id, title, start_date, end_date, base_location, base_google_place_id, deleted_at) values
     ($1, $7, 'Dated', '2026-06-01', '2026-06-05', null, null, null),
     ($2, $7, 'Other dated', '2026-08-01', '2026-08-03', null, null, null),
     ($3, $7, 'No dates', null, null, 'A friend''s sofa', null, null),
     ($4, $7, 'One day', '2026-09-09', '2026-09-09', null, $8, null),
     ($5, $7, 'Hotel already deleted', '2026-10-01', '2026-10-03', null, $9, null),
     ($6, $7, 'Deleted, completed visit', '2026-05-01', '2026-05-03', null, null, '2026-05-10T00:00:00Z')`,
    [tripId(201), tripId(202), tripId(203), tripId(204), tripId(205), tripId(206), USER_A, gid('oneDayHotel'), gid('deletedHotelPlace')],
  );
  const places: [number, string | null, string | null][] = [
    // [n, visited_at, deleted_at]
    [201, '2026-03-01T10:00:00Z', null], // B: scheduled once, mark outside the trip dates
    [202, '2026-06-02T10:00:00Z', null], // C: scheduled in two trips
    [203, '2025-05-01T10:00:00Z', null], // D: never scheduled
    [204, '2026-01-01T10:00:00Z', null], // E: scheduled in a trip without dates
    [205, null, '2026-09-01T00:00:00Z'], // soft-deleted place whose Google ID is trip 205's hotel
    [206, '2026-05-02T10:00:00Z', null], // A, in a trip that is deleted (history must survive)
  ];
  for (const [n, visited, deleted] of places) {
    await db.query(
      `insert into app.places (id, owner_id, google_place_id, category, visited_at, deleted_at) values ($1, $2, $3, 'sights', $4, $5)`,
      [placeId(n), USER_A, n === 205 ? gid('deletedHotelPlace') : gid(`edge${n}`), visited, deleted],
    );
  }
  const memberships: [number, string, number, string | null][] = [
    [201, tripId(201), 201, '2026-06-02'],
    [202, tripId(201), 202, '2026-06-03'],
    [203, tripId(202), 202, '2026-08-02'],
    [204, tripId(203), 204, '2026-01-01'],
    [205, tripId(206), 206, '2026-05-02'],
  ];
  for (const [m, trip, place, day] of memberships) {
    await db.query(`insert into app.trip_places (id, owner_id, trip_id, place_id, day, position) values ($1, $2, $3, $4, $5, 0)`, [
      membershipId(m),
      USER_A,
      trip,
      placeId(place),
      day,
    ]);
  }
}
