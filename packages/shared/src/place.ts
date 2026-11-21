import { z } from 'zod';
import { googlePlaceIdSchema, latLngSchema } from './google.js';

export const PLACE_NAME_MAX = 120;
export const PLACE_ADDRESS_MAX = 200;
export const PLACE_NOTES_MAX = 2000;
export const PLACE_TAGS_MAX = 10;
export const PLACE_TAG_MAX = 30;
/** The user's own label for a place (M12a). */
export const PLACE_LABEL_MAX = 60;

/** Our own categories (user-owned classification, not Google data). */
export const PLACE_CATEGORIES = [
  'food',
  'coffee',
  'sights',
  'shopping',
  'nightlife',
  'outdoors',
  'stay',
  'other',
] as const;
export const placeCategorySchema = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

export const PLACE_SOURCES = ['google', 'custom'] as const;
export type PlaceSource = (typeof PLACE_SOURCES)[number];

/**
 * A place in the user's global collection. Everything here is user-owned.
 * - source "google": only the Google place ID is stored; name, address and
 *   location are fetched fresh from Google (GET /v1/google/places/:id).
 * - source "custom": a place the user typed in; `name`/`address` are theirs.
 */
export const placeSchema = z.object({
  id: z.uuid(),
  source: z.enum(PLACE_SOURCES),
  googlePlaceId: googlePlaceIdSchema.nullable(),
  /** Custom places only. Always null for Google places. */
  name: z.string().nullable(),
  /** Custom places only. Always null for Google places. */
  address: z.string().nullable(),
  notes: z.string().nullable(),
  /**
   * The user's own label (M12a), typed by them and never filled from Google data.
   * Shown when Google's name can't be loaded (offline). Defaults to null so a newer
   * app works against an older server.
   */
  myLabel: z.string().nullable().default(null),
  /**
   * D1: the user's own pin for a custom place (chosen on the map, never a Google
   * coordinate); null for Google places. Absent from v1 trip responses (kept
   * byte-identical for installed apps) and from older servers: treat absent as null.
   */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  /** D1 "Use my own pin": the Google place this custom place stands in for (ID only). */
  linkedGooglePlaceId: googlePlaceIdSchema.nullable().optional(),
  category: placeCategorySchema,
  tags: z.array(z.string()),
  visitedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Number of the user's trips this place is in. */
  tripCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type Place = z.infer<typeof placeSchema>;

export const placeListSchema = z.object({
  items: z.array(placeSchema),
});
export type PlaceList = z.infer<typeof placeListSchema>;

/** Trimmed text; blank becomes null. Notes keep inner line breaks. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

const placeName = z.string().trim().min(1).max(PLACE_NAME_MAX);

/** Tags: trimmed, non-empty, unique (case-insensitive), at most 10. */
export const placeTagsSchema = z
  .array(z.string().trim().min(1).max(PLACE_TAG_MAX))
  .max(PLACE_TAGS_MAX)
  .transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

/** Not 0,0 ("null island"): almost always a missing value, never a real pin. */
const notNullIsland = (body: { latitude?: number | null; longitude?: number | null }) =>
  !(body.latitude === 0 && body.longitude === 0);
const pairSet = (body: { latitude?: number | null; longitude?: number | null }) =>
  (body.latitude === undefined) === (body.longitude === undefined) &&
  (body.latitude === null) === (body.longitude === null);

/**
 * Request body of POST /v1/places (a custom place the user types in).
 * D1: optionally the user's own pin, and the Google place it replaces ("Use my own pin").
 */
export const createPlaceSchema = z
  .strictObject({
    name: placeName,
    address: nullableText(PLACE_ADDRESS_MAX).optional().transform((value) => value ?? null),
    notes: nullableText(PLACE_NOTES_MAX).optional().transform((value) => value ?? null),
    category: placeCategorySchema.optional().transform((value) => value ?? 'other'),
    latitude: latLngSchema.shape.latitude.optional(),
    longitude: latLngSchema.shape.longitude.optional(),
    linkedGooglePlaceId: googlePlaceIdSchema.optional(),
  })
  .refine(pairSet, { error: 'Send latitude and longitude together.', path: ['longitude'] })
  .refine(notNullIsland, { error: 'Pick the location on the map.', path: ['latitude'] });
export type CreatePlaceInput = z.input<typeof createPlaceSchema>;
export type CreatePlaceData = z.output<typeof createPlaceSchema>;

/**
 * Request body of PATCH /v1/places/:id. Send only the fields to change; null
 * clears. `name`/`address` are only allowed on custom places.
 */
export const updatePlaceSchema = z
  .strictObject({
    name: placeName.optional(),
    address: nullableText(PLACE_ADDRESS_MAX).optional(),
    notes: nullableText(PLACE_NOTES_MAX).optional(),
    myLabel: nullableText(PLACE_LABEL_MAX).optional(),
    category: placeCategorySchema.optional(),
    tags: placeTagsSchema.optional(),
    visited: z.boolean().optional(),
    /** D1: move (or with null, remove) the user's own pin. Custom places only. */
    latitude: latLngSchema.shape.latitude.nullable().optional(),
    longitude: latLngSchema.shape.longitude.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Provide at least one field to update.',
  })
  .refine(pairSet, { error: 'Send latitude and longitude together.', path: ['longitude'] })
  .refine(notNullIsland, { error: 'Pick the location on the map.', path: ['latitude'] });
export type UpdatePlaceInput = z.input<typeof updatePlaceSchema>;
export type UpdatePlaceData = z.output<typeof updatePlaceSchema>;

/** Request body of POST /v1/places/google: save Google places, optionally into a trip. */
export const saveGooglePlacesSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        googlePlaceId: googlePlaceIdSchema,
        category: placeCategorySchema,
      }),
    )
    .min(1)
    .max(20),
  tripId: z.uuid().optional(),
});
export type SaveGooglePlacesInput = z.infer<typeof saveGooglePlacesSchema>;

export const saveGooglePlacesResponseSchema = z.object({
  places: z.array(placeSchema),
});
export type SaveGooglePlacesResponse = z.infer<typeof saveGooglePlacesResponseSchema>;

/**
 * Request body of POST /v1/places/:id/google: link one of the user's own places
 * (e.g. imported by name) to the Google place they picked. The response is the
 * place as it now is: the same id, or the Google place they had already saved.
 */
export const linkGooglePlaceSchema = z.strictObject({
  googlePlaceId: googlePlaceIdSchema,
  /** Our category for the picked result (from its Google type); only replaces 'other', never the user's choice. */
  category: placeCategorySchema.optional(),
});
export type LinkGooglePlaceInput = z.infer<typeof linkGooglePlaceSchema>;
