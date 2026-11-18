import type { LatLng, PlaceCategory, TripPlace } from '@travel-companion/shared';
import { DEFAULT_VISIT_MINUTES } from '@travel-companion/shared';
import { distanceMeters } from './geo';
import { isUsableLatLng, reliableTravel, type TravelEstimate } from './travel';

/**
 * Live Today engine: deterministic, pure and unit-tested. It reads the day's
 * plan, the time and (optionally) where the user is, and answers the four
 * Today questions. It never changes anything: every change it proposes is an
 * action the user must accept (see TodayAction).
 *
 * Times are minutes since local midnight (0–1439). The phone is assumed to be
 * on the destination's time zone during the trip; preview mode passes a
 * chosen time instead.
 */

/** Minutes kept free before a planned start (finding the door, a short wait). */
export const BUFFER_MIN = 5;
/** Later than this (minutes) counts as running late. */
export const LATE_THRESHOLD_MIN = 10;
/** Free time shorter than this isn't worth suggesting anything for. */
export const MIN_FREE_MIN = 20;
/** Within this distance of a stop, the user is "at" it. */
export const AT_PLACE_METERS = 150;
/** Further than this from every place in the plan, the phone's location is ignored (e.g. still at home). */
export const FAR_AWAY_METERS = 50_000;
/** When the day's plan should end at the latest (23:00). */
export const DAY_END_MIN = 23 * 60;
/** "Nearby" when nothing fits a gap: within this walk. */
export const NEARBY_WALK_MIN = 15;
/** Suggestions shown at once. */
export const MAX_SUGGESTIONS = 3;

export interface EngineStop {
  id: string;
  name: string;
  category: PlaceCategory;
  /** "HH:MM" or null (flexible). */
  startTime: string | null;
  durationMinutes: number | null;
  visited: boolean;
  location: LatLng | null;
}

export interface Candidate {
  id: string;
  name: string;
  category: PlaceCategory;
  durationMinutes: number | null;
  location: LatLng | null;
  /** On this trip's wishlist, or only in the global collection. */
  source: 'wishlist' | 'collection';
}

export interface TodayInput {
  /** The day's stops in itinerary order. */
  stops: readonly EngineStop[];
  nowMinutes: number;
  /** The phone's location, if the user allowed it. */
  here: LatLng | null;
  /** The pinned hotel, used when there's no better starting point. */
  hotel: LatLng | null;
  candidates: readonly Candidate[];
  /** Ids of hints/suggestions the user dismissed today. */
  dismissed: ReadonlySet<string>;
  /** Whether the trip has a next day (for "move to tomorrow"). */
  hasTomorrow: boolean;
  /** M16: real routes when online (Google Routes); legs without one use the on-device estimate. */
  routeFor?: (from: LatLng, to: LatLng) => TravelEstimate | null;
}

export type StopStatus = 'done' | 'now' | 'next' | 'later';

export interface TimelineItem {
  stop: EngineStop;
  status: StopStatus;
  /** From the stop's own time, if set. */
  plannedStart: number | null;
  /** Expected start from now on (done stops: null). */
  projectedStart: number | null;
  projectedEnd: number | null;
  visitMinutes: number;
  /** Travel from the previous point of the day (real route or estimate). */
  travel: TravelEstimate | null;
  /** Where that travel starts (null when there's no travel). */
  from: LatLng | null;
}

export type Origin = 'here' | 'current' | 'previous' | 'hotel';

export interface NextInfo {
  stop: EngineStop;
  travel: TravelEstimate | null;
  /** Where the user sets off from (null when travel is unknown). */
  from: LatLng | null;
  origin: Origin | null;
  /** When to leave to arrive on time (only when the stop has a time and travel is known). */
  leaveBy: number | null;
  /** Expected arrival. */
  arriveAt: number | null;
  /** Minutes late against the stop's time (0 when on time or no time). */
  lateBy: number;
}

