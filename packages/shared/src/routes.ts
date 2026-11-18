import { z } from 'zod';
import { latLngSchema } from './google.js';

/**
 * Real travel times between two points (M16), from Google Routes API
 * "Compute Routes" at the Essentials SKU only: no traffic-aware routing, no
 * waypoint optimization, no intermediate waypoints. Results are for display
 * only and never stored (Google's caching rules); the app falls back to its
 * own estimate when a leg has no result.
 */

/** Legs per request (each leg is one billed Compute Routes call). */
export const ROUTE_LEGS_MAX = 10;

export const routeModeSchema = z.enum(['walk', 'transit']);
export type RouteMode = z.infer<typeof routeModeSchema>;

export const routeLegRequestSchema = z.strictObject({
  from: latLngSchema,
  to: latLngSchema,
  mode: routeModeSchema,
  /** For transit timetables. Omitted = now. */
  departAt: z.iso.datetime({ offset: true }).optional(),
});
export type RouteLegRequest = z.infer<typeof routeLegRequestSchema>;

export const routeLegsRequestSchema = z.strictObject({
  legs: z.array(routeLegRequestSchema).min(1).max(ROUTE_LEGS_MAX),
});
export type RouteLegsRequest = z.infer<typeof routeLegsRequestSchema>;

export const routeLegSchema = z.object({
  minutes: z.number().int().nonnegative(),
  meters: z.number().int().nonnegative(),
  mode: routeModeSchema,
  /** Google's encoded polyline of the route, or null. */
  polyline: z.string().nullable(),
});
export type RouteLeg = z.infer<typeof routeLegSchema>;

/** One entry per requested leg, in order; null when Google had no route (or a cap was reached). */
export const routeLegsResponseSchema = z.object({
  legs: z.array(routeLegSchema.nullable()),
  /** True when the daily or monthly cap stopped some legs (they are null). */
  limited: z.boolean(),
});
export type RouteLegsResponse = z.infer<typeof routeLegsResponseSchema>;
