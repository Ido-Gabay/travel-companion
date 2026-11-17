import type { TripDetail, TripPlace } from '@travel-companion/shared';
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
    ...extra,
  };
}

export function tripDetail(places: TripPlace[], extra: Partial<TripDetail> = {}): TripDetail {
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
