import { z } from 'zod';
import { latLngSchema } from './google.js';
import { placeSchema } from './place.js';
import { timeZoneSchema, timeZoneSourceSchema, timeZoneSuggestionSchema } from './timezone.js';
import { calendarDateSchema, TRIP_BASE_LOCATION_MAX } from './trip.js';

/**
 * D1 · Where the user stays, by nights [checkIn, checkOut). No dates = the
 * whole trip. label = the user's own "Staying at" text, unchanged.
 */
export const staySchema = z.object({
  id: z.uuid(),
  tripId: z.uuid(),
  /** The hotel in the user's collection (category "stay"), if pinned. */
  placeId: z.uuid().nullable(),
  /** That place (Google places: ID only, as everywhere), so the app can show and locate the hotel. */
  place: placeSchema.nullable(),
  label: z.string().nullable(),
  checkIn: calendarDateSchema.nullable(),
  checkOut: calendarDateSchema.nullable(),
  timeZone: z.string().nullable(),
  timeZoneSource: timeZoneSourceSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type Stay = z.infer<typeof staySchema>;

const stayLabel = z
  .string()
  .trim()
  .max(TRIP_BASE_LOCATION_MAX)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const datesValid = (body: { checkIn?: string | null; checkOut?: string | null }) =>
  !body.checkIn || !body.checkOut || body.checkOut > body.checkIn;

/** Request body of POST /v2/trips/:id/stays. */
export const createStaySchema = z
  .strictObject({
    id: z.uuid().optional(),
    placeId: z.uuid().nullable().optional().transform((value) => value ?? null),
    label: stayLabel.optional().transform((value) => value ?? null),
    checkIn: calendarDateSchema.nullable().optional().transform((value) => value ?? null),
    checkOut: calendarDateSchema.nullable().optional().transform((value) => value ?? null),
    /** A zone the user chose or confirmed. */
    timeZone: timeZoneSchema.nullable().optional(),
    /** The hotel's location as the phone knows it, only to suggest a zone. Never stored. */
    location: latLngSchema.optional(),
  })
  .refine((body) => body.placeId !== null || body.label !== null, {
    error: 'Pin a place or type where you stay.',
    path: ['label'],
  })
  .refine((body) => (body.checkIn === null) === (body.checkOut === null), {
    error: 'Set both check-in and check-out, or neither (the whole trip).',
    path: ['checkOut'],
  })
  .refine(datesValid, { error: 'Check-out must be after check-in.', path: ['checkOut'] });
export type CreateStayInput = z.input<typeof createStaySchema>;
export type CreateStayData = z.output<typeof createStaySchema>;

/** Request body of PATCH /v2/trips/:id/stays/:stayId. Send only what changes; null clears. */
export const updateStaySchema = z
  .strictObject({
    placeId: z.uuid().nullable().optional(),
    label: stayLabel.optional(),
    checkIn: calendarDateSchema.nullable().optional(),
    checkOut: calendarDateSchema.nullable().optional(),
    timeZone: timeZoneSchema.nullable().optional(),
    location: latLngSchema.optional(),
  })
  .refine(
    (body) =>
      body.placeId !== undefined ||
      body.label !== undefined ||
      body.checkIn !== undefined ||
      body.checkOut !== undefined ||
      body.timeZone !== undefined ||
      body.location !== undefined,
    { error: 'Provide at least one field to update.' },
  )
  .refine((body) => (body.checkIn === undefined) === (body.checkOut === undefined), {
    error: 'Change check-in and check-out together.',
    path: ['checkOut'],
  })
  .refine(datesValid, { error: 'Check-out must be after check-in.', path: ['checkOut'] });
export type UpdateStayInput = z.input<typeof updateStaySchema>;
export type UpdateStayData = z.output<typeof updateStaySchema>;

/** Response of stay writes: the stay, plus a zone to confirm when one could be suggested (D1 Q3). */
export const stayWriteResponseSchema = z.object({
  stay: staySchema,
  timeZoneSuggestion: timeZoneSuggestionSchema.nullable(),
});
export type StayWriteResponse = z.infer<typeof stayWriteResponseSchema>;
