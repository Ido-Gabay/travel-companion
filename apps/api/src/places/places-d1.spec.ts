import { afterEach, describe, expect, it } from 'vitest';
import { apiError, apiServices, asAuthUser } from '../testing/api.js';
import { USER_A, USER_B, gid, seedUsers } from '../testing/d1-fixture.js';
import { closeAll, createDatabase, scalar } from '../testing/pg.js';

/** D1 · Places: the user's own pin (custom places only), "Use my own pin", visit history. */
afterEach(closeAll);

const user = asAuthUser(USER_A);

async function setup() {
  const db = await createDatabase();
  await seedUsers(db);
  return { db, api: await apiServices(db) };
}

describe('places (D1)', () => {
  it('"Use my own pin": a custom place with the user\'s coordinates, linked to the Google place by ID only', async () => {
    const { db, api } = await setup();
    const { places } = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('moma'), category: 'sights' }] });
    const google = places[0]!;
    const own = await api.places.create(user, {
      name: 'MoMA side door', address: null, notes: null, category: 'sights',
      latitude: 40.7614, longitude: -73.9776, linkedGooglePlaceId: google.googlePlaceId!,
    });
    expect([own.source, own.latitude, own.longitude, own.linkedGooglePlaceId]).toEqual(['custom', 40.7614, -73.9776, gid('moma')]);
    // The Google place is untouched and still has no stored coordinates.
    expect(await scalar(db, `select latitude is null and longitude is null from app.places where id = $1`, [google.id])).toBe(true);
    expect((await api.places.get(user, google.id)).updatedAt).toBe(google.updatedAt);
  });

  it("never stores coordinates on a Google place", async () => {
    const { api } = await setup();
    const { places } = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('katz'), category: 'food' }] });
    const error = await apiError(() => api.places.update(user, places[0]!.id, { latitude: 40.72, longitude: -73.99 }));
    expect([error.status, error.code, error.details[0]?.path]).toEqual([400, 'VALIDATION_FAILED', 'latitude']);
  });

  it('moves and removes a custom pin', async () => {
    const { api } = await setup();
    const place = await api.places.create(user, { name: 'Bench', address: null, notes: null, category: 'outdoors', latitude: 40.78, longitude: -73.96 });
    expect((await api.places.update(user, place.id, { latitude: 40.79, longitude: -73.95 })).latitude).toBe(40.79);
    expect((await api.places.update(user, place.id, { latitude: null, longitude: null })).latitude).toBeNull();
  });

  it('history: the legacy "visited" mark shows until a visit explains it; v1 visited still only sets the mark', async () => {
    const { db, api } = await setup();
    const place = await api.places.create(user, { name: 'Bagels', address: null, notes: null, category: 'food' });
    await api.places.update(user, place.id, { visited: true });
    expect((await api.places.visits(user, place.id)).items.map((v) => v.source)).toEqual(['legacy_mark']);
    expect(await scalar(db, 'select count(*)::int from app.trip_stops')).toBe(0);
  });

  it('deleting a place takes its planned visits; completed ones stay in history', async () => {
    const { db, api } = await setup();
    const trip = await api.trips.create(user, {
      title: 'NY', destination: null, baseLocation: null, basePlaceId: null, startDate: '2026-11-23', endDate: '2026-11-29',
    });
    const place = await api.places.create(user, { name: 'Diner', address: null, notes: null, category: 'food' });
    const detail = await api.tripsV2.addMember(user, trip.id, { placeId: place.id });
    const tripPlaceId = detail.places[0]!.tripPlaceId;
    await api.stops.add(user, trip.id, { tripPlaceId, day: '2026-11-24' });
    const done = await api.stops.add(user, trip.id, { tripPlaceId, day: '2026-11-25' });
    await api.stops.transition(user, trip.id, done.stop.id, 'complete', {});
    await api.places.remove(user, place.id);
    expect(await scalar(db, `select count(*)::int from app.trip_stops where deleted_at is null`)).toBe(1);
    expect(await scalar(db, `select count(*)::int from app.place_visits where place_id = $1`, [place.id])).toBe(1);
  });
});

