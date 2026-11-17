import { z } from 'zod';

export const TRIP_TITLE_MAX = 120;
export const TRIP_DESTINATION_MAX = 120;

/** Calendar date without time zone, e.g. "2026-11-23". */
export const calendarDateSchema = z.iso.date();

/** Response item of GET /v1/trips. */
export const tripSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  destination: z.string().nullable(),
  startDate: calendarDateSchema.nullable(),
  endDate: calendarDateSchema.nullable(),
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
    startDate: calendarDateSchema.nullable().optional().transform((value) => value ?? null),
    endDate: calendarDateSchema.nullable().optional().transform((value) => value ?? null),
  })
  .refine((trip) => !trip.startDate || !trip.endDate || trip.endDate >= trip.startDate, {
    error: 'End date must be on or after the start date.',
    path: ['endDate'],
  });
export type CreateTripInput = z.input<typeof createTripSchema>;
export type CreateTripData = z.output<typeof createTripSchema>;

/** A place as it appears inside a trip. */
export const tripPlaceSchema = z.object({
  placeId: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
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
