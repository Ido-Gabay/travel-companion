import type { LatLng, RouteLegRequest, RouteLegsResponse } from '@travel-companion/shared';
import { ROUTE_LEGS_MAX } from '@travel-companion/shared';
import { isUsableLatLng, reliableTravel, type TravelEstimate } from './travel';
import { zonedDateTimeToUtc } from './zoned-time';

/**
 * M16: real travel times from Google Routes (Essentials), when online.
 * Pure helpers (tested); the hook is in real-routes.ts.
 *
 * - Only legs the screen actually shows are asked for (≤ 10 per request), and
 *   the server caps calls per day and month. Past a cap, or offline, or on any
 *   error, the lookup is empty and callers use the on-device estimate.
 * - Results live only in memory (React Query, 20 minutes). They are never
 *   written to the phone: the offline saved copy doesn't include them, because
 *   Google's terms don't allow caching route results.
 */

/** Looks up a real route for a leg; null = use the estimate. */
export type RouteLookup = (from: LatLng, to: LatLng) => TravelEstimate | null;

export const ROUTES_STALE_MS = 20 * 60 * 1000;

/** ~11 m: the same two points always map to the same leg. */
export function legKey(from: LatLng, to: LatLng): string {
  const f = (n: number) => n.toFixed(4);
  return `${f(from.latitude)},${f(from.longitude)}>${f(to.latitude)},${f(to.longitude)}`;
}

/** Google's encoded polyline format → points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export interface PlannedLeg {
  from: LatLng | null;
  to: LatLng | null;
  /** Expected departure, minutes since midnight on `day` (for transit timetables); null = now. */
  departMinutes: number | null;
}

/**
 * Requests for the legs worth asking about: valid points, not the same place,
 * de-duplicated, at most ROUTE_LEGS_MAX. The mode follows the on-device
 * estimate (short = walk, long = transit), so each leg is one call.
 */
export function routeRequests(legs: readonly PlannedLeg[], day: string | null, timeZone: string | null): RouteLegRequest[] {
  const seen = new Set<string>();
  const out: RouteLegRequest[] = [];
  for (const leg of legs) {
    if (out.length >= ROUTE_LEGS_MAX) break;
    if (!isUsableLatLng(leg.from) || !isUsableLatLng(leg.to)) continue;
    const estimate = reliableTravel(leg.from, leg.to);
    // Unreliable (absurd) or practically the same spot: nothing worth paying for.
    if (!estimate || estimate.meters < 80) continue;
    const key = legKey(leg.from, leg.to);
    if (seen.has(key)) continue;
    seen.add(key);
    const request: RouteLegRequest = { from: leg.from, to: leg.to, mode: estimate.mode };
    if (estimate.mode === 'transit' && day && leg.departMinutes !== null) {
      const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(leg.departMinutes)));
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      request.departAt = new Date(zonedDateTimeToUtc(day, time, timeZone)).toISOString();
    }
    out.push(request);
  }
  return out;
}

/** The lookup for a server answer (only legs that got a route). */
export function buildLookup(requests: readonly RouteLegRequest[], response: RouteLegsResponse | undefined): RouteLookup | undefined {
  if (!response) return undefined;
  const byKey = new Map<string, TravelEstimate>();
  requests.forEach((request, index) => {
    const leg = response.legs[index];
    if (!leg) return;
    const path = leg.polyline ? decodePolyline(leg.polyline) : [];
    byKey.set(legKey(request.from, request.to), {
      minutes: leg.minutes,
      meters: leg.meters,
      mode: leg.mode,
      source: 'google',
      ...(path.length > 1 ? { path } : {}),
    });
  });
  if (byKey.size === 0) return undefined;
  return (from, to) => byKey.get(legKey(from, to)) ?? null;
}

