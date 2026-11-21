import type { Place, Stay, Stop, StopStatus, TripDetail, TripDetailV2, TripMember, TripPlace } from '@travel-companion/shared';

/**
 * D1 · What screens get for one trip, built from the v2 trip (saved places,
 * visits, stays). Itinerary code keeps working on "items" shaped like the
 * pre-D1 trip places, with one item per VISIT (a place can be visited several
 * times) plus one per saved place that isn't planned yet.
 *
 * - `id` is the item's own id: the visit id, or the saved-place id when not planned.
 * - `placeId` is the place in the collection (open it, look it up, compare with the collection).
 * - `visitedAt` is when THIS visit was done (null otherwise).
 */
export interface TripItem extends TripPlace {
  placeId: string;
  tripPlaceId: string;
  stopId: string | null;
  status: StopStatus | null;
  arrivedAt: string | null;
  skippedAt: string | null;
  /** The visit's own stored zone (custom pin or confirmed by the user). */
  visitTimeZone: string | null;
}

/** A place saved to the trip, with its visits (any status), earliest first. */
export interface SavedPlace extends TripMember {
  visits: Stop[];
}

export interface TripView extends Omit<TripDetail, 'places'> {
  /** Visits by day and order, then saved places not planned yet. */
  places: TripItem[];
  saved: SavedPlace[];
  stays: Stay[];
  timeZone: string | null;
  timeZoneSource: 'derived' | 'user' | null;
  /** The v2 copy it was built from. */
  source: TripDetailV2;
}

/** A visit that is still to happen (or happening). */
export const isUpcoming = (status: StopStatus | null) => status === 'planned' || status === 'in_progress';

function placeOf(member: TripMember): Place {
  const { tripPlaceId: _tripPlaceId, savedAt: _savedAt, ...place } = member;
  return place;
}

/** The stay for the night that starts on `day`: dated stay covering it, else the whole-trip stay. */
export function stayForNight(stays: readonly Stay[], day: string | null): Stay | null {
  if (day) {
    const dated = stays.find((stay) => stay.checkIn !== null && stay.checkOut !== null && stay.checkIn <= day && day < stay.checkOut);
    if (dated) return dated;
  }
  return stays.find((stay) => stay.checkIn === null) ?? null;
}

/** The stay you woke up in on `day` (its check-out day). */
function stayCheckingOut(stays: readonly Stay[], day: string): Stay | null {
  return stays.find((stay) => stay.checkOut === day) ?? null;
}

/**
 * D1 time zone of a trip day, from stored values only: the stay covering
 * that night → the stay checked out of that morning → the whole-trip stay →
 * the trip's zone → the latest earlier stay. Null when nothing is stored (the
 * caller then uses the hotel's live zone, else the phone's).
 */
export function storedZoneFor(trip: Pick<TripView, 'stays' | 'timeZone'>, day: string | null): string | null {
  if (day) {
    const covering = stayForNight(trip.stays, day);
    if (covering?.checkIn && covering.timeZone) return covering.timeZone;
    const morning = stayCheckingOut(trip.stays, day);
    if (morning?.timeZone) return morning.timeZone;
  }
  const whole = trip.stays.find((stay) => stay.checkIn === null && stay.timeZone);
  if (whole?.timeZone) return whole.timeZone;
  if (trip.timeZone) return trip.timeZone;
  if (day) {
    const earlier = trip.stays
      .filter((stay) => stay.timeZone && stay.checkOut !== null && stay.checkOut <= day)
      .sort((a, b) => (b.checkOut ?? '').localeCompare(a.checkOut ?? ''))[0];
    if (earlier?.timeZone) return earlier.timeZone;
  }
  return null;
}

/** The stay v1 showed as "Staying at": the first night's, else the whole-trip stay, else the earliest. */
export function primaryStay(stays: readonly Stay[], startDate: string | null): Stay | null {
  return stayForNight(stays, startDate) ?? [...stays].sort((a, b) => (a.checkIn ?? '').localeCompare(b.checkIn ?? ''))[0] ?? null;
}

export function buildTripView(detail: TripDetailV2): TripView {
  const membersById = new Map(detail.places.map((member) => [member.tripPlaceId, member]));
  const visitsOf = new Map<string, Stop[]>();
  for (const stop of detail.stops) visitsOf.set(stop.tripPlaceId, [...(visitsOf.get(stop.tripPlaceId) ?? []), stop]);

  const visitItems: TripItem[] = [];
  for (const stop of detail.stops) {
    const member = membersById.get(stop.tripPlaceId);
    if (!member) continue;
    visitItems.push({
      ...placeOf(member),
      id: stop.id,
      placeId: member.id,
      tripPlaceId: member.tripPlaceId,
      stopId: stop.id,
      status: stop.status,
      arrivedAt: stop.arrivedAt,
      skippedAt: stop.skippedAt,
      visitTimeZone: stop.timeZone,
      visitedAt: stop.completedAt,
      addedAt: stop.createdAt,
      day: stop.day,
      startTime: stop.startTime,
      position: stop.position,
      durationMinutes: stop.durationMinutes,
      highlight: stop.highlight,
    });
  }
  visitItems.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || a.position - b.position || a.addedAt.localeCompare(b.addedAt));

  // Not planned: no visit that is planned, happening or done (a skipped one can be planned again).
  const unplanned: TripItem[] = detail.places
    .filter((member) => !(visitsOf.get(member.tripPlaceId) ?? []).some((stop) => stop.status !== 'skipped'))
    .map((member) => ({
      ...placeOf(member),
      id: member.tripPlaceId,
      placeId: member.id,
      tripPlaceId: member.tripPlaceId,
      stopId: null,
      status: null,
      arrivedAt: null,
      skippedAt: null,
      visitTimeZone: null,
      visitedAt: null,
      addedAt: member.savedAt,
      day: null,
      startTime: null,
      position: 0,
      durationMinutes: null,
      highlight: false,
    }));

  const saved: SavedPlace[] = detail.places.map((member) => ({
    ...member,
    visits: [...(visitsOf.get(member.tripPlaceId) ?? [])].sort(
      (a, b) => a.day.localeCompare(b.day) || a.position - b.position,
    ),
  }));

  const stay = primaryStay(detail.stays, detail.trip.startDate);
  return {
    ...detail.trip,
    baseLocation: stay ? (stay.label ?? (stay.place?.source === 'custom' ? stay.place.name : null)) : null,
    basePlaceId: stay?.place?.googlePlaceId ?? null,
    placeCount: detail.places.length,
    places: [...visitItems, ...unplanned],
    saved,
    stays: detail.stays,
    source: detail,
  };
}

/** The visits of a day (any status), in order. */
export function visitsForDay(places: readonly TripItem[], day: string): TripItem[] {
  return places
    .filter((item) => item.stopId !== null && item.day === day)
    .sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt));
}

/** A random v4 UUID for records created on the phone (offline-safe; the server accepts it as the id). */
export function newId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
