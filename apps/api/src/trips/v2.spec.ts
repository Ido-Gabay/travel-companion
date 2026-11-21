import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError, apiServices, asAuthUser, type ApiServices } from '../testing/api.js';
import { USER_A, USER_B, gid, seedSecondUser, seedUsers } from '../testing/d1-fixture.js';
import { closeAll, createDatabase, rows, scalar, type TestDb } from '../testing/pg.js';

/** D1 · API v2: visits, their lifecycle, stays, dates and time zones. */
afterEach(closeAll);

const user = asAuthUser(USER_A);
const TIMES_SQUARE = { latitude: 40.758, longitude: -73.9855 };
const MID_ATLANTIC = { latitude: 35, longitude: -40 };

async function setup(): Promise<{ db: TestDb; api: ApiServices; tripId: string; moma: string; pin: string }> {
  const db = await createDatabase();
  await seedUsers(db);
  const api = await apiServices(db);
  const trip = await api.trips.create(user, {
    title: 'New York', destination: null, baseLocation: null, basePlaceId: null, startDate: '2026-11-23', endDate: '2026-11-29',
  });
  await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('moma'), category: 'sights' }], tripId: trip.id });
  const custom = await api.places.create(user, {
    name: 'Aunt Dina', address: null, notes: null, category: 'other', ...TIMES_SQUARE,
  });
  const detail = await api.tripsV2.addMember(user, trip.id, { placeId: custom.id });
  const moma = detail.places.find((place) => place.source === 'google')!.tripPlaceId;
  const pin = detail.places.find((place) => place.id === custom.id)!.tripPlaceId;
  return { db, api, tripId: trip.id, moma, pin };
}

describe('v2 visits', () => {
  it('a saved place can be visited several times; each visit is its own record', async () => {
    const { db, api, tripId, moma } = await setup();
    const first = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24', startTime: '10:00' });
    const second = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-27' });
    expect(first.stop.id).not.toBe(second.stop.id);
    const detail = await api.tripsV2.get(user, tripId);
    expect(detail.stops.map((s) => [s.day, s.position, s.status])).toEqual([
      ['2026-11-24', 0, 'planned'],
      ['2026-11-27', 0, 'planned'],
    ]);
    // v1 still reads one truthful visit: the earliest.
    const legacy = (await api.trips.get(user, tripId)).places.find((p) => p.source === 'google')!;
    expect([legacy.day, legacy.startTime]).toEqual(['2026-11-24', '10:00']);
    // Removing a visit never removes the saved place.
    await api.stops.remove(user, tripId, first.stop.id, false);
    expect(await scalar(db, `select count(*)::int from app.trip_places where id = $1 and deleted_at is null`, [moma])).toBe(1);
  });

  it('a client id makes adding idempotent (offline retries)', async () => {
    const { api, tripId, moma } = await setup();
    const id = randomUUID();
    const once = await api.stops.add(user, tripId, { id, tripPlaceId: moma, day: '2026-11-24' });
    const twice = await api.stops.add(user, tripId, { id, tripPlaceId: moma, day: '2026-11-24' });
    expect(twice.stop).toEqual(once.stop);
    expect((await api.tripsV2.get(user, tripId)).stops).toHaveLength(1);
  });
});

describe('one place, one saved copy (duplicate handling)', () => {
  it('saving the same Google place to a trip twice (or retrying) reuses the place and the membership', async () => {
    const { db, api, tripId, moma } = await setup();
    const again = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('moma'), category: 'sights' }], tripId });
    const detail = await api.tripsV2.get(user, tripId);
    expect(detail.places.filter((place) => place.googlePlaceId === gid('moma')).map((place) => place.tripPlaceId)).toEqual([moma]);
    expect(again.places[0]!.id).toBe(detail.places.find((place) => place.tripPlaceId === moma)!.id);
    expect(await scalar(db, `select count(*)::int from app.places where google_place_id = $1`, [gid('moma')])).toBe(1);
  });

  it('adding the same custom place to a trip twice keeps one membership', async () => {
    const { db, api, tripId, pin } = await setup();
    const placeId = (await api.tripsV2.get(user, tripId)).places.find((place) => place.tripPlaceId === pin)!.id;
    const detail = await api.tripsV2.addMember(user, tripId, { placeId });
    expect(detail.places.filter((place) => place.id === placeId).map((place) => place.tripPlaceId)).toEqual([pin]);
    expect(await scalar(db, `select count(*)::int from app.trip_places where trip_id = $1 and place_id = $2`, [tripId, placeId])).toBe(1);
  });

  it('the same place can be saved to two trips: one place, one membership per trip', async () => {
    const { db, api } = await setup();
    const other = await api.trips.create(user, {
      title: 'Again', destination: null, baseLocation: null, basePlaceId: null, startDate: '2026-12-01', endDate: '2026-12-03',
    });
    await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('moma'), category: 'sights' }], tripId: other.id });
    expect(await scalar(db, `select count(*)::int from app.places where google_place_id = $1`, [gid('moma')])).toBe(1);
    expect(
      await scalar(db, `select count(distinct tp.trip_id)::int from app.trip_places tp join app.places p on p.id = tp.place_id where p.google_place_id = $1`, [gid('moma')]),
    ).toBe(2);
  });

  it('two visits to the same place on the same day stay two records (a legitimate repeat)', async () => {
    const { api, tripId, moma } = await setup();
    await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24', startTime: '09:00' });
    await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24', startTime: '18:00' });
    const detail = await api.tripsV2.get(user, tripId);
    expect(detail.stops.map((stop) => [stop.tripPlaceId, stop.position])).toEqual([
      [moma, 0],
      [moma, 1],
    ]);
  });
});

