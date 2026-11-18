import type { LatLng } from '@travel-companion/shared';
import { reliableTravel, type TravelMode } from '../companion/travel';
import { firstFit, hoursIssue, type HoursIssue, type OpenWindow } from './opening-hours';

/**
 * M13 smart day planning: pure, deterministic, free (no paid routing).
 * Three things for one day of the itinerary:
 *   checkDay     — a summary (stops, visit time, travel) and warnings
 *   optimizeOrder — a shorter order; stops the user gave a time keep their place
 *   suggestTimes  — start times for stops without one; the user's times never change
 * Nothing here changes the plan: the UI shows a proposal and the user applies it.
 */

export interface PlanStop {
  id: string;
  /** "HH:MM" set by the user, or null (flexible). */
  startTime: string | null;
  /** Visit length in minutes (the user's, or the category default). */
  durationMinutes: number;
  location: LatLng | null;
  visited: boolean;
  /** Opening windows that day, when the user asked to check them (null/absent = unknown). */
  hours?: OpenWindow[] | null;
}

/** When a leg can't be estimated (a place without a known location). */
export const UNKNOWN_TRAVEL_MIN = 15;
/** Default start of a day when nothing is timed earlier. */
export const DEFAULT_DAY_START_MIN = 9 * 60 + 30;
/** A day ending after this gets a warning. */
export const LATE_END_MIN = 22 * 60;
/** Visits + travel above this is an overloaded day. */
export const OVERLOADED_MIN = 11 * 60;
/** Legs longer than this get a warning. */
export const LONG_LEG_MIN = 45;
/** Only suggest a new order if it saves at least this much travel. */
export const MIN_SAVING_MIN = 5;

export interface Leg {
  minutes: number;
  /** False when a location was missing and UNKNOWN_TRAVEL_MIN was used. */
  known: boolean;
  mode: TravelMode | null;
}

export function leg(from: LatLng | null, to: LatLng | null): Leg {
  // Missing or unreliable (invalid coordinates, unrealistic distance) counts as unknown.
  const estimate = reliableTravel(from, to);
  if (!estimate) return { minutes: UNKNOWN_TRAVEL_MIN, known: false, mode: null };
  return { minutes: estimate.minutes, known: true, mode: estimate.mode };
}

export const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const toTime = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 55));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

const roundUp5 = (minutes: number) => Math.ceil(minutes / 5) * 5;

/** Total travel along an order, from the hotel (if known) to the last stop. */
export function routeMinutes(stops: readonly PlanStop[], start: LatLng | null): number {
  let total = 0;
  let previous: LatLng | null = start;
  stops.forEach((stop, index) => {
    if (index > 0 || start) total += leg(previous, stop.location).minutes;
    previous = stop.location;
  });
  return total;
}

// ---------------------------------------------------------------------------
// Timeline and checks
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  id: string;
  /** Minutes since midnight: the user's time, or a projected one. */
  start: number;
  end: number;
  projected: boolean;
  /** Travel to this stop from the previous one (or the hotel for the first). */
  travel: Leg | null;
}

/**
 * Walks the day in order. Timed stops keep their time; flexible ones start as soon
 * as the previous visit plus travel allows (rounded up to 5 min).
 */
export function projectDay(stops: readonly PlanStop[], start: LatLng | null, dayStart = DEFAULT_DAY_START_MIN): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let previousEnd: number | null = null;
  let previous: LatLng | null = start;
  stops.forEach((stop, index) => {
    const travel = index > 0 || start ? leg(previous, stop.location) : null;
    let begin: number;
    if (stop.startTime) {
      begin = toMinutes(stop.startTime);
    } else if (previousEnd === null) {
      // Before the first timed stop: start the day early enough, but not before dayStart.
      begin = dayStart;
    } else {
      begin = roundUp5(previousEnd + (travel?.minutes ?? 0));
    }
    // A flexible stop waits for opening time (when hours were checked).
    if (!stop.startTime && stop.hours && stop.hours.length > 0) {
      const fit = firstFit(stop.hours, begin, stop.durationMinutes);
      if (fit !== null) begin = roundUp5(fit);
    }
    const end = begin + stop.durationMinutes;
    entries.push({ id: stop.id, start: begin, end, projected: stop.startTime === null, travel });
    previousEnd = end;
    previous = stop.location;
  });
  return entries;
}

export type DayWarning =
  | { kind: 'tight'; stopId: string; lateBy: number }
  | { kind: 'outOfOrder'; stopId: string }
  | { kind: 'longLeg'; stopId: string; minutes: number }
  | { kind: 'lateEnd'; endsAt: number }
  | { kind: 'overloaded'; minutes: number }
  | { kind: 'hours'; stopId: string; issue: HoursIssue };

export interface DayCheck {
  stops: number;
  visitMinutes: number;
  travelMinutes: number;
  /** Legs estimated without a location (travel may be off). */
  unknownLegs: number;
  startsAt: number | null;
  endsAt: number | null;
  warnings: DayWarning[];
}

