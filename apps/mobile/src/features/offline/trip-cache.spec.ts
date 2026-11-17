import { describe, expect, it } from 'vitest';
import { COORDS_SOURCE, upsertCoord } from './coords';
import { memoryStore, tripDetail, tripPlace, uuid } from './test-fixtures';
import { clearAllOffline, clearOtherUsers, OFFLINE_PREFIX, sanitizeTripDetail, TripCache } from './trip-cache';

const NOW = Date.UTC(2026, 10, 24, 12);
const DAY = 24 * 60 * 60 * 1000;
const ALICE = uuid(901);
const BOB = uuid(902);

describe('offline trip cache', () => {
  it('saves and restores a trip list and a trip with plan, notes and Done status', async () => {
    const store = memoryStore();
    const cache = new TripCache(store, ALICE);
    const detail = tripDetail([
      tripPlace(1, { startTime: '10:00', durationMinutes: 90, notes: 'Book tickets', visitedAt: '2026-11-23T15:00:00.000Z' }),
    ]);
    await cache.saveTrips({ items: [detail] }, NOW - 60_000);
    await cache.saveTrip(detail, NOW - 30_000);
    const snapshot = await cache.load(NOW);
    expect(snapshot.trips?.data.items.map((trip) => trip.id)).toEqual([detail.id]);
    expect(snapshot.trips?.savedAt).toBe(NOW - 60_000);
    expect(snapshot.details[0]?.savedAt).toBe(NOW - 30_000);
    expect(snapshot.details[0]?.data.places[0]).toMatchObject({
      startTime: '10:00',
      durationMinutes: 90,
      notes: 'Book tickets',
      visitedAt: '2026-11-23T15:00:00.000Z',
    });
    expect(snapshot.details[0]?.data.baseLocation).toBe('Pod Times Square');
  });

  it('keeps users apart: another user reads nothing', async () => {
    const store = memoryStore();
    await new TripCache(store, ALICE).saveTrip(tripDetail([tripPlace(1)]), NOW);
    const bob = await new TripCache(store, BOB).load(NOW);
    expect(bob).toEqual({ trips: null, details: [], me: null, coords: [] });
  });

  it('sign-out wipes every saved copy; a new sign-in removes other users leftovers', async () => {
    const store = memoryStore();
    await new TripCache(store, ALICE).saveTrip(tripDetail([tripPlace(1)]), NOW);
    await new TripCache(store, BOB).saveTrip(tripDetail([tripPlace(2)]), NOW);
    await store.setItem('app.locale', 'he');
    await clearOtherUsers(store, BOB);
    expect(Object.keys(store.dump()).filter((key) => key.includes(ALICE))).toEqual([]);
    await clearAllOffline(store);
    expect(Object.keys(store.dump())).toEqual(['app.locale']);
  });

  it('never stores a name or address for Google places (only custom places keep theirs)', async () => {
    const store = memoryStore();
    const leaked = tripPlace(1, { name: 'Should not be here', address: 'Nope' });
    const custom = tripPlace(2, { source: 'custom', googlePlaceId: null, name: 'Aunt Ruth', address: 'Brooklyn' });
    await new TripCache(store, ALICE).saveTrip(tripDetail([leaked, custom]), NOW);
    const raw = JSON.stringify(store.dump());
    expect(raw).not.toContain('Should not be here');
    expect(raw).toContain('Aunt Ruth');
    expect(sanitizeTripDetail(tripDetail([leaked])).places[0]).toMatchObject({ name: null, address: null });
  });

  it('drops corrupted entries instead of failing', async () => {
    const store = memoryStore();
    await store.setItem(`${OFFLINE_PREFIX}${ALICE}.trips`, '{not json');
    await store.setItem(`${OFFLINE_PREFIX}${ALICE}.trip.${uuid(1)}`, JSON.stringify({ savedAt: NOW, data: { id: 'x' } }));
    const snapshot = await new TripCache(store, ALICE).load(NOW);
    expect(snapshot.trips).toBeNull();
    expect(snapshot.details).toEqual([]);
    expect(Object.keys(store.dump())).not.toContain(`${OFFLINE_PREFIX}${ALICE}.trip.${uuid(1)}`);
  });

  it('removes saved details of trips that no longer exist', async () => {
    const store = memoryStore();
    const cache = new TripCache(store, ALICE);
    const kept = tripDetail([], { id: uuid(1) });
    await cache.saveTrip(kept, NOW);
    await cache.saveTrip(tripDetail([], { id: uuid(2) }), NOW);
    await cache.saveTrips({ items: [kept] }, NOW);
    expect((await cache.load(NOW)).details.map((item) => item.data.id)).toEqual([uuid(1)]);
  });

  it('deletes expired coordinates (and ones for places not in a saved trip) automatically on load', async () => {
    const store = memoryStore();
    const cache = new TripCache(store, ALICE);
    const detail = tripDetail([tripPlace(1), tripPlace(2)]);
    await cache.saveTrip(detail, NOW);
    let coords = upsertCoord([], 'ChIJplace0001', { latitude: 40.7, longitude: -73.9 }, NOW - 2 * DAY);
    coords = upsertCoord(coords, 'ChIJplace0002', { latitude: 40.8, longitude: -73.9 }, NOW - 31 * DAY);
    coords = upsertCoord(coords, 'ChIJhotel000001', { latitude: 40.75, longitude: -73.98 }, NOW - DAY);
    coords = upsertCoord(coords, 'ChIJnotInATrip1', { latitude: 1, longitude: 1 }, NOW - DAY);
    await cache.saveCoords(coords);
    const snapshot = await cache.load(NOW);
    expect(snapshot.coords.map((entry) => entry.placeId).sort()).toEqual(['ChIJhotel000001', 'ChIJplace0001']);
    expect(snapshot.coords.every((entry) => entry.source === COORDS_SOURCE)).toBe(true);
    // The expired entry is gone from the device, not just hidden.
    expect(store.dump()[`${OFFLINE_PREFIX}${ALICE}.coords`]).not.toContain('ChIJplace0002');
    expect(store.dump()[`${OFFLINE_PREFIX}${ALICE}.coords`]).not.toContain('ChIJnotInATrip1');
  });
});
