import { z } from 'zod';
import { localeSchema } from './locale.js';

export const DISTANCE_UNITS = ['km', 'mi'] as const;
export const distanceUnitSchema = z.enum(DISTANCE_UNITS);
export type DistanceUnit = z.infer<typeof distanceUnitSchema>;

/** Response shape of GET/PATCH /v1/me/preferences. */
export const preferencesSchema = z.object({
  locale: localeSchema,
  distanceUnit: distanceUnitSchema,
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** Request body of PATCH /v1/me/preferences. At least one field is required. */
export const updatePreferencesSchema = z
  .strictObject({
    locale: localeSchema.optional(),
    distanceUnit: distanceUnitSchema.optional(),
  })
  .refine((body) => body.locale !== undefined || body.distanceUnit !== undefined, {
    error: 'Provide at least one preference to update.',
  });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
