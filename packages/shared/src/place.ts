import { z } from 'zod';

export const PLACE_NAME_MAX = 120;
export const PLACE_ADDRESS_MAX = 200;
export const PLACE_NOTES_MAX = 2000;

/** A place in the user's global collection. Only text the user entered. */
export const placeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
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

/** Request body of POST /v1/places. */
export const createPlaceSchema = z.strictObject({
  name: placeName,
  address: nullableText(PLACE_ADDRESS_MAX).optional().transform((value) => value ?? null),
  notes: nullableText(PLACE_NOTES_MAX).optional().transform((value) => value ?? null),
});
export type CreatePlaceInput = z.input<typeof createPlaceSchema>;
export type CreatePlaceData = z.output<typeof createPlaceSchema>;

/** Request body of PATCH /v1/places/:id. Send only the fields to change; null clears. */
export const updatePlaceSchema = z
  .strictObject({
    name: placeName.optional(),
    address: nullableText(PLACE_ADDRESS_MAX).optional(),
    notes: nullableText(PLACE_NOTES_MAX).optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.address !== undefined || body.notes !== undefined,
    { error: 'Provide at least one field to update.' },
  );
export type UpdatePlaceInput = z.input<typeof updatePlaceSchema>;
export type UpdatePlaceData = z.output<typeof updatePlaceSchema>;
