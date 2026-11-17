import type { GooglePlaceType, LatLng, PlaceCategory, SearchArea, Trip } from '@travel-companion/shared';
import type { IconName } from '@/components/ui';

/** One-tap searches shown as category chips. The query text is sent to Google; the label is translated. */
export interface SearchPreset {
  key: 'restaurants' | 'breakfast' | 'coffee' | 'bars' | 'sights' | 'museums' | 'parks' | 'shopping';
  icon: IconName;
  textQuery: string;
  includedType: GooglePlaceType | null;
  category: PlaceCategory;
}

export const SEARCH_PRESETS: readonly SearchPreset[] = [
  { key: 'restaurants', icon: 'restaurant-outline', textQuery: 'restaurants', includedType: 'restaurant', category: 'food' },
  { key: 'breakfast', icon: 'sunny-outline', textQuery: 'breakfast', includedType: 'breakfast_restaurant', category: 'food' },
  { key: 'coffee', icon: 'cafe-outline', textQuery: 'coffee', includedType: 'cafe', category: 'coffee' },
  { key: 'bars', icon: 'wine-outline', textQuery: 'bars', includedType: 'bar', category: 'nightlife' },
  { key: 'sights', icon: 'camera-outline', textQuery: 'top sights', includedType: 'tourist_attraction', category: 'sights' },
  { key: 'museums', icon: 'business-outline', textQuery: 'museums', includedType: 'museum', category: 'sights' },
  { key: 'parks', icon: 'leaf-outline', textQuery: 'parks', includedType: 'park', category: 'outdoors' },
  { key: 'shopping', icon: 'bag-handle-outline', textQuery: 'shopping', includedType: null, category: 'shopping' },
];

/** Where a standard search looks. "map" is set by "Search this area". */
export type WhereKey = 'hotel' | 'destination' | 'me' | 'anywhere' | 'map';

type TripPlaceContext = Pick<Trip, 'destination' | 'baseLocation' | 'basePlaceId'> | null;

/** The area choices for the chosen trip (or none), in display order. */
export function whereOptions(trip: TripPlaceContext): WhereKey[] {
  return [
    ...(trip?.basePlaceId || trip?.baseLocation ? (['hotel'] as const) : []),
    ...(trip?.destination ? (['destination'] as const) : []),
    'me',
    'anywhere',
  ];
}

/** Start near the hotel, else the destination; during a trip, near the user. */
export function defaultWhere(trip: TripPlaceContext, duringTrip: boolean): WhereKey {
  if (duringTrip) return 'me';
  return whereOptions(trip)[0] ?? 'anywhere';
}

/** Radius for "Near me" (meters): a comfortable walk. */
export const NEAR_ME_RADIUS_M = 1500;
/** Radius around the pinned hotel (meters). */
export const NEAR_HOTEL_RADIUS_M = 1000;

/**
 * The search area for a choice. "hotel" uses the pinned hotel's real location
 * (never a guess from its name); null means no area, or that the location
 * isn't known yet (the caller asks for it: pin the hotel, allow location).
 */
export function areaFor(
  where: WhereKey,
  trip: TripPlaceContext,
  points: { here: LatLng | null; hotel: LatLng | null },
): SearchArea | null {
  const { here, hotel } = points;
  switch (where) {
    case 'hotel':
      return hotel ? { kind: 'circle', center: hotel, radiusMeters: NEAR_HOTEL_RADIUS_M } : null;
    case 'destination':
      return trip?.destination ? { kind: 'near', text: trip.destination } : null;
    case 'me':
      return here ? { kind: 'circle', center: here, radiusMeters: NEAR_ME_RADIUS_M } : null;
    case 'anywhere':
    case 'map':
      return null;
  }
}