describe('v2 visits (continued)', () => {

  it('lifecycle: arrive → complete, skip, reset; repeats are no-ops; the rest is 409 INVALID_TRANSITION', async () => {
    const { api, tripId, moma } = await setup();
    const { stop } = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    // An offline action sent later carries when it happened.
    const earlier = new Date(Date.now() - 60 * 60 * 1000);
    earlier.setUTCMilliseconds(0);
    const arrived = await api.stops.transition(user, tripId, stop.id, 'arrive', { at: earlier.toISOString() });
    expect([arrived.stop.status, arrived.stop.arrivedAt]).toEqual(['in_progress', earlier.toISOString()]);
    expect((await api.stops.transition(user, tripId, stop.id, 'arrive', {})).stop.version).toBe(arrived.stop.version);
    const done = await api.stops.transition(user, tripId, stop.id, 'complete', {});
    expect([done.stop.status, done.stop.completionSource]).toEqual(['completed', 'user']);
    expect((await apiError(() => api.stops.transition(user, tripId, stop.id, 'skip', {}))).code).toBe('INVALID_TRANSITION');
    expect((await apiError(() => api.stops.transition(user, tripId, stop.id, 'arrive', {}))).code).toBe('INVALID_TRANSITION');
    expect((await apiError(() => api.stops.update(user, tripId, stop.id, { day: '2026-11-25' }))).code).toBe('INVALID_TRANSITION');
    expect((await api.stops.update(user, tripId, stop.id, { highlight: true })).stop.highlight).toBe(true);
    const reset = await api.stops.transition(user, tripId, stop.id, 'reset', {});
    expect([reset.stop.status, reset.stop.arrivedAt, reset.stop.completedAt, reset.stop.completionSource]).toEqual(['planned', null, null, null]);
    const skipped = await api.stops.transition(user, tripId, stop.id, 'skip', {});
    expect(skipped.stop.status).toBe('skipped');
    expect((await apiError(() => api.stops.transition(user, tripId, stop.id, 'complete', {}))).code).toBe('INVALID_TRANSITION');
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await apiError(() => api.stops.transition(user, tripId, stop.id, 'reset', { at: future }))).code).toBe('VALIDATION_FAILED');
  });

  it('a completed visit is history: removing it needs confirm; it stays after its trip is deleted unless asked', async () => {
    const { db, api, tripId, moma } = await setup();
    const { stop } = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    await api.stops.transition(user, tripId, stop.id, 'complete', {});
    const error = await apiError(() => api.stops.remove(user, tripId, stop.id, false));
    expect([error.status, error.details[0]?.message]).toEqual([409, 'CONFIRM_REQUIRED']);
    const placeId = (await api.tripsV2.get(user, tripId)).places.find((p) => p.tripPlaceId === moma)!.id;

    await api.tripsV2.remove(user, tripId, false);
    expect((await api.places.visits(user, placeId)).items).toMatchObject([{ source: 'visit', tripTitle: 'New York', stopId: stop.id }]);
    expect(await scalar(db, `select count(*)::int from app.trip_stays where trip_id = $1 and deleted_at is null`, [tripId])).toBe(0);
  });

  it('deleting a trip with deleteHistory also removes its completed visits from history', async () => {
    const { api, tripId, moma } = await setup();
    const { stop } = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    await api.stops.transition(user, tripId, stop.id, 'complete', {});
    const placeId = (await api.tripsV2.get(user, tripId)).places.find((p) => p.tripPlaceId === moma)!.id;
    await api.tripsV2.remove(user, tripId, true);
    expect((await api.places.visits(user, placeId)).items).toEqual([]);
  });

  it('reorders a day by visit ids; a stale list is 409', async () => {
    const { api, tripId, moma, pin } = await setup();
    const a = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    const b = await api.stops.add(user, tripId, { tripPlaceId: pin, day: '2026-11-24' });
    const c = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    const detail = await api.stops.reorder(user, tripId, '2026-11-24', [c.stop.id, a.stop.id, b.stop.id]);
    expect(detail.stops.map((s) => s.id)).toEqual([c.stop.id, a.stop.id, b.stop.id]);
    expect((await apiError(() => api.stops.reorder(user, tripId, '2026-11-24', [a.stop.id]))).code).toBe('CONFLICT');
  });

  it('removing a saved place takes its planned visits, keeps completed and skipped ones', async () => {
    const { db, api, tripId, moma } = await setup();
    const planned = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    const done = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-25' });
    const skipped = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-26' });
    await api.stops.transition(user, tripId, done.stop.id, 'complete', {});
    await api.stops.transition(user, tripId, skipped.stop.id, 'skip', {});
    await api.tripsV2.removeMember(user, tripId, moma);
    expect(
      await rows(db, `select id, deleted_at is not null as removed from app.trip_stops where trip_place_id = $1 order by day`, [moma]),
    ).toEqual([
      { id: planned.stop.id, removed: true },
      { id: done.stop.id, removed: false },
      { id: skipped.stop.id, removed: false },
    ]);
  });
});

