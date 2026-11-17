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
export const googlePlaceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/);

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
