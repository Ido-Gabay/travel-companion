import { afterEach, describe, expect, it } from 'vitest';
import { apiError, apiServices, asAuthUser, type ApiServices } from '../testing/api.js';
import { USER_A, gid, seedUsers } from '../testing/d1-fixture.js';
import { closeAll, createDatabase, rows, scalar, type TestDb } from '../testing/pg.js';

/** D1 · The v1 adapter: the installed app's writes land on visits and stays, and nothing is guessed. */
afterEach(closeAll);

const user = asAuthUser(USER_A);

async function setup(): Promise<{ db: TestDb; api: ApiServices; tripId: string; a: string; b: string; c: string }> {
  const db = await createDatabase();
  await seedUsers(db);
  const api = await apiServices(db);
  const trip = await api.trips.create(user, {
    title: 'New York',
    destination: 'New York',
    baseLocation: 'Pod Times Square',
    basePlaceId: gid('podHotel'),
    startDate: '2026-11-23',
    endDate: '2026-11-29',
  });
  const { places } = await api.places.saveGoogle(user, {
    items: [
      { googlePlaceId: gid('moma'), category: 'sights' },
      { googlePlaceId: gid('katz'), category: 'food' },
      { googlePlaceId: gid('cafe'), category: 'coffee' },
    ],
    tripId: trip.id,
  });
  return { db, api, tripId: trip.id, a: places[0]!.id, b: places[1]!.id, c: places[2]!.id };
}

const activeStops = (db: TestDb, tripId: string) =>
  rows<{ place_id: string; day: string; position: number; start_time: string | null; status: string }>(
    db,
    `select tp.place_id, s.day::text as day, s.position, to_char(s.start_time, 'HH24:MI') as start_time, s.status
     from app.trip_stops s join app.trip_places tp on tp.id = s.trip_place_id
     where s.trip_id = $1 and s.deleted_at is null order by s.day, s.position`,
    [tripId],
  );

describe('v1 schedule → visits', () => {
  it('plans, times, moves and unplans a place through its single visit; v1 reads stay consistent', async () => {
    const { db, api, tripId, a, b } = await setup();
    await api.trips.schedulePlace(user, tripId, a, { day: '2026-11-24' });
    await api.trips.schedulePlace(user, tripId, b, { day: '2026-11-24', startTime: '10:00' });
    let detail = await api.trips.schedulePlace(user, tripId, a, { startTime: '09:30', durationMinutes: 90, highlight: true });
    expect(await activeStops(db, tripId)).toEqual([
      { place_id: a, day: '2026-11-24', position: 0, start_time: '09:30', status: 'planned' },
      { place_id: b, day: '2026-11-24', position: 1, start_time: '10:00', status: 'planned' },
    ]);
    const planned = detail.places.find((place) => place.id === a)!;
    expect([planned.day, planned.startTime, planned.position, planned.durationMinutes, planned.highlight]).toEqual([
      '2026-11-24', '09:30', 0, 90, true,
    ]);

    // Move a to another day: appended there, the old day closes the gap; time kept.
    detail = await api.trips.schedulePlace(user, tripId, a, { day: '2026-11-25' });
    expect(await activeStops(db, tripId)).toEqual([
      { place_id: b, day: '2026-11-24', position: 0, start_time: '10:00', status: 'planned' },
      { place_id: a, day: '2026-11-25', position: 0, start_time: '09:30', status: 'planned' },
    ]);

    // Back to the wishlist: the visit is removed (soft), the place stays saved with its length and star.
    detail = await api.trips.schedulePlace(user, tripId, a, { day: null });
    const wish = detail.places.find((place) => place.id === a)!;
    expect([wish.day, wish.startTime, wish.position, wish.durationMinutes, wish.highlight]).toEqual([null, null, 0, 90, true]);
    expect(await scalar(db, `select count(*)::int from app.trip_stops where trip_id = $1 and deleted_at is not null`, [tripId])).toBe(1);
    expect(await scalar(db, `select count(*)::int from app.trip_places where trip_id = $1 and deleted_at is null`, [tripId])).toBe(3);

    // Planning it again starts a new visit that carries the wishlist length and star.
    detail = await api.trips.schedulePlace(user, tripId, a, { day: '2026-11-26' });
    const again = detail.places.find((place) => place.id === a)!;
    expect([again.day, again.durationMinutes, again.highlight]).toEqual(['2026-11-26', 90, true]);
  });

  it('keeps the old validation rules', async () => {
    const { api, tripId, a } = await setup();
    expect((await apiError(() => api.trips.schedulePlace(user, tripId, a, { day: '2026-12-01' }))).code).toBe('VALIDATION_FAILED');
    expect((await apiError(() => api.trips.schedulePlace(user, tripId, a, { startTime: '10:00' }))).code).toBe('VALIDATION_FAILED');
  });

  it('refuses (409 CONFLICT, reason USE_NEWER_APP) what v1 cannot express', async () => {
    const { db, api, tripId, a, b } = await setup();
    await api.trips.schedulePlace(user, tripId, a, { day: '2026-11-24' });
    const [membership] = await rows<{ id: string }>(db, `select id from app.trip_places where trip_id = $1 and place_id = $2`, [tripId, a]);
    // A second visit (repeat visit, newer app).
    await api.stops.add(user, tripId, { tripPlaceId: membership!.id, day: '2026-11-27' });
    const repeat = await apiError(() => api.trips.schedulePlace(user, tripId, a, { day: '2026-11-25' }));
    expect([repeat.status, repeat.code, repeat.details]).toEqual([409, 'CONFLICT', [{ path: 'reason', message: 'USE_NEWER_APP' }]]);

    // A visit already done keeps its day; starring it is still fine.
    await api.trips.schedulePlace(user, tripId, b, { day: '2026-11-24' });
    const detail = await api.tripsV2.get(user, tripId);
    const stop = detail.stops.find((s) => s.placeId === b)!;
    await api.stops.transition(user, tripId, stop.id, 'complete', {});
    expect((await apiError(() => api.trips.schedulePlace(user, tripId, b, { day: null }))).details[0]?.message).toBe('USE_NEWER_APP');
    const starred = await api.trips.schedulePlace(user, tripId, b, { highlight: true });
    expect(starred.places.find((place) => place.id === b)?.highlight).toBe(true);
  });

  it('reorders a day by place ids, and refuses a day with two visits to one place', async () => {
    const { db, api, tripId, a, b, c } = await setup();
    for (const place of [a, b, c]) await api.trips.schedulePlace(user, tripId, place, { day: '2026-11-24' });
    await api.trips.reorderDay(user, tripId, '2026-11-24', [c, a, b]);
    expect((await activeStops(db, tripId)).map((s) => s.place_id)).toEqual([c, a, b]);
    expect((await apiError(() => api.trips.reorderDay(user, tripId, '2026-11-24', [a, b]))).code).toBe('CONFLICT');

    const [membership] = await rows<{ id: string }>(db, `select id from app.trip_places where trip_id = $1 and place_id = $2`, [tripId, a]);
    await api.stops.add(user, tripId, { tripPlaceId: membership!.id, day: '2026-11-24' });
    expect((await apiError(() => api.trips.reorderDay(user, tripId, '2026-11-24', [c, a, b]))).details[0]?.message).toBe('USE_NEWER_APP');
  });

  it('removing a place from the trip removes its planned visit but keeps a completed one in history', async () => {
    const { db, api, tripId, a, b } = await setup();
    await api.trips.schedulePlace(user, tripId, a, { day: '2026-11-24' });
    await api.trips.schedulePlace(user, tripId, b, { day: '2026-11-24' });
    const stopB = (await api.tripsV2.get(user, tripId)).stops.find((s) => s.placeId === b)!;
    await api.stops.transition(user, tripId, stopB.id, 'complete', {});
    await api.trips.removePlace(user, tripId, a);
    await api.trips.removePlace(user, tripId, b);
    expect(await scalar(db, `select count(*)::int from app.trip_stops where trip_id = $1 and deleted_at is null`, [tripId])).toBe(1);
    expect((await api.places.visits(user, b)).items.map((v) => v.source)).toEqual(['visit']);
    // The place stays in the collection.
    expect((await api.places.list(user)).items.some((place) => place.id === a)).toBe(true);
  });

  it('D1 Q5: refuses dates that would leave planned places outside (never unplans silently)', async () => {
    const { db, api, tripId, a } = await setup();
    await api.trips.schedulePlace(user, tripId, a, { day: '2026-11-28' });
    const error = await apiError(() => api.trips.update(user, tripId, { endDate: '2026-11-26' }));
    expect([error.status, error.code]).toEqual([400, 'VALIDATION_FAILED']);
    expect(await activeStops(db, tripId)).toHaveLength(1);
    expect((await api.trips.get(user, tripId)).endDate).toBe('2026-11-29');
    // Widening (or shortening around the plan) still works.
    expect((await api.trips.update(user, tripId, { startDate: '2026-11-22', endDate: '2026-11-28' })).endDate).toBe('2026-11-28');
  });
});