describe('v2 trip dates (D1 Q5)', () => {
  it('refuses with the list, unless unscheduleOutside; never removes visits that happened', async () => {
    const { db, api, tripId, moma } = await setup();
    const late = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-28' });
    const error = await apiError(() => api.tripsV2.update(user, tripId, { endDate: '2026-11-26' }));
    expect([error.status, error.code, error.details]).toEqual([
      409, 'STOPS_OUTSIDE_DATES', [{ path: `stops.${late.stop.id}`, message: '2026-11-28 planned' }],
    ]);
    await api.stops.transition(user, tripId, late.stop.id, 'complete', {});
    expect((await apiError(() => api.tripsV2.update(user, tripId, { endDate: '2026-11-26', unscheduleOutside: true }))).code).toBe(
      'STOPS_OUTSIDE_DATES',
    );
    await api.stops.transition(user, tripId, late.stop.id, 'reset', {});
    const trip = await api.tripsV2.update(user, tripId, { endDate: '2026-11-26', unscheduleOutside: true });
    expect(trip.endDate).toBe('2026-11-26');
    expect(await scalar(db, `select deleted_at is not null from app.trip_stops where id = $1`, [late.stop.id])).toBe(true);
  });
});

describe('v2 stays', () => {
  it('nights may not overlap (409 STAY_OVERLAP naming the other); one whole-trip stay; v1 base fields follow', async () => {
    const { api, tripId } = await setup();
    const first = await api.stays.create(user, tripId, { placeId: null, label: 'Brooklyn loft', checkIn: '2026-11-23', checkOut: '2026-11-26' });
    const overlap = await apiError(() =>
      api.stays.create(user, tripId, { placeId: null, label: 'Midtown', checkIn: '2026-11-25', checkOut: '2026-11-29' }),
    );
    expect([overlap.code, overlap.details]).toEqual([
      'STAY_OVERLAP', [{ path: `stays.${first.stay.id}`, message: 'Brooklyn loft (2026-11-23..2026-11-26)' }],
    ]);
    await api.stays.create(user, tripId, { placeId: null, label: 'Midtown', checkIn: '2026-11-26', checkOut: '2026-11-29' });
    await api.stays.create(user, tripId, { placeId: null, label: 'Anywhere', checkIn: null, checkOut: null });
    expect((await apiError(() => api.stays.create(user, tripId, { placeId: null, label: 'Twice', checkIn: null, checkOut: null }))).code).toBe(
      'STAY_OVERLAP',
    );
    // v1 reads the stay of the first night.
    expect((await api.trips.get(user, tripId)).baseLocation).toBe('Brooklyn loft');
    await api.stays.remove(user, tripId, first.stay.id);
    expect((await api.trips.get(user, tripId)).baseLocation).toBe('Anywhere');
  });

  it('keeps the exact label, and a Google hotel as its place id only', async () => {
    const { api, tripId } = await setup();
    const label = '  Pod Times Square (room 1204)  ';
    const { places } = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('pod'), category: 'stay' }] });
    const { stay } = await api.stays.create(user, tripId, { placeId: places[0]!.id, label: label.trim(), checkIn: null, checkOut: null });
    expect(stay.label).toBe('Pod Times Square (room 1204)');
    // The hotel comes with the stay (ID only for Google places), so the app can show and locate it.
    expect([stay.place?.googlePlaceId, stay.place?.name]).toEqual([gid('pod'), null]);
    expect((await api.tripsV2.get(user, tripId)).stays[0]?.place?.id).toBe(places[0]!.id);
    expect((await api.trips.get(user, tripId)).basePlaceId).toBe(gid('pod'));
  });
});

