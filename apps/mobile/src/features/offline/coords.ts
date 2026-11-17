import type { LatLng } from '@travel-companion/shared';

/**
 * Google Maps Platform Service Specific Terms (Places API, section "Caching",
 * checked 2026-11-17): latitude/longitude from the Places API may be cached for
 * up to 30 consecutive calendar days, then must be deleted. Nothing else from
 * Google (name, address, hours, photos, time zone) is cached. Place IDs may be
 * stored indefinitely (general "Google ID caching" term).
 * The limit is enforced in code: expired entries are never returned and are
 * deleted at launch, on every write and when the app returns to the foreground.
 */
export const COORDS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const COORDS_SOURCE = 'google-places-api' as const;
/** Clock skew allowance: an entry "from the future" is treated as invalid. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export interface CachedCoord {
  placeId: string;
  latitude: number;
  longitude: number;
  /** Where the value came from (only Google Places API location values are cached). */
  source: typeof COORDS_SOURCE;
  /** When it was fetched from Google (ms since epoch). The 30-day clock starts here. */
  cachedAt: number;
}

export function isCoordValid(entry: CachedCoord, nowMs: number): boolean {
  const age = nowMs - entry.cachedAt;
  return (
    entry.source === COORDS_SOURCE &&
    Number.isFinite(entry.latitude) &&
    Number.isFinite(entry.longitude) &&
    age < COORDS_MAX_AGE_MS &&
    age > -FUTURE_TOLERANCE_MS
  );
}

/**
 * Keeps only valid entries for places the user still has in a cached trip
 * (`keep`); everything else is dropped.
 */
export function pruneCoords(
  entries: readonly CachedCoord[],
  nowMs: number,
  keep?: ReadonlySet<string>,
): CachedCoord[] {
  return entries.filter((entry) => isCoordValid(entry, nowMs) && (!keep || keep.has(entry.placeId)));
}

/** Adds or refreshes one place's coordinates from a new Google response. */
export function upsertCoord(
  entries: readonly CachedCoord[],
  placeId: string,
  location: LatLng,
  nowMs: number,
): CachedCoord[] {
  const next = entries.filter((entry) => entry.placeId !== placeId);
  next.push({
    placeId,
    latitude: location.latitude,
    longitude: location.longitude,
    source: COORDS_SOURCE,
    cachedAt: nowMs,
  });
  return next;
}

/** Valid coordinates by Google place ID, for use when Google can't be reached. */
export function coordLookup(entries: readonly CachedCoord[], nowMs: number): Map<string, LatLng> {
  return new Map(
    entries
      .filter((entry) => isCoordValid(entry, nowMs))
      .map((entry) => [entry.placeId, { latitude: entry.latitude, longitude: entry.longitude }]),
  );
}

/** Parses stored entries defensively (unknown or malformed rows are dropped). */
export function parseCoords(raw: unknown): CachedCoord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is CachedCoord =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as CachedCoord).placeId === 'string' &&
      typeof (item as CachedCoord).latitude === 'number' &&
      typeof (item as CachedCoord).longitude === 'number' &&
      (item as CachedCoord).source === COORDS_SOURCE &&
      typeof (item as CachedCoord).cachedAt === 'number',
  );
}
