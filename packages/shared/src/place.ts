import { z } from 'zod';
import { googlePlaceIdSchema } from './google.js';

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

/** Request body of POST /v1/places (a custom place the user types in). */
export const createPlaceSchema = z.strictObject({
  name: placeName,
  address: nullableText(PLACE_ADDRESS_MAX).optional().transform((value) => value ?? null),
  notes: nullableText(PLACE_NOTES_MAX).optional().transform((value) => value ?? null),
  category: placeCategorySchema.optional().transform((value) => value ?? 'other'),
});
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
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Provide at least one field to update.',
  });
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
