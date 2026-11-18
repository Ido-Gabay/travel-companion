import type { RouteLeg, RouteLegRequest } from '@travel-companion/shared';

/**
 * Only these fields are requested. Duration, distance and the route line are
 * all Essentials-level; nothing here may trigger a Pro or Enterprise SKU.
 */
export const ROUTES_FIELD_MASK = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Google accepts transit departure times from 7 days in the past to 100 days ahead. */
const TRANSIT_PAST_MS = 7 * DAY_MS - 60_000;
const TRANSIT_FUTURE_MS = 100 * DAY_MS - 60_000;

/**
 * The Compute Routes body for one leg. Deliberately never sets
 * routingPreference, intermediates, optimizeWaypointOrder, location modifiers,
 * tolls or traffic on polylines: each of those would bill as Pro/Enterprise.
 */
export function buildComputeRoutesBody(leg: RouteLegRequest, nowMs: number, language: string) {
  const point = (p: { latitude: number; longitude: number }) => ({
    location: { latLng: { latitude: p.latitude, longitude: p.longitude } },
  });
  const body: Record<string, unknown> = {
    origin: point(leg.from),
    destination: point(leg.to),
    travelMode: leg.mode === 'walk' ? 'WALK' : 'TRANSIT',
    computeAlternativeRoutes: false,
    languageCode: language,
    units: 'METRIC',
  };
  // Walking doesn't depend on the time; transit uses it for timetables when it's in Google's window.
  if (leg.mode === 'transit' && leg.departAt) {
    const at = Date.parse(leg.departAt);
    if (Number.isFinite(at) && at > nowMs - TRANSIT_PAST_MS && at < nowMs + TRANSIT_FUTURE_MS) {
      body.departureTime = new Date(at).toISOString();
    }
  }
  return body;
}

export interface GoogleRoutesResponse {
  routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
}

/** The first route, or null when Google found none (e.g. no transit between the two points). */
export function toRouteLeg(response: GoogleRoutesResponse, mode: RouteLeg['mode']): RouteLeg | null {
  const route = response.routes?.[0];
  const seconds = route?.duration ? Number.parseFloat(route.duration.replace(/s$/, '')) : Number.NaN;
  if (!route || !Number.isFinite(seconds) || seconds < 0) return null;
  return {
    minutes: Math.max(1, Math.round(seconds / 60)),
    meters: Math.max(0, Math.round(route.distanceMeters ?? 0)),
    mode,
    polyline: route.polyline?.encodedPolyline ?? null,
  };
}
