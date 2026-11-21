import { z } from 'zod';
import { placeSchema } from './place.js';
import { staySchema } from './stay.js';
import { stopSchema } from './stop.js';
import { timeZoneSchema, timeZoneSourceSchema } from './timezone.js';
import { calendarDateSchema, tripSchema, TRIP_DESTINATION_MAX, TRIP_TITLE_MAX } from './trip.js';

/**
 * D1 · API v2 trip shapes. Stays replace baseLocation/basePlaceId; visits
 * (stops) replace the per-place day/startTime/position.
 */
export const tripV2Schema = tripSchema.omit({ baseLocation: true, basePlaceId: true }).extend({
  /** Trip default zone (used when no stay or visit says otherwise). */
  timeZone: z.string().nullable(),
  timeZoneSource: timeZoneSourceSchema.nullable(),
});
export type TripV2 = z.infer<typeof tripV2Schema>;

/** A place saved to the trip (membership). Independent of its visits. */
export const tripMemberSchema = placeSchema.extend({
  tripPlaceId: z.uuid(),
  savedAt: z.iso.datetime({ offset: true }),
});
export type TripMember = z.infer<typeof tripMemberSchema>;

/** Response of GET /v2/trips/:id. Stops by day then position; stays by check-in (whole-trip stays first). */
export const tripDetailV2Schema = z.object({
  trip: tripV2Schema,
  places: z.array(tripMemberSchema),
  stops: z.array(stopSchema),
  stays: z.array(staySchema),
});
export type TripDetailV2 = z.infer<typeof tripDetailV2Schema>;

const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/**
 * Request body of PATCH /v2/trips/:id. Shortening the dates when visits fall
 * outside is refused (409 STOPS_OUTSIDE_DATES, listing them) unless
 * unscheduleOutside is true: then planned visits outside are removed. Visits
 * that already happened (in progress, done, skipped) are never removed.
 */
export const updateTripV2Schema = z
  .strictObject({
    title: z.string().trim().min(1).max(TRIP_TITLE_MAX).optional(),
    destination: patchText(TRIP_DESTINATION_MAX),
    startDate: calendarDateSchema.nullable().optional(),
    endDate: calendarDateSchema.nullable().optional(),
    /** Set by the user (stored with source "user"), or null to clear. */
    timeZone: timeZoneSchema.nullable().optional(),
    unscheduleOutside: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.destination !== undefined ||
      body.startDate !== undefined ||
      body.endDate !== undefined ||
      body.timeZone !== undefined,
    { error: 'Provide at least one field to update.' },
  )
  .refine((trip) => !trip.startDate || !trip.endDate || trip.endDate >= trip.startDate, {
    error: 'End date must be on or after the start date.',
    path: ['endDate'],
  });
export type UpdateTripV2Input = z.input<typeof updateTripV2Schema>;
export type UpdateTripV2Data = z.output<typeof updateTripV2Schema>;

/** Request body of POST /v2/trips/:id/places: save a place to the trip. */
export const addTripMemberSchema = z.strictObject({
  id: z.uuid().optional(),
  placeId: z.uuid(),
});
export type AddTripMemberInput = z.infer<typeof addTripMemberSchema>;

/** One entry of a place's visit history (GET /v1/places/:id/visits). */
export const placeVisitSchema = z.object({
  /** visit = a completed visit; legacy_mark = the older "visited" mark with no visit behind it. */
  source: z.enum(['visit', 'legacy_mark']),
  tripId: z.uuid().nullable(),
  /** The trip's title, also for deleted trips (their completed visits stay in history). */
  tripTitle: z.string().nullable(),
  stopId: z.uuid().nullable(),
  day: calendarDateSchema.nullable(),
  completedAt: z.iso.datetime({ offset: true }),
});
export type PlaceVisit = z.infer<typeof placeVisitSchema>;

export const placeVisitListSchema = z.object({ items: z.array(placeVisitSchema) });
export type PlaceVisitList = z.infer<typeof placeVisitListSchema>;
