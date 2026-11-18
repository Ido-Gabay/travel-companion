import type { LatLng } from '@travel-companion/shared';
import { distanceMeters } from './geo';

/**
 * Free, on-device travel estimates (no paid routing API). Straight-line
 * distance is stretched for the street grid, then turned into walking time;
 * long trips assume subway/taxi. Always shown as an estimate ("≈"), with a
 * Google Maps link for the real route.
 */

/** Streets are longer than a straight line; ~1.3 fits Manhattan's grid. */
export const ROUTE_DETOUR = 1.3;
/** About 4.8 km/h. */
export const WALK_METERS_PER_MIN = 80;
/** Beyond this walk, assume subway or taxi. */
export const WALK_MAX_MIN = 25;
/** Getting to the station, waiting, walking out. */
export const TRANSIT_OVERHEAD_MIN = 10;
/** Average door-to-door speed once moving (~20 km/h). */
export const TRANSIT_METERS_PER_MIN = 333;

export type TravelMode = 'walk' | 'transit';

export interface TravelEstimate {
  /** Route length: Google's (source "google"), else straight line × detour. */
  meters: number;
  minutes: number;
  mode: TravelMode;
  /** "google" = a real route from Google Routes (M16, online only); absent = on-device estimate. */
  source?: 'google';
  /** The route's path when it's a real route. */
  path?: LatLng[];
}

export function estimateTravel(from: LatLng, to: LatLng): TravelEstimate {
  const meters = distanceMeters(from, to) * ROUTE_DETOUR;
  const walk = Math.max(1, Math.round(meters / WALK_METERS_PER_MIN));
  if (walk <= WALK_MAX_MIN) return { meters, minutes: walk, mode: 'walk' };
  const transit = Math.round(TRANSIT_OVERHEAD_MIN + meters / TRANSIT_METERS_PER_MIN);
  return { meters, minutes: Math.min(walk, transit), mode: 'transit' };
}

/** Beyond this, a door-to-door city estimate isn't believable (wrong coordinates, another city). */
export const MAX_ESTIMATE_METERS = 60_000;
/** Longer than this isn't a realistic hop between two stops of one day. */
export const MAX_ESTIMATE_MIN = 180;

/** Finite, in range and not the "null island" (0, 0) that bad data often produces. */
export function isUsableLatLng(point: LatLng | null | undefined): point is LatLng {
  return (
    point !== null &&
    point !== undefined &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180 &&
    !(point.latitude === 0 && point.longitude === 0)
  );
}

/**
 * The estimate, or null when it can't be trusted: a missing or invalid
 * coordinate, or a result too long to be a real hop within the day. Callers
 * show "travel time unavailable" instead of a misleading number.
 */
export function reliableTravel(from: LatLng | null, to: LatLng | null): TravelEstimate | null {
  if (!isUsableLatLng(from) || !isUsableLatLng(to)) return null;
  const estimate = estimateTravel(from, to);
  if (
    !Number.isFinite(estimate.meters) ||
    !Number.isFinite(estimate.minutes) ||
    estimate.meters > MAX_ESTIMATE_METERS ||
    estimate.minutes > MAX_ESTIMATE_MIN
  ) {
    return null;
  }
  return estimate;
}
