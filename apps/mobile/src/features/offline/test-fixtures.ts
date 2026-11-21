import type { Stay, Stop, TripDetail, TripDetailV2, TripMember, TripPlace } from '@travel-companion/shared';
import type { KeyValueStore } from './storage';

/** Test helpers for the offline modules (not used by the app). */
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AT = '2026-11-17T10:00:00.000Z';

export function tripPlace(n: number, extra: Partial<TripPlace> = {}): TripPlace {
  return {
    id: uuid(100 + n),
    source: 'google',
    googlePlaceId: `ChIJplace${String(n).padStart(4, '0')}`,
    name: null,
    address: null,
    notes: null,
    myLabel: null,
    category: 'sights',
    tags: [],
    visitedAt: null,
    tripCount: 1,
    createdAt: AT,
    updatedAt: AT,
    version: 1,
    addedAt: AT,
    day: '2026-11-23',
    startTime: null,
    position: n,
    durationMinutes: null,
    highlight: false,
    ...extra,
  };
}

/** A pre-D1 (v1) trip detail: one row per place, its plan on the place. */
export function tripDetailV1(places: TripPlace[], extra: Partial<TripDetail> = {}): TripDetail {
  return {
    id: uuid(1),
    title: 'New York',
    destination: 'New York',
    startDate: '2026-11-23',
    endDate: '2026-11-29',
    baseLocation: 'Pod Times Square',
    basePlaceId: 'ChIJhotel000001',
    placeCount: places.length,
    createdAt: AT,
    updatedAt: AT,
    version: 1,
    places,
    ...extra,
  };
}

/** The saved-place (membership) id of fixture place uuid(100 + n). */
export const memberId = (placeId: string) => placeId.replace(/^00000000-0000-4000-8000-0000000001/, '00000000-0000-4000-8000-0000000003');

/**
 * D1: the same fixture as the v2 trip the app now gets: each place saved to
 * the trip; each planned place has one visit whose id is the place's id (so
 * tests can keep using uuid(101)… for both); a place's visitedAt makes that
 * visit done; "Staying at" + hotel become one whole-trip stay.
 */
export function tripDetail(places: TripPlace[], extra: Partial<TripDetail> = {}): TripDetailV2 {
  const v1 = tripDetailV1(places, extra);
  const members: TripMember[] = places.map(({ addedAt, day: _day, startTime: _s, position: _p, durationMinutes: _d, highlight: _h, ...place }) => ({
    ...place,
    tripPlaceId: memberId(place.id),
    savedAt: addedAt,
  }));
  const stops: Stop[] = places
    .filter((place) => place.day !== null)
    .map((place) => ({
      id: place.id,
      tripId: v1.id,
      tripPlaceId: memberId(place.id),
      placeId: place.id,
      day: place.day as string,
      position: place.position,
      startTime: place.startTime,
      durationMinutes: place.durationMinutes,
      timeZone: null,
      status: place.visitedAt ? 'completed' : 'planned',
      arrivedAt: null,
      completedAt: place.visitedAt,
      skippedAt: null,
      completionSource: place.visitedAt ? 'user' : null,
      highlight: place.highlight,
      createdAt: place.addedAt,
      updatedAt: place.addedAt,
      version: 1,
    }));
  const stays: Stay[] =
    v1.baseLocation || v1.basePlaceId
      ? [
          {
            id: uuid(501),
            tripId: v1.id,
            placeId: v1.basePlaceId ? uuid(502) : null,
            place: v1.basePlaceId
              ? {
                  id: uuid(502),
                  source: 'google',
                  googlePlaceId: v1.basePlaceId,
                  name: null,
                  address: null,
                  notes: null,
                  myLabel: null,
                  latitude: null,
                  longitude: null,
                  linkedGooglePlaceId: null,
                  category: 'stay',
                  tags: [],
                  visitedAt: null,
                  tripCount: 0,
                  createdAt: AT,
                  updatedAt: AT,
                  version: 1,
                }
              : null,
            label: v1.baseLocation,
            checkIn: null,
            checkOut: null,
            timeZone: null,
            timeZoneSource: null,
            createdAt: AT,
            updatedAt: AT,
            version: 1,
          },
        ]
      : [];
  return {
    trip: {
      id: v1.id,
      title: v1.title,
      destination: v1.destination,
      startDate: v1.startDate,
      endDate: v1.endDate,
      placeCount: places.length,
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      version: v1.version,
      timeZone: null,
      timeZoneSource: null,
    },
    places: members,
    stops,
    stays,
  };
}

/** An in-memory AsyncStorage stand-in. */
export function memoryStore(): KeyValueStore & { dump: () => Record<string, string> } {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
    getAllKeys: async () => [...data.keys()],
    multiRemove: async (keys) => {
      for (const key of keys) data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}
