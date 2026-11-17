import { z } from 'zod';
import { placeSchema } from './place.js';

export const TRIP_TITLE_MAX = 120;
export const TRIP_DESTINATION_MAX = 120;
export const TRIP_BASE_LOCATION_MAX = 200;

/** Calendar date without time zone, e.g. "2026-11-23". */
export const calendarDateSchema = z.iso.date();

/** Response item of GET /v1/trips. */
export const tripSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  destination: z.string().nullable(),
  startDate: calendarDateSchema.nullable(),
  endDate: calendarDateSchema.nullable(),
  /** Where the user stays (hotel or area), as they typed it. */
  baseLocation: z.string().nullable(),
  /** Number of places added to this trip. */
  placeCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type Trip = z.infer<typeof tripSchema>;

export const tripListSchema = z.object({
  items: z.array(tripSchema),
});
export type TripList = z.infer<typeof tripListSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/** Request body of POST /v1/trips. Dates are optional; when both are set, end >= start. */
export const createTripSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(TRIP_TITLE_MAX),
    destination: optionalText(TRIP_DESTINATION_MAX),
    baseLocation: optionalText(TRIP_BASE_LOCATION_MAX),
    startDate: calendarDateSchema.nullable().optional().transform((value) => value ?? null),
    endDate: calendarDateSchema.nullable().optional().transform((value) => value ?? null),
  })
  .refine((trip) => !trip.startDate || !trip.endDate || trip.endDate >= trip.startDate, {
    error: 'End date must be on or after the start date.',
    path: ['endDate'],
  });
export type CreateTripInput = z.input<typeof createTripSchema>;
export type CreateTripData = z.output<typeof createTripSchema>;

/** Trimmed text where blank or null clears the field; undefined leaves it unchanged. */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/**
 * Request body of PATCH /v1/trips/:id. Send only what changes. The database
 * also enforces end >= start against the stored dates.
 */
export const updateTripSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(TRIP_TITLE_MAX).optional(),
    destination: patchText(TRIP_DESTINATION_MAX),
    baseLocation: patchText(TRIP_BASE_LOCATION_MAX),
    startDate: calendarDateSchema.nullable().optional(),
    endDate: calendarDateSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Provide at least one field to update.',
  })
  .refine((trip) => !trip.startDate || !trip.endDate || trip.endDate >= trip.startDate, {
    error: 'End date must be on or after the start date.',
    path: ['endDate'],
  });
export type UpdateTripInput = z.input<typeof updateTripSchema>;
export type UpdateTripData = z.output<typeof updateTripSchema>;

/** A place in a trip's wishlist: the user's place plus when it was added. */
export const tripPlaceSchema = placeSchema.extend({
  addedAt: z.iso.datetime({ offset: true }),
});
export type TripPlace = z.infer<typeof tripPlaceSchema>;

/** Response of GET /v1/trips/:id. Places are in the order they were added. */
export const tripDetailSchema = tripSchema.extend({
  places: z.array(tripPlaceSchema),
});
export type TripDetail = z.infer<typeof tripDetailSchema>;

/** Request body of POST /v1/trips/:id/places. */
export const addTripPlaceSchema = z.strictObject({
  placeId: z.uuid(),
});
export type AddTripPlaceInput = z.infer<typeof addTripPlaceSchema>;
