import { z } from 'zod';
import { latLngSchema } from './google.js';
import { timeZoneSchema, timeZoneSuggestionSchema } from './timezone.js';
import { calendarDateSchema, startTimeSchema, TRIP_DAY_MAX_PLACES } from './trip.js';

/**
 * D1 · A visit ("stop"): the plan to be at a place saved to the trip on a
 * day, and what happened. A saved place can have any number of visits.
 * planned → in_progress → completed, or → skipped; reset goes back to planned.
 */
export const STOP_STATUSES = ['planned', 'in_progress', 'completed', 'skipped'] as const;
export const stopStatusSchema = z.enum(STOP_STATUSES);
export type StopStatus = z.infer<typeof stopStatusSchema>;

export const stopSchema = z.object({
  id: z.uuid(),
  tripId: z.uuid(),
  /** The membership (place saved to this trip) the visit belongs to. */
  tripPlaceId: z.uuid(),
  placeId: z.uuid(),
  day: calendarDateSchema,
  position: z.number().int().nonnegative(),
  startTime: startTimeSchema.nullable(),
  durationMinutes: z.number().int().min(5).max(720).nullable(),
  /** The visit's own zone, when stored (custom pin, or confirmed by the user); else the day's zone applies. */
  timeZone: z.string().nullable(),
  status: stopStatusSchema,
  arrivedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  skippedAt: z.iso.datetime({ offset: true }).nullable(),
  /** user = marked done by the user; migrated = from a legacy "visited" mark (D1 backfill). */
  completionSource: z.enum(['user', 'migrated']).nullable(),
  highlight: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type Stop = z.infer<typeof stopSchema>;

const durationSchema = z.number().int().min(5).max(720);

/** Request body of POST /v2/trips/:id/stops. */
export const addStopSchema = z.strictObject({
  /** Client-generated id (offline): retries with the same id are idempotent. */
  id: z.uuid().optional(),
  tripPlaceId: z.uuid(),
  day: calendarDateSchema,
  startTime: startTimeSchema.nullable().optional(),
  durationMinutes: durationSchema.nullable().optional(),
  highlight: z.boolean().optional(),
  /** A zone the user chose or confirmed for this visit. */
  timeZone: timeZoneSchema.nullable().optional(),
  /** The place's location as the phone knows it, only to suggest a zone. Never stored. */
  location: latLngSchema.optional(),
});
export type AddStopInput = z.input<typeof addStopSchema>;
export type AddStopData = z.output<typeof addStopSchema>;

/** Request body of PATCH /v2/trips/:id/stops/:stopId. Day, time, duration and place: planned and in-progress visits only. */
export const updateStopSchema = z
  .strictObject({
    day: calendarDateSchema.optional(),
    startTime: startTimeSchema.nullable().optional(),
    durationMinutes: durationSchema.nullable().optional(),
    highlight: z.boolean().optional(),
    timeZone: timeZoneSchema.nullable().optional(),
    /** Move the visit to another place saved to the same trip (e.g. "Use my own pin"). */
    tripPlaceId: z.uuid().optional(),
    location: latLngSchema.optional(),
  })
  .refine(
    (body) =>
      body.day !== undefined ||
      body.startTime !== undefined ||
      body.durationMinutes !== undefined ||
      body.highlight !== undefined ||
      body.timeZone !== undefined ||
      body.tripPlaceId !== undefined,
    { error: 'Provide at least one field to update.' },
  );
export type UpdateStopInput = z.input<typeof updateStopSchema>;
export type UpdateStopData = z.output<typeof updateStopSchema>;

export const STOP_TRANSITIONS = ['arrive', 'complete', 'skip', 'reset'] as const;
export type StopTransition = (typeof STOP_TRANSITIONS)[number];

/**
 * Request body of POST /v2/trips/:id/stops/:stopId/{arrive,complete,skip,reset}.
 * `at`: when it happened (an offline action sent later); default now. Not in the future.
 */
export const stopTransitionSchema = z
  .strictObject({
    at: z.iso.datetime({ offset: true }).optional(),
  })
  .optional()
  .transform((body) => body ?? {});
export type StopTransitionData = z.output<typeof stopTransitionSchema>;

/** Request body of PUT /v2/trips/:id/days/:day/order: every visit of that day, in the new order. */
export const reorderStopsSchema = z.strictObject({
  stopIds: z
    .array(z.uuid())
    .min(1)
    .max(TRIP_DAY_MAX_PLACES)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Each visit may appear only once.' }),
});
export type ReorderStopsInput = z.infer<typeof reorderStopsSchema>;

/** Response of stop writes: the visit, plus a zone to confirm when one could be suggested (D1 Q3). */
export const stopWriteResponseSchema = z.object({
  stop: stopSchema,
  timeZoneSuggestion: timeZoneSuggestionSchema.nullable(),
});
export type StopWriteResponse = z.infer<typeof stopWriteResponseSchema>;
