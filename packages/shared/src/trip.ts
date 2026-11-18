import { z } from 'zod';
import { googlePlaceIdSchema } from './google.js';
import { placeSchema, type PlaceCategory } from './place.js';

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
  /** The hotel pinned on Google Maps (only the place ID is stored). Used for "near my hotel". */
  basePlaceId: googlePlaceIdSchema.nullable(),
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
    basePlaceId: googlePlaceIdSchema.nullable().optional().transform((value) => value ?? null),
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
    basePlaceId: googlePlaceIdSchema.nullable().optional(),
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

/** Planned start time, 24-hour "HH:MM" (local time at the destination). */
export const startTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  error: 'Use a 24-hour time like 09:30.',
});

/**
 * A place in a trip: the user's place plus its plan in this trip.
 * day null = on the wishlist; day set = planned for that day, ordered by position.
 */
export const tripPlaceSchema = placeSchema.extend({
  addedAt: z.iso.datetime({ offset: true }),
  day: calendarDateSchema.nullable(),
  startTime: startTimeSchema.nullable(),
  position: z.number().int().nonnegative(),
  /** Planned visit length; null means the category default (see defaultVisitMinutes). */
  durationMinutes: z.number().int().min(5).max(720).nullable(),
  /** M15: the user starred this stop as a highlight of the trip (default false for older servers). */
  highlight: z.boolean().default(false),
});
export type TripPlace = z.infer<typeof tripPlaceSchema>;

/**
 * Response of GET /v1/trips/:id. Places are sorted by day (planned days first,
 * then the wishlist), then by position within the day.
 */
export const tripDetailSchema = tripSchema.extend({
  places: z.array(tripPlaceSchema),
});
export type TripDetail = z.infer<typeof tripDetailSchema>;

/** Request body of POST /v1/trips/:id/places. */
export const addTripPlaceSchema = z.strictObject({
  placeId: z.uuid(),
});
export type AddTripPlaceInput = z.infer<typeof addTripPlaceSchema>;

/**
 * Request body of PATCH /v1/trips/:id/places/:placeId.
 * day: plan the place for that day (must be inside the trip dates), or null to move it back to the wishlist.
 * startTime: set or clear the time; a time needs a day. Moving to the wishlist clears the time.
 */
export const scheduleTripPlaceSchema = z
  .strictObject({
    day: calendarDateSchema.nullable().optional(),
    startTime: startTimeSchema.nullable().optional(),
    /** Planned visit length in minutes, or null for the category default. */
    durationMinutes: z.number().int().min(5).max(720).nullable().optional(),
    /** M15: star (or unstar) the stop as a trip highlight. */
    highlight: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.day !== undefined ||
      body.startTime !== undefined ||
      body.durationMinutes !== undefined ||
      body.highlight !== undefined,
    { error: 'Provide day, startTime, durationMinutes or highlight.' },
  )
  .refine((body) => !(body.day === null && typeof body.startTime === 'string'), {
    error: 'A time needs a day.',
    path: ['startTime'],
  });
export type ScheduleTripPlaceInput = z.input<typeof scheduleTripPlaceSchema>;
export type ScheduleTripPlaceData = z.output<typeof scheduleTripPlaceSchema>;

/** Most places one day can hold (and the most ids one reorder request may send). */
export const TRIP_DAY_MAX_PLACES = 100;

/** Request body of PUT /v1/trips/:id/days/:day/order: every place of that day, in the new order. */
export const reorderTripDaySchema = z.strictObject({
  placeIds: z
    .array(z.uuid())
    .min(1)
    .max(TRIP_DAY_MAX_PLACES)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Each place may appear only once.' }),
});
export type ReorderTripDayInput = z.infer<typeof reorderTripDaySchema>;

/** Longest trip the itinerary shows day by day. */
export const TRIP_MAX_DAYS = 60;

/**
 * Every calendar day from start to end (inclusive), as "YYYY-MM-DD".
 * Empty when a date is missing or the range is reversed; capped at TRIP_MAX_DAYS.
 */
export function tripDays(startDate: string | null, endDate: string | null): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end && days.length < TRIP_MAX_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Typical visit length per category (minutes), used when a stop has no duration set. */
export const DEFAULT_VISIT_MINUTES: Record<PlaceCategory, number> = {
  food: 60,
  coffee: 30,
  sights: 90,
  shopping: 60,
  nightlife: 90,
  outdoors: 60,
  stay: 0,
  other: 45,
};

/** The planned visit length: the user's own, else the category default. */
export function visitMinutes(place: { durationMinutes: number | null; category: PlaceCategory }): number {
  return place.durationMinutes ?? DEFAULT_VISIT_MINUTES[place.category];
}