describe('v1 trip base fields → stays', () => {
  it('creates a whole-trip stay with the exact text and the hotel as a "stay" place', async () => {
    const { db, api, tripId } = await setup();
    const stays = (await api.tripsV2.get(user, tripId)).stays;
    expect(stays).toHaveLength(1);
    expect([stays[0]!.label, stays[0]!.checkIn, stays[0]!.checkOut]).toEqual(['Pod Times Square', null, null]);
    expect(await scalar(db, `select category from app.places where id = $1`, [stays[0]!.placeId])).toBe('stay');
  });

  it('edits and clears that stay; refuses when the trip has stays for different nights', async () => {
    const { api, tripId } = await setup();
    await api.trips.update(user, tripId, { baseLocation: 'Room 1204' });
    expect((await api.tripsV2.get(user, tripId)).stays.map((s) => s.label)).toEqual(['Room 1204']);
    await api.trips.update(user, tripId, { baseLocation: null, basePlaceId: null });
    expect((await api.tripsV2.get(user, tripId)).stays).toEqual([]);

    await api.stays.create(user, tripId, { placeId: null, label: 'Brooklyn', checkIn: '2026-11-23', checkOut: '2026-11-25' });
    await api.stays.create(user, tripId, { placeId: null, label: 'Midtown', checkIn: '2026-11-25', checkOut: '2026-11-29' });
    const error = await apiError(() => api.trips.update(user, tripId, { baseLocation: 'Somewhere' }));
    expect([error.status, error.details[0]?.message]).toEqual([409, 'USE_NEWER_APP']);
    // Sending the unchanged value (the old edit form sends every field) is fine.
    const trip = await api.trips.get(user, tripId);
    await api.trips.update(user, tripId, { title: 'NYC', baseLocation: trip.baseLocation });
  });

  it('a stay that covered exactly the trip dates follows a date change', async () => {
    const { api, tripId } = await setup();
    await api.trips.update(user, tripId, { baseLocation: null, basePlaceId: null });
    await api.stays.create(user, tripId, { placeId: null, label: 'Pod', checkIn: '2026-11-23', checkOut: '2026-11-29' });
    await api.trips.update(user, tripId, { endDate: '2026-11-30' });
    const [stay] = (await api.tripsV2.get(user, tripId)).stays;
    expect([stay!.checkIn, stay!.checkOut]).toEqual(['2026-11-23', '2026-11-30']);
  });
});
