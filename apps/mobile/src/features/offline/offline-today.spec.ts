import { describe, expect, it } from 'vitest';
import { computeToday, toEngineStops } from '../companion/today-engine';
import { placesForDay } from '../trips/itinerary';
import { coordLookup, upsertCoord } from './coords';
import { buildTripView } from '../trips/model';
import { memoryStore, tripDetail, tripDetailV1, tripPlace, uuid } from './test-fixtures';
import { TripCache } from './trip-cache';

const NOW = Date.UTC(2026, 10, 23, 14);
const USER = uuid(901);
const DAY = '2026-11-23';

/** What Today and the itinerary do on an offline cold start: only the saved copy, no API, no Google. */
async function offlineCopy(withCoords: boolean) {
  const store = memoryStore();
  const cache = new TripCache(store, USER);
  const places = [
    tripPlace(1, { startTime: '10:00', durationMinutes: 60, visitedAt: '2026-11-23T15:30:00.000Z', category: 'coffee' }),
    tripPlace(2, { startTime: '12:30', durationMinutes: 120, notes: 'Members free' }),
    tripPlace(3, { startTime: '16:00', category: 'food' }),
    tripPlace(4, { day: null, position: 0 }),
  ];
  const detail = tripDetail(places);
  await cache.saveTrips({ items: [tripDetailV1(places)] }, NOW - 3600_000);
  await cache.saveTrip(detail, NOW - 3600_000);
  if (withCoords) {
    let coords = upsertCoord([], 'ChIJhotel000001', { latitude: 40.7577, longitude: -73.9857 }, NOW - 86_400_000);
    coords = upsertCoord(coords, 'ChIJplace0002', { latitude: 40.7794, longitude: -73.9632 }, NOW - 86_400_000);
    await cache.saveCoords(coords);
  }
  return new TripCache(store, USER).load(NOW);
}

const categoryName = (place: { category: string }) => place.category;

describe('offline: itinerary and Today from the saved copy', () => {
  it('opens the itinerary: the day in order with times, lengths, notes and Done status', async () => {
    const snapshot = await offlineCopy(false);
    const trip = snapshot.details[0] ? buildTripView(snapshot.details[0].data) : undefined;
    expect(trip).toBeDefined();
    const stops = placesForDay(trip?.places ?? [], DAY);
    expect(stops.map((stop) => [stop.startTime, stop.durationMinutes, stop.visitedAt !== null])).toEqual([
      ['10:00', 60, true],
      ['12:30', 120, false],
      ['16:00', null, false],
    ]);
    expect(stops[1]?.notes).toBe('Members free');
    expect(trip?.baseLocation).toBe('Pod Times Square');
  });

  it('opens Today without network: next stop from the plan, names from categories', async () => {
    const snapshot = await offlineCopy(false);
    const trip = snapshot.details[0] ? buildTripView(snapshot.details[0].data) : undefined;
    const stops = toEngineStops(placesForDay(trip?.places ?? [], DAY), categoryName, () => null);
    const result = computeToday({
      stops,
      nowMinutes: 11 * 60,
      here: null,
      hotel: null,
      candidates: [],
      dismissed: new Set(),
      hasTomorrow: true,
    });
    expect(result.next?.stop.id).toBe(uuid(102));
    expect(result.next?.stop.name).toBe('sights');
    expect(result.done).toBe(1);
    expect(result.total).toBe(3);
    expect(result.next?.travel).toBeNull();
  });

  it('with cached coordinates (≤ 30 days) Today still estimates travel and when to leave', async () => {
    const snapshot = await offlineCopy(true);
    const trip = snapshot.details[0] ? buildTripView(snapshot.details[0].data) : undefined;
    const coords = coordLookup(snapshot.coords, NOW);
    const stops = toEngineStops(placesForDay(trip?.places ?? [], DAY), categoryName, (place) =>
      place.googlePlaceId ? (coords.get(place.googlePlaceId) ?? null) : null,
    );
    const result = computeToday({
      stops,
      nowMinutes: 11 * 60,
      here: null,
      hotel: coords.get('ChIJhotel000001') ?? null,
      candidates: [],
      dismissed: new Set(),
      hasTomorrow: true,
    });
    expect(result.next?.travel?.minutes).toBeGreaterThan(0);
    expect(result.next?.leaveBy).not.toBeNull();
  });
});
