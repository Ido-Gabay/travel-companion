import type { LatLng, TimeZoneSource, TimeZoneSuggestion } from '@travel-companion/shared';
import type { Tx } from '../database/database.service.js';
import type { TimeZonesService } from '../timezones/timezones.service.js';

/** A place's user-owned pin (custom places only; Google places never have one stored). */
export interface PlacePin {
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export async function placePin(tx: Tx, ownerId: string, placeId: string | null): Promise<PlacePin | null> {
  if (!placeId) return null;
  const [row] = await tx<PlacePin[]>`
    select google_place_id, latitude, longitude from app.places where id = ${placeId} and owner_id = ${ownerId}
  `;
  return row ?? null;
}

export interface ZoneDecision {
  /** undefined = leave the stored zone as it is; null = clear it. */
  store?: { timeZone: string; source: TimeZoneSource; dataset: string | null } | null;
  /** Shown to the user to confirm (D1 Q3); never stored as such. */
  suggestion: TimeZoneSuggestion | null;
}

/**
 * D1 Q3, in one place:
 * 1. a zone the user sent (chose or confirmed) is stored as "user";
 * 2. else, for a custom place with the user's own pin, the zone is derived and
 *    stored as "derived" (with the boundary data release) when unambiguous;
 * 3. else a location the phone sent (e.g. a Google place's coordinates, held
 *    in memory only) gives a suggestion to confirm — nothing is stored.
 */
export function decideZone(
  timeZones: TimeZonesService,
  input: { timeZone?: string | null; location?: LatLng },
  pin: PlacePin | null,
  derivePin: boolean,
): ZoneDecision {
  if (input.timeZone !== undefined) {
    return { store: input.timeZone === null ? null : { timeZone: input.timeZone, source: 'user', dataset: null }, suggestion: null };
  }
  if (derivePin && pin && pin.google_place_id === null && pin.latitude !== null && pin.longitude !== null) {
    const derived = timeZones.derive(pin.latitude, pin.longitude);
    if (derived) return { store: { timeZone: derived.timeZone, source: 'derived', dataset: derived.dataset }, suggestion: null };
    return { store: null, suggestion: timeZones.suggest(pin.latitude, pin.longitude) };
  }
  if (input.location) {
    return { suggestion: timeZones.suggest(input.location.latitude, input.location.longitude) };
  }
  return { suggestion: null };
}
