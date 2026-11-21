import { z } from 'zod';
import { localeSchema } from './locale.js';

/** Most places one import can bring in (paste or CSV). */
export const MAX_IMPORT_PLACES = 100;
/** Most text sent for AI extraction. */
export const MAX_IMPORT_TEXT = 4000;

/** A place as the user wrote it: their name, and a note or area only when the text said so. */
export const importedPlaceSchema = z.strictObject({
    name: z.string().trim().min(1).max(120),
    note: z.string().trim().min(1).max(300).nullable(),
    area: z.string().trim().min(1).max(80).nullable(),
});
export type ImportedPlace = z.infer<typeof importedPlaceSchema>;

/** Free text (a chat message, recommendations) → place names. The user's own words only. */
export const extractPlacesRequestSchema = z.strictObject({
    text: z.string().trim().min(1).max(MAX_IMPORT_TEXT),
    locale: localeSchema,
});
export type ExtractPlacesRequest = z.infer<typeof extractPlacesRequestSchema>;

export const extractPlacesResponseSchema = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('places'), places: z.array(importedPlaceSchema).max(MAX_IMPORT_PLACES) }),
    /** No AI right now (no key, over the daily cap, an error): the app keeps the text and says so. */
    z.strictObject({ action: z.literal('unavailable') }),
]);
export type ExtractPlacesResponse = z.infer<typeof extractPlacesResponseSchema>;
