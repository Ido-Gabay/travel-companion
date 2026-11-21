import { z } from 'zod';
import { latLngSchema } from './google.js';

/**
 * An IANA time zone name ("America/New_York", "UTC"). Same format rule as the
 * database (trips/trip_stops/trip_stays time_zone), plus a check that this
 * runtime knows the zone.
 */
export const TIME_ZONE_PATTERN = /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){1,2})$/;

export function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .max(64)
  .regex(TIME_ZONE_PATTERN, { error: 'Use an IANA time zone like America/New_York.' })
  .refine(isKnownTimeZone, { error: 'Unknown time zone.' });

/**
 * Where a stored zone came from:
 * - derived: computed by the server from the user's own coordinates (a custom place pin);
 * - user: chosen or confirmed by the user (required for anything derived from Google data, D1 Q3).
 */
export const TIME_ZONE_SOURCES = ['derived', 'user'] as const;
export const timeZoneSourceSchema = z.enum(TIME_ZONE_SOURCES);
export type TimeZoneSource = z.infer<typeof timeZoneSourceSchema>;

/** Request body of POST /v1/timezones/lookup. Nothing is stored or logged. */
export const timeZoneLookupSchema = z.strictObject({
  latitude: latLngSchema.shape.latitude,
  longitude: latLngSchema.shape.longitude,
});
export type TimeZoneLookupInput = z.infer<typeof timeZoneLookupSchema>;

/**
 * A zone suggestion for a point. Never stored as such: the app shows it and the
 * user confirms it with one tap (then it is saved with source "user").
 * certain = false when the point is at sea, in a disputed area or on a border
 * (several candidates): the app should ask the user to pick.
 */
export const timeZoneSuggestionSchema = z.object({
  timeZone: z.string().nullable(),
  alternatives: z.array(z.string()),
  certain: z.boolean(),
  /** Boundary data release (timezone-boundary-builder), e.g. "2026f". */
  dataset: z.string(),
});
export type TimeZoneSuggestion = z.infer<typeof timeZoneSuggestionSchema>;