describe('time zones (D1 Q3)', () => {
  it('a Google place: suggestion only, stored after the user confirms (source user)', async () => {
    const { db, api, tripId } = await setup();
    const { places } = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('pod'), category: 'stay' }] });
    const created = await api.stays.create(user, tripId, {
      placeId: places[0]!.id, label: null, checkIn: null, checkOut: null, location: TIMES_SQUARE,
    });
    expect(created.stay.timeZone).toBeNull();
    expect(created.timeZoneSuggestion).toMatchObject({ timeZone: 'America/New_York', certain: true, dataset: api.timeZones.dataset() });
    expect(await scalar(db, `select count(*)::int from app.trip_stays where time_zone is not null`)).toBe(0);
    const confirmed = await api.stays.update(user, tripId, created.stay.id, { timeZone: 'America/New_York' });
    expect([confirmed.stay.timeZone, confirmed.stay.timeZoneSource]).toEqual(['America/New_York', 'user']);
    expect(await scalar(db, `select time_zone_dataset from app.trip_stays where id = $1`, [created.stay.id])).toBeNull();
  });

  it("a custom pin: derived and stored with the data release; moving the pin follows; the user's choice is kept", async () => {
    const { db, api, tripId } = await setup();
    const hotel = await api.places.create(user, { name: 'Cabin', address: null, notes: null, category: 'stay', ...TIMES_SQUARE });
    const { stay } = await api.stays.create(user, tripId, { placeId: hotel.id, label: null, checkIn: null, checkOut: null });
    expect([stay.timeZone, stay.timeZoneSource]).toEqual(['America/New_York', 'derived']);
    expect(await scalar(db, `select time_zone_dataset from app.trip_stays where id = $1`, [stay.id])).toBe(api.timeZones.dataset());
    await api.places.update(user, hotel.id, { latitude: 32.08, longitude: 34.78 });
    expect((await api.tripsV2.get(user, tripId)).stays[0]!.timeZone).toBe('Asia/Jerusalem');
    await api.stays.update(user, tripId, stay.id, { timeZone: 'Europe/London' });
    await api.places.update(user, hotel.id, { latitude: 40.758, longitude: -73.9855 });
    expect((await api.tripsV2.get(user, tripId)).stays[0]!.timeZone).toBe('Europe/London');
  });

  it('an uncertain point (open sea) is never stored, only suggested', async () => {
    const { db, api, tripId } = await setup();
    const boat = await api.places.create(user, { name: 'Boat', address: null, notes: null, category: 'other', ...MID_ATLANTIC });
    const member = await api.tripsV2.addMember(user, tripId, { placeId: boat.id });
    const tripPlaceId = member.places.find((p) => p.id === boat.id)!.tripPlaceId;
    const added = await api.stops.add(user, tripId, { tripPlaceId, day: '2026-11-24' });
    expect(added.stop.timeZone).toBeNull();
    expect(added.timeZoneSuggestion?.certain).toBe(false);
    expect(await scalar(db, `select count(*)::int from app.trip_stops where time_zone is not null`)).toBe(0);
  });

  it('a visit to a custom pin gets its zone; the trip zone is set only by the user', async () => {
    const { api, tripId, pin } = await setup();
    expect((await api.stops.add(user, tripId, { tripPlaceId: pin, day: '2026-11-24' })).stop.timeZone).toBe('America/New_York');
    const trip = await api.tripsV2.update(user, tripId, { timeZone: 'America/New_York' });
    expect([trip.timeZone, trip.timeZoneSource]).toEqual(['America/New_York', 'user']);
  });
});

describe('isolation', () => {
  it("another user can't read or change this trip's visits and stays (RLS through the API)", async () => {
    const { db, api, tripId, moma } = await setup();
    await seedSecondUser(db);
    const { stop } = await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    const other = asAuthUser(USER_B);
    expect((await apiError(() => api.tripsV2.get(other, tripId))).status).toBe(404);
    expect((await apiError(() => api.stops.transition(other, tripId, stop.id, 'complete', {}))).status).toBe(404);
    expect((await apiError(() => api.stays.create(other, tripId, { placeId: null, label: 'x', checkIn: null, checkOut: null }))).status).toBe(404);
  });

  it('deleting the account removes visits and stays (cascade)', async () => {
    const { db, api, tripId, moma } = await setup();
    await api.stops.add(user, tripId, { tripPlaceId: moma, day: '2026-11-24' });
    await api.stays.create(user, tripId, { placeId: null, label: 'Pod', checkIn: null, checkOut: null });
    await db.query('delete from auth.users where id = $1', [USER_A]);
    expect(await scalar(db, 'select count(*)::int from app.trip_stops')).toBe(0);
    expect(await scalar(db, 'select count(*)::int from app.trip_stays')).toBe(0);
    expect(await scalar(db, 'select count(*)::int from app.places')).toBe(0);
  });
});
