import { z } from 'zod';

/**
 * Google place types the AI may use as Text Search `includedType`. Kept to a
 * conservative subset of Google's place type table; the API also retries
 * without a type if Google rejects one.
 */
export const GOOGLE_PLACE_TYPES = [
  'restaurant',
  'italian_restaurant',
  'pizza_restaurant',
  'breakfast_restaurant',
  'brunch_restaurant',
  'cafe',
  'coffee_shop',
  'bakery',
  'ice_cream_shop',
  'bar',
  'night_club',
  'tourist_attraction',
  'museum',
  'art_gallery',
  'park',
  'observation_deck',
  'shopping_mall',
  'department_store',
  'clothing_store',
  'book_store',
  'lodging',
  'hotel',
] as const;
export const googlePlaceTypeSchema = z.enum(GOOGLE_PLACE_TYPES);
export type GooglePlaceType = z.infer<typeof googlePlaceTypeSchema>;

/** Google place IDs: storable indefinitely under Google's terms. */
export const googlePlaceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,255}$/);

export const latLngSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

/**
 * Google-provided place content. Fetched fresh from Google for display and
 * NEVER stored in our database (only `placeId` is). Must be shown with
 * Google Maps attribution, or on a Google map.
 */
export const googlePlaceSchema = z.object({
  placeId: googlePlaceIdSchema,
  name: z.string(),
  address: z.string().nullable(),
  location: latLngSchema.nullable(),
  primaryType: z.string().nullable(),
  /** Localized category label from Google, e.g. "Italian Restaurant". */
  typeLabel: z.string().nullable(),
  googleMapsUri: z.string().nullable(),
  /** OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY or null. */
  businessStatus: z.string().nullable(),
});
export type GooglePlace = z.infer<typeof googlePlaceSchema>;

/** Official Google Maps URLs (no API key needed) for a place ID. */
export function googleMapsPlaceUrl(placeId: string, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}

export function googleMapsDirectionsUrl(placeId: string, name: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&destination_place_id=${encodeURIComponent(placeId)}`;
}

/** Most stops a Google Maps route link takes (destination + waypoints) across platforms. */
export const GOOGLE_MAPS_ROUTE_MAX_STOPS = 10;

/**
 * Google Maps directions through several places in order, starting from the
 * user's current location. The last stop is the destination; the others are
 * waypoints. Extra stops beyond GOOGLE_MAPS_ROUTE_MAX_STOPS are left out.
 * Returns null when there are no stops.
 */
export function googleMapsRouteUrl(
  stops: readonly { placeId: string; name: string }[],
  travelMode: 'walking' | 'transit' | 'driving' = 'walking',
): string | null {
  const route = stops.slice(0, GOOGLE_MAPS_ROUTE_MAX_STOPS);
  const destination = route[route.length - 1];
  if (!destination) return null;
  const waypoints = route.slice(0, -1);
  const params = [
    'api=1',
    `destination=${encodeURIComponent(destination.name)}`,
    `destination_place_id=${encodeURIComponent(destination.placeId)}`,
    `travelmode=${travelMode}`,
  ];
  if (waypoints.length > 0) {
    params.push(`waypoints=${encodeURIComponent(waypoints.map((stop) => stop.name).join('|'))}`);
    params.push(`waypoint_place_ids=${encodeURIComponent(waypoints.map((stop) => stop.placeId).join('|'))}`);
  }
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