describe('linking your own place to Google Maps', () => {
  async function imported() {
    const { db, api } = await setup();
    const trip = await api.trips.create(user, {
      title: 'NY', destination: 'New York', baseLocation: null, basePlaceId: null, startDate: '2026-11-23', endDate: '2026-11-29',
    });
    const place = await api.places.create(user, { name: "Katz's Deli", address: 'Lower East Side', notes: 'pastrami', category: 'food' });
    const detail = await api.tripsV2.addMember(user, trip.id, { placeId: place.id });
    const tripPlaceId = detail.places[0]!.tripPlaceId;
    const stop = await api.stops.add(user, trip.id, { tripPlaceId, day: '2026-11-24', startTime: '13:00' });
    return { db, api, trip, place, tripPlaceId, stop: stop.stop };
  }

  it('not saved yet: the same place becomes the Google place; its trip and visit stay; no Google text is stored', async () => {
    const { db, api, trip, place, tripPlaceId, stop } = await imported();
    const linked = await api.places.linkGoogle(user, place.id, { googlePlaceId: gid('katz') });
    expect([linked.id, linked.source, linked.googlePlaceId, linked.name, linked.address]).toEqual([place.id, 'google', gid('katz'), null, null]);
    // The user's own words are kept: name as their label, the area in notes.
    expect([linked.myLabel, linked.notes]).toEqual(["Katz's Deli", 'pastrami\nLower East Side']);
    const detail = await api.tripsV2.get(user, trip.id);
    expect(detail.places.map((item) => [item.id, item.tripPlaceId])).toEqual([[place.id, tripPlaceId]]);
    expect(detail.stops.map((item) => [item.id, item.startTime])).toEqual([[stop.id, '13:00']]);
    expect(await scalar(db, `select count(*)::int from app.places where deleted_at is null`)).toBe(1);
    // Linking again with the same ID changes nothing; another ID is refused.
    expect((await api.places.linkGoogle(user, place.id, { googlePlaceId: gid('katz') })).version).toBe(linked.version);
    expect((await apiError(() => api.places.linkGoogle(user, place.id, { googlePlaceId: gid('moma') }))).status).toBe(409);
  });

  it('already saved: its trips and visits move to the saved Google place, nothing is duplicated or lost', async () => {
    const { db, api, trip, place, stop } = await imported();
    // The same Google place is already saved and already in this trip, with its own visit.
    const { places } = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('katz'), category: 'food' }], tripId: trip.id });
    const google = places[0]!;
    const before = await api.tripsV2.get(user, trip.id);
    const googleMember = before.places.find((item) => item.id === google.id)!.tripPlaceId;
    const other = await api.stops.add(user, trip.id, { tripPlaceId: googleMember, day: '2026-11-26' });

    const linked = await api.places.linkGoogle(user, place.id, { googlePlaceId: gid('katz') });
    expect(linked.id).toBe(google.id);
    expect(linked.myLabel).toBe("Katz's Deli");
    const detail = await api.tripsV2.get(user, trip.id);
    expect(detail.places.map((item) => item.id)).toEqual([google.id]);
    expect(detail.stops.map((item) => [item.id, item.tripPlaceId]).sort()).toEqual(
      [[stop.id, googleMember], [other.stop.id, googleMember]].sort(),
    );
    expect(await scalar(db, `select deleted_at is not null from app.places where id = $1`, [place.id])).toBe(true);
    expect(await scalar(db, `select count(*)::int from app.places where deleted_at is null`)).toBe(1);
  });

  it('a Google place saved only in the collection (deleted, even) is revived and takes over the trip', async () => {
    const { api, trip, place, tripPlaceId } = await imported();
    const { places } = await api.places.saveGoogle(user, { items: [{ googlePlaceId: gid('katz'), category: 'food' }] });
    await api.places.remove(user, places[0]!.id);
    const linked = await api.places.linkGoogle(user, place.id, { googlePlaceId: gid('katz') });
    expect(linked.id).toBe(places[0]!.id);
    const detail = await api.tripsV2.get(user, trip.id);
    // The membership itself moved, so the visit keeps its id and membership id.
    expect(detail.places.map((item) => [item.id, item.tripPlaceId])).toEqual([[places[0]!.id, tripPlaceId]]);
    expect(detail.stops).toHaveLength(1);
  });

  it("someone else's place: not found", async () => {
    const { api, place } = await imported();
    const error = await apiError(() => api.places.linkGoogle(asAuthUser(USER_B), place.id, { googlePlaceId: gid('katz') }));
    expect(error.status).toBe(404);
  });
});
