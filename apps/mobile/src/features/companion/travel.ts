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
  /** Estimated route length (straight line × detour). */
  meters: number;
  minutes: number;
  mode: TravelMode;
}

export function estimateTravel(from: LatLng, to: LatLng): TravelEstimate {
  const meters = distanceMeters(from, to) * ROUTE_DETOUR;
  const walk = Math.max(1, Math.round(meters / WALK_METERS_PER_MIN));
  if (walk <= WALK_MAX_MIN) return { meters, minutes: walk, mode: 'walk' };
  const transit = Math.round(TRANSIT_OVERHEAD_MIN + meters / TRANSIT_METERS_PER_MIN);
  return { meters, minutes: Math.min(walk, transit), mode: 'transit' };
}