export function checkDay(stops: readonly PlanStop[], start: LatLng | null, dayStart = DEFAULT_DAY_START_MIN): DayCheck {
  const timeline = projectDay(stops, start, dayStart);
  const warnings: DayWarning[] = [];
  let previousTimed: number | null = null;
  let previousEnd: number | null = null;

  timeline.forEach((entry, index) => {
    const stop = stops[index] as PlanStop;
    if (stop.hours !== undefined && !stop.visited) {
      const issue = hoursIssue(stop.hours, entry.start, entry.end);
      if (issue) warnings.push({ kind: 'hours', stopId: stop.id, issue });
    }
    if (entry.travel && entry.travel.known && entry.travel.minutes > LONG_LEG_MIN) {
      warnings.push({ kind: 'longLeg', stopId: stop.id, minutes: entry.travel.minutes });
    }
    if (stop.startTime) {
      const at = toMinutes(stop.startTime);
      if (previousTimed !== null && at < previousTimed) {
        warnings.push({ kind: 'outOfOrder', stopId: stop.id });
      } else if (previousEnd !== null) {
        const ready = previousEnd + (entry.travel?.minutes ?? 0);
        if (ready > at + 4) warnings.push({ kind: 'tight', stopId: stop.id, lateBy: ready - at });
      }
      previousTimed = at;
    }
    previousEnd = entry.end;
  });

  const visitMinutes = stops.reduce((sum, stop) => sum + stop.durationMinutes, 0);
  const travelMinutes = timeline.reduce((sum, entry) => sum + (entry.travel?.minutes ?? 0), 0);
  const endsAt = timeline.length > 0 ? (timeline[timeline.length - 1] as TimelineEntry).end : null;
  if (endsAt !== null && endsAt > LATE_END_MIN) warnings.push({ kind: 'lateEnd', endsAt });
  if (visitMinutes + travelMinutes > OVERLOADED_MIN) warnings.push({ kind: 'overloaded', minutes: visitMinutes + travelMinutes });

  return {
    stops: stops.length,
    visitMinutes,
    travelMinutes,
    unknownLegs: timeline.filter((entry) => entry.travel && !entry.travel.known).length,
    startsAt: timeline[0]?.start ?? null,
    endsAt,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Better order
// ---------------------------------------------------------------------------

export interface OrderProposal {
  order: string[];
  travelBefore: number;
  travelAfter: number;
  saved: number;
}

/**
 * A shorter order for the day. Fixed in place, in their current order: stops with
 * a time, stops already done, and stops without a known location. The others are
 * placed where they add the least travel (cheapest insertion, then a relocation
 * pass). Between two timed stops a place is only put where it fits the gap.
 * Returns null when no order saves at least MIN_SAVING_MIN.
 */
export function optimizeOrder(stops: readonly PlanStop[], start: LatLng | null): OrderProposal | null {
  const movable = (stop: PlanStop) => !stop.startTime && !stop.visited && stop.location !== null;
  const fixed = stops.filter((stop) => !movable(stop));
  const free = stops.filter(movable);
  if (free.length === 0 || stops.length < 3) return null;

  const fits = (route: readonly PlanStop[], index: number, stop: PlanStop): boolean => {
    // Next timed stop at or after the slot, and the end of what comes before it.
    const nextTimed = route.slice(index).find((item) => item.startTime);
    if (!nextTimed) return true;
    const trial = [...route.slice(0, index), stop, ...route.slice(index)];
    const timeline = projectDay(trial, start);
    const position = trial.indexOf(nextTimed);
    const before = timeline[position - 1];
    const travel = timeline[position]?.travel?.minutes ?? 0;
    // Only constrain when something timed comes before the slot (otherwise the day can start earlier).
    const anchoredBefore = route.slice(0, index).some((item) => item.startTime);
    return !anchoredBefore || !before || before.end + travel <= toMinutes(nextTimed.startTime as string) + 4;
  };

  const insertionCost = (route: readonly PlanStop[], index: number, stop: PlanStop) =>
    routeMinutes([...route.slice(0, index), stop, ...route.slice(index)], start) - routeMinutes(route, start);

  let route: PlanStop[] = [...fixed];
  const pending = [...free];
  while (pending.length > 0) {
    let best: { stop: PlanStop; index: number; cost: number } | null = null;
    for (const stop of pending) {
      for (let index = 0; index <= route.length; index += 1) {
        if (!fits(route, index, stop)) continue;
        const cost = insertionCost(route, index, stop);
        if (!best || cost < best.cost) best = { stop, index, cost };
      }
    }
    // Nowhere fits between timed stops: append at the end of the day.
    const chosen = best ?? { stop: pending[0] as PlanStop, index: route.length, cost: 0 };
    route = [...route.slice(0, chosen.index), chosen.stop, ...route.slice(chosen.index)];
    pending.splice(pending.indexOf(chosen.stop), 1);
  }

  // Relocation pass: move single flexible stops while it shortens the route.
  for (let pass = 0; pass < 5; pass += 1) {
    let improved = false;
    for (const stop of free) {
      const without = route.filter((item) => item !== stop);
      const current = routeMinutes(route, start);
      for (let index = 0; index <= without.length; index += 1) {
        if (!fits(without, index, stop)) continue;
        const candidate = [...without.slice(0, index), stop, ...without.slice(index)];
        if (routeMinutes(candidate, start) < current) {
          route = candidate;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }

  const travelBefore = routeMinutes(stops, start);
  const travelAfter = routeMinutes(route, start);
  const order = route.map((stop) => stop.id);
  const unchanged = order.every((id, index) => id === stops[index]?.id);
  if (unchanged || travelBefore - travelAfter < MIN_SAVING_MIN) return null;
  return { order, travelBefore, travelAfter, saved: travelBefore - travelAfter };
}

// ---------------------------------------------------------------------------
// Times for flexible stops
// ---------------------------------------------------------------------------

/**
 * Start times for flexible stops that aren't done yet, following the order.
 * The user's own times are never changed (and are not in the result).
 */
export function suggestTimes(stops: readonly PlanStop[], start: LatLng | null, dayStart = DEFAULT_DAY_START_MIN): Map<string, string> {
  const suggestions = new Map<string, string>();
  projectDay(stops, start, dayStart).forEach((entry, index) => {
    const stop = stops[index] as PlanStop;
    if (entry.projected && !stop.visited) suggestions.set(stop.id, toTime(entry.start));
  });
  return suggestions;
}