export interface FreeTime {
  minutes: number;
  from: number;
  until: number;
  /** The stop the free time ends at, or null when the plan is done for the day. */
  untilStopId: string | null;
}

/** Changes the app may propose. Nothing happens until the user accepts one. */
export type TodayAction =
  | { type: 'shiftStart'; stopId: string; startTime: string }
  | { type: 'moveToTomorrow'; stopId: string }
  | { type: 'removeFromDay'; stopId: string }
  | { type: 'addToday'; placeId: string; source: 'wishlist' | 'collection'; afterStopId: string | null };

export type Hint =
  | { id: string; kind: 'late'; stopId: string; stopName: string; lateBy: number; actions: TodayAction[] }
  | { id: string; kind: 'overbooked'; stopId: string; stopName: string; endsAt: number; actions: TodayAction[] };

export interface Suggestion {
  id: string;
  candidate: Candidate;
  travel: TravelEstimate;
  visitMinutes: number;
  /** Travel there + visit + travel on to the next stop. */
  totalMinutes: number;
  /** True when it fits the free time; false for plain "nearby" ideas. */
  fits: boolean;
  action: TodayAction;
}

export interface TodayResult {
  timeline: TimelineItem[];
  done: number;
  total: number;
  current: TimelineItem | null;
  next: NextInfo | null;
  /** Expected end of the day's plan. */
  dayEndsAt: number | null;
  free: FreeTime | null;
  hints: Hint[];
  suggestions: Suggestion[];
  /** Where suggestions are measured from. */
  origin: Origin | null;
  /** The phone's location was ignored because it is far from the trip. */
  hereIgnored: boolean;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "HH:MM" for minutes since midnight, clamped to the day. */
export function toClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** The order of a day after inserting one place right after another (or first). */
export function orderWithInserted(dayIds: readonly string[], placeId: string, afterId: string | null): string[] {
  const rest = dayIds.filter((id) => id !== placeId);
  const found = afterId === null ? -1 : rest.indexOf(afterId);
  const at = found === -1 ? 0 : found + 1;
  return [...rest.slice(0, at), placeId, ...rest.slice(at)];
}

export function roundUpTo5(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

function visitFor(item: { durationMinutes: number | null; category: PlaceCategory }): number {
  return item.durationMinutes ?? DEFAULT_VISIT_MINUTES[item.category];
}

/** A real route when there is one (M16), else a trustworthy estimate (see reliableTravel), else null ("unavailable"). */
function travelWith(routeFor: TodayInput['routeFor']) {
  return (from: LatLng | null, to: LatLng | null): TravelEstimate | null =>
    (routeFor && isUsableLatLng(from) && isUsableLatLng(to) ? routeFor(from, to) : null) ?? reliableTravel(from, to);
}

/**
 * The day's trip places as engine stops. Names and locations come from the caller:
 * Google's when loaded; offline, the place's category and cached coordinates (M12a).
 */
export function toEngineStops(
  places: readonly Pick<TripPlace, 'id' | 'category' | 'startTime' | 'durationMinutes' | 'visitedAt' | 'googlePlaceId' | 'name'>[],
  nameOf: (place: Pick<TripPlace, 'googlePlaceId' | 'name' | 'category'>) => string,
  locationOf: (place: Pick<TripPlace, 'googlePlaceId'>) => LatLng | null,
): EngineStop[] {
  return places.map((place) => ({
    id: place.id,
    name: nameOf(place),
    category: place.category,
    startTime: place.startTime,
    durationMinutes: place.durationMinutes,
    visited: place.visitedAt !== null,
    location: locationOf(place),
  }));
}

export function computeToday(input: TodayInput): TodayResult {
  const { stops, nowMinutes: now, hotel, dismissed } = input;
  const travelBetween = travelWith(input.routeFor);

  // Ignore a location far from everything in the trip (e.g. the phone is still at home).
  const known = [hotel, ...stops.map((stop) => stop.location)].filter((point): point is LatLng => point !== null);
  const hereIgnored =
    input.here !== null && known.length > 0 && known.every((point) => distanceMeters(input.here as LatLng, point) > FAR_AWAY_METERS);
  const here = hereIgnored || !isUsableLatLng(input.here) ? null : input.here;

  // 1. Where am I in my day? Walk the plan and project it from now.
  const lastDone = [...stops].reverse().find((stop) => stop.visited && stop.location) ?? null;
  const firstOpenIndex = stops.findIndex((stop) => !stop.visited);
  const firstOpen = firstOpenIndex === -1 ? null : stops[firstOpenIndex];
  const atFirstOpen =
    firstOpen !== null &&
    firstOpen !== undefined &&
    here !== null &&
    firstOpen.location !== null &&
    distanceMeters(here, firstOpen.location) <= AT_PLACE_METERS;

  let cursor = now;
  let position: LatLng | null = here ?? lastDone?.location ?? hotel;
  let nextAssigned = false;
  const timeline: TimelineItem[] = stops.map((stop, index) => {
    const plannedStart = stop.startTime ? toMinutes(stop.startTime) : null;
    const visit = visitFor(stop);
    if (stop.visited) {
      return { stop, status: 'done', plannedStart, projectedStart: null, projectedEnd: null, visitMinutes: visit, travel: null, from: null };
    }
    if (index === firstOpenIndex && atFirstOpen) {
      const start = plannedStart !== null ? Math.min(plannedStart, now) : now;
      const end = Math.max(now, start + visit);
      cursor = end;
      position = stop.location ?? position;
      return { stop, status: 'now', plannedStart, projectedStart: start, projectedEnd: end, visitMinutes: visit, travel: null, from: null };
    }
    const from = position;
    const travel = travelBetween(from, stop.location);
    const arrive = cursor + (travel?.minutes ?? 0);
    const start = Math.max(arrive, plannedStart ?? arrive);
    const end = start + visit;
    cursor = end;
    position = stop.location ?? position;
    const status: StopStatus = nextAssigned ? 'later' : 'next';
    nextAssigned = true;
    return { stop, status, plannedStart, projectedStart: start, projectedEnd: end, visitMinutes: visit, travel, from: travel ? from : null };
  });

  const current = timeline.find((item) => item.status === 'now') ?? null;
  const nextItem = timeline.find((item) => item.status === 'next') ?? null;
  const done = timeline.filter((item) => item.status === 'done').length;
  const open = timeline.filter((item) => item.status !== 'done');
  const dayEndsAt = open.length > 0 ? (open[open.length - 1]?.projectedEnd ?? null) : null;

  // Where the user will set off from for the next stop (and for suggestions).
  const originPoint: { point: LatLng | null; origin: Origin | null } = current?.stop.location
    ? { point: current.stop.location, origin: 'current' }
    : here
      ? { point: here, origin: 'here' }
      : lastDone?.location
        ? { point: lastDone.location, origin: 'previous' }
        : hotel
          ? { point: hotel, origin: 'hotel' }
          : { point: null, origin: null };
  /** When the user is free to go: now, or when the current visit ends. */
  const freeFrom = current?.projectedEnd ?? now;

  // 2. What's next, and when should I leave?
  let next: NextInfo | null = null;
  if (nextItem) {
    const travel = travelBetween(originPoint.point, nextItem.stop.location);
    const travelMin = travel?.minutes ?? 0;
    const arriveAt = freeFrom + travelMin;
    // Without a reliable travel estimate there is no honest leave-by time (and so no free-time window).
    const leaveBy = nextItem.plannedStart !== null && travel ? nextItem.plannedStart - travelMin - BUFFER_MIN : null;
    const lateBy = nextItem.plannedStart !== null ? Math.max(0, arriveAt + BUFFER_MIN - nextItem.plannedStart) : 0;
    next = {
      stop: nextItem.stop,
      travel,
      from: travel ? originPoint.point : null,
      origin: travel ? originPoint.origin : null,
      leaveBy,
      arriveAt,
      lateBy,
    };
  }

  // 3. What can I do now with the time available?
  let free: FreeTime | null = null;
  if (next && next.leaveBy !== null) {
    const minutes = next.leaveBy - freeFrom;
    if (minutes >= MIN_FREE_MIN) free = { minutes, from: freeFrom, until: next.leaveBy, untilStopId: next.stop.id };
  } else if (!nextItem && !current) {
    const minutes = DAY_END_MIN - now;
    if (minutes >= MIN_FREE_MIN) free = { minutes, from: now, until: DAY_END_MIN, untilStopId: null };
  }

  const afterStopId = current?.stop.id ?? [...timeline].reverse().find((item) => item.status === 'done')?.stop.id ?? null;
  const planIds = new Set(stops.map((stop) => stop.id));
  const scored = input.candidates
    .filter((candidate) => !planIds.has(candidate.id) && !dismissed.has(`sug:${candidate.id}`))
    .flatMap((candidate) => {
      const travel = travelBetween(originPoint.point, candidate.location);
      if (!travel) return [];
      const visit = visitFor(candidate);
      const onward = next ? travelBetween(candidate.location, next.stop.location) : null;
      const totalMinutes = travel.minutes + visit + (onward?.minutes ?? 0);
      // With the plan done for the day, "now" ideas stay within walking distance.
      const reachable = free?.untilStopId !== null || travel.mode === 'walk';
      const fits = free !== null && reachable && totalMinutes + BUFFER_MIN <= free.minutes;
      return [{ candidate, travel, visit, totalMinutes, fits }];
    });
  const ranked = (free
    ? scored.filter((item) => item.fits)
    : next?.leaveBy === null || !next
      ? scored.filter((item) => item.travel.mode === 'walk' && item.travel.minutes <= NEARBY_WALK_MIN)
      : []
  ).sort(
    (a, b) =>
      (a.candidate.source === b.candidate.source ? 0 : a.candidate.source === 'wishlist' ? -1 : 1) ||
      a.totalMinutes - b.totalMinutes ||
      a.candidate.name.localeCompare(b.candidate.name),
  );
  const suggestions: Suggestion[] = ranked.slice(0, MAX_SUGGESTIONS).map((item) => ({
    id: `sug:${item.candidate.id}`,
    candidate: item.candidate,
    travel: item.travel,
    visitMinutes: item.visit,
    totalMinutes: item.totalMinutes,
    fits: item.fits,
    action: { type: 'addToday', placeId: item.candidate.id, source: item.candidate.source, afterStopId },
  }));

  // 4. Should I consider changing my plan?
  const hints: Hint[] = [];
  const skip = (stopId: string): TodayAction =>
    input.hasTomorrow ? { type: 'moveToTomorrow', stopId } : { type: 'removeFromDay', stopId };
  if (next && next.lateBy >= LATE_THRESHOLD_MIN && next.arriveAt !== null) {
    hints.push({
      id: `late:${next.stop.id}`,
      kind: 'late',
      stopId: next.stop.id,
      stopName: next.stop.name,
      lateBy: next.lateBy,
      actions: [
        { type: 'shiftStart', stopId: next.stop.id, startTime: toClock(roundUpTo5(next.arriveAt)) },
        skip(next.stop.id),
      ],
    });
  }
  const lastOpen = open[open.length - 1];
  if (lastOpen && dayEndsAt !== null && dayEndsAt > DAY_END_MIN && lastOpen.status !== 'now') {
    hints.push({
      id: `over:${lastOpen.stop.id}`,
      kind: 'overbooked',
      stopId: lastOpen.stop.id,
      stopName: lastOpen.stop.name,
      endsAt: dayEndsAt,
      actions: [skip(lastOpen.stop.id)],
    });
  }

  return {
    timeline,
    done,
    total: stops.length,
    current,
    next,
    dayEndsAt,
    free,
    hints: hints.filter((hint) => !dismissed.has(hint.id)),
    suggestions,
    origin: originPoint.origin,
    hereIgnored,
  };
}
