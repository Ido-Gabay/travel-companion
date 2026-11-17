import { z } from 'zod';
import { preferencesSchema } from './preferences.js';

export const DISPLAY_NAME_MAX = 80;

/** A display name: trimmed, 1–80 characters. */
export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX);

/** Response shape of GET/PATCH /v1/me. */
export const meSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
  preferences: preferencesSchema,
});
export type Me = z.infer<typeof meSchema>;

/** Request body of PATCH /v1/me. `null` clears the display name. */
export const updateProfileSchema = z.strictObject({
  displayName: displayNameSchema.nullable(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
