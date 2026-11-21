import type { LatLng } from '@travel-companion/shared';
import type { TravelMode } from '../companion/travel';
import { checkDay, DEFAULT_DAY_START_MIN, LATE_END_MIN, leg, OVERLOADED_MIN, type PlanStop } from './day-planner';
import { firstFit, type OpenWindow } from './opening-hours';
import { smartOrder } from './smart-plan';

/**
 * D1 trip-wide planning: which day each place goes on, for the whole trip
 * (pure, free, deterministic; estimates only, no Google lookups). It builds on
 * the day planner (loads, opening hours) and smart-plan (a day's best order).
 *
 * It proposes; it never changes anything. Every change carries its reasons,
 * and the user accepts or rejects each one. What it never does on its own:
 *  - move done, skipped, happening-now or starred visits, or visits with a
 *    time the user set (a booking or a plan);
 *  - add to or move into a day in the past;
 *  - remove anything: a place that doesn't fit stays on the wishlist, with an
 *    alternative when there is one.
 * Unknown data (no opening hours, no location) never blocks a plan: the place
 * is planned on what IS known, and the result counts what was missing.
 */

/** A day where you change hotels loses about this much time (check-out, bags, check-in). */
export const HOTEL_CHANGE_MIN = 120;
/** Two places this close (estimated travel) count as "near" each other. */
export const NEAR_MIN = 15;
/** An existing visit is suggested for another day only if that saves at least this much travel. */
export const AREA_MIN_SAVING = 20;
/** A day using less than this share of its available time has room to spare. */
export const UNUSED_SHARE = 0.4;
/** A better order saving this much makes a day "inefficient" (fixed with Plan this day). */
export const INEFFICIENT_MIN = 15;
/** How much an evenly spread trip is worth, in travel minutes (a full day vs an empty one). */
const BALANCE_WEIGHT_MIN = 40;
/**
 * Joining a day where nothing is near costs this much per minute of distance past NEAR_MIN:
 * a day spent in one area beats crossing town, even when transit makes the crossing look cheap.
 */
const AREA_WEIGHT = 1;
/** Earliest time a visit is assumed to start on a day (opening hours check). */
const EARLIEST_START_MIN = 8 * 60;
/** Area moves suggested at most (the rest is noise). */
const MAX_AREA_MOVES = 8;

export interface TripPlanDay {
  day: string;
  /** Where the day starts and ends: that night's stay (null = unknown). */
  start: LatLng | null;
  /** The day's visits in order (skipped ones left out). */
  stops: PlanStop[];
  /** Time available for visits and travel. */
  capacityMinutes: number;
  /** False for days already over: nothing is added to or moved into them. */
  available: boolean;
  /** Earliest time for a suggested visit (today: not before now). */
  dayStart?: number;
  /** The user asked for this day's limit (the assistant): moves off it say so. */
  limitedByRequest?: boolean;
}

export interface TripPlanInput {
  days: TripPlanDay[];
  /** Saved places not on any day yet (id = the saved place's id). */
  wishlist: PlanStop[];
  /** Opening windows of a visit or place on a day: undefined = not checked, null = unknown, [] = closed. */
  windowsOn: (id: string, day: string) => OpenWindow[] | null | undefined;
  /** Visits the user asked to move (the assistant): to that day, or null for the best one. */
  moveRequests?: readonly { stopId: string; toDay: string | null }[];
  /**
   * Wishlist places the user asked to add (the assistant): to that day, or null
   * for the best day with room. A named day that's full is used only with allowOver.
   */
  addRequests?: readonly { stopId: string; toDay: string | null; allowOver?: boolean }[];
}

/**
 * Time available on a day: a full day, less a hotel change; today only what's
 * left of it; nothing for days already over.
 */
export function dayCapacity({
  day,
  today,
  nowMinutes,
  hotelChange,
}: {
  day: string;
  today: string | null;
  nowMinutes: number | null;
  hotelChange: boolean;
}): { capacityMinutes: number; available: boolean } {
  if (today !== null && day < today) return { capacityMinutes: 0, available: false };
  let capacity = OVERLOADED_MIN - (hotelChange ? HOTEL_CHANGE_MIN : 0);
  if (today !== null && day === today && nowMinutes !== null) {
    capacity = Math.min(capacity, Math.max(0, LATE_END_MIN - Math.max(nowMinutes, DEFAULT_DAY_START_MIN)));
  }
  return { capacityMinutes: capacity, available: capacity > 0 };
}

export type Why =
  | { kind: 'near'; otherId: string; minutes: number }
  | { kind: 'nearStay'; minutes: number }
  | { kind: 'openThatDay'; closedDays: number }
  | { kind: 'closedOn'; day: string }
  | { kind: 'overloaded'; day: string; minutes: number }
  | { kind: 'savesTravel'; minutes: number }
  | { kind: 'lightest' }
  | { kind: 'room'; freeMinutes: number }
  | { kind: 'overBy'; minutes: number }
  | { kind: 'youAsked' };

export type ChangeCause = 'wishlist' | 'closed' | 'overloaded' | 'area' | 'alternative' | 'request';

export interface TripChange {
  /** Stable key for the user's choice. */
  key: string;
  /** Wishlist place (adds a visit) or an existing visit (moves it). */
  kind: 'add' | 'move';
  itemId: string;
  fromDay: string | null;
  toDay: string;
  cause: ChangeCause;
  why: Why[];
  /** On unless it's only a convenience for a visit the user placed, or makes a day too long. */
  defaultOn: boolean;
}

export type Unplaced =
  | { id: string; reason: 'closedAllDays' }
  | { id: string; reason: 'noRoom' }
  | { id: string; reason: 'noDays' };

export type DayStatus = 'past' | 'overloaded' | 'inefficient' | 'unused' | 'ok';

export interface DayReport {
  day: string;
  loadMinutes: number;
  capacityMinutes: number;
  visits: number;
  status: DayStatus;
  /** Travel a better order would save (use Plan this day), when inefficient. */
  orderSaves: number;
}

export interface TripPlan {
  changes: TripChange[];
  unplaced: Unplaced[];
  before: DayReport[];
  /** Visits that stay overloaded days can't shed (starred, timed, or no room elsewhere). */
  stillOverloaded: string[];
  /** Flexible visits closed on their day with no other open day that has room. */
  closedNoDay: string[];
  missing: { hoursNotChecked: number; hoursUnknown: number; locationUnknown: number };
  /** Requested moves that found no open day with room. */
  requestsUnmet: string[];
}

// ---------------------------------------------------------------------------
// Building blocks (estimates only)
// ---------------------------------------------------------------------------

const movable = (stop: PlanStop) => !stop.startTime && !stop.visited && !stop.pinned && !stop.priority && !stop.keepDay;

/** Visits + travel still ahead on a day (done visits don't count against what's left). */
export function dayLoad(stops: readonly PlanStop[], start: LatLng | null): number {
  const ahead = stops.filter((stop) => !stop.visited);
  if (ahead.length === 0) return 0;
  const check = checkDay(ahead, start);
  return check.visitMinutes + check.travelMinutes;
}

/** Travel around a day as a loop from and back to the stay (or just between stops when it's unknown). */
function tourMinutes(stops: readonly PlanStop[], start: LatLng | null): number {
  let total = 0;
  let previous: LatLng | null = start;
  stops.forEach((stop, index) => {
    if (index > 0 || start) total += leg(previous, stop.location).minutes;
    previous = stop.location;
  });
  if (start && stops.length > 0) total += leg(previous, start).minutes;
  return total;
}

/** Extra travel to fit a place into a day at its cheapest spot. */
function insertionMinutes(stops: readonly PlanStop[], start: LatLng | null, stop: PlanStop): number {
  const base = tourMinutes(stops, start);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= stops.length; index += 1) {
    const trial = [...stops.slice(0, index), stop, ...stops.slice(index)];
    best = Math.min(best, tourMinutes(trial, start) - base);
  }
  return best;
}

const balance = (load: number, capacity: number) =>
  capacity > 0 ? BALANCE_WEIGHT_MIN * (load / capacity) ** 2 : Number.POSITIVE_INFINITY;

/** Extra cost of a place far from everything else on a (non-empty) day. */
function areaPenalty(stops: readonly PlanStop[], stop: PlanStop): number {
  const located = stops.filter((other) => other.id !== stop.id && other.location);
  if (!stop.location || located.length === 0) return 0;
  const nearest = Math.min(...located.map((other) => leg(stop.location, other.location).minutes));
  return AREA_WEIGHT * Math.max(0, nearest - NEAR_MIN);
}

/** Is it open long enough that day (unknown hours count as open)? */
function openOn(input: TripPlanInput, stop: PlanStop, day: string): boolean {
  const windows = input.windowsOn(stop.id, day);
  if (windows === undefined || windows === null) return true;
  return firstFit(windows, EARLIEST_START_MIN, stop.durationMinutes) !== null;
}

type Plan = Map<string, PlanStop[]>;

interface Target {
  day: string;
  cost: number;
  loadAfter: number;
  fits: boolean;
}

/** Every open, available day other than `except`, by cost: extra travel plus how much fuller the day gets. */
function targets(input: TripPlanInput, plan: Plan, stop: PlanStop, except: string | null): Target[] {
  return input.days
    .filter((day) => day.available && day.day !== except && openOn(input, stop, day.day))
    .map((day) => {
      const stops = plan.get(day.day) ?? [];
      const loadBefore = dayLoad(stops, day.start);
      const loadAfter = dayLoad([...stops, stop], day.start);
      const cost =
        insertionMinutes(stops, day.start, stop) +
        areaPenalty(stops, stop) +
        balance(loadAfter, day.capacityMinutes) -
        balance(loadBefore, day.capacityMinutes);
      return { day: day.day, cost, loadAfter, fits: loadAfter <= day.capacityMinutes };
    })
    .sort((a, b) => a.cost - b.cost || a.day.localeCompare(b.day));
}

/** Travel saved (and balance gained) by taking a stop off its day. */
function removalGain(input: TripPlanInput, plan: Plan, stop: PlanStop, day: string): number {
  const info = input.days.find((item) => item.day === day) as TripPlanDay;
  const stops = plan.get(day) ?? [];
  const without = stops.filter((item) => item.id !== stop.id);
  return (
    tourMinutes(stops, info.start) -
    tourMinutes(without, info.start) +
    areaPenalty(without, stop) +
    balance(dayLoad(stops, info.start), info.capacityMinutes) -
    balance(dayLoad(without, info.start), info.capacityMinutes)
  );
}

function moveIn(plan: Plan, stop: PlanStop, from: string | null, to: string) {
  if (from) plan.set(from, (plan.get(from) ?? []).filter((item) => item.id !== stop.id));
  plan.set(to, [...(plan.get(to) ?? []), stop]);
}

/** Where a place adds the least travel in a day's route (never before visits already done). */
export function bestPosition(stops: readonly PlanStop[], start: LatLng | null, stop: PlanStop): number {
  const base = tourMinutes(stops, start);
  let first = 0;
  while (first < stops.length && (stops[first]?.visited || stops[first]?.pinned)) first += 1;
  let best = { index: stops.length, cost: Number.POSITIVE_INFINITY };
  for (let index = first; index <= stops.length; index += 1) {
    const cost = tourMinutes([...stops.slice(0, index), stop, ...stops.slice(index)], start) - base;
    if (cost < best.cost - 0.01) best = { index, cost };
  }
  return best.index;
}

function insertIn(plan: Plan, stop: PlanStop, to: string, start: LatLng | null) {
  const stops = plan.get(to) ?? [];
  const index = bestPosition(stops, start, stop);
  plan.set(to, [...stops.slice(0, index), stop, ...stops.slice(index)]);
}

export type DayFit = 'fits' | 'full' | 'closed' | 'past';

/** One day, judged for one place (the assistant: "which day is best?"). */
export interface DayOption {
  day: string;
  fit: DayFit;
  /** The cheapest day that fits. */
  best: boolean;
  loadBefore: number;
  loadAfter: number;
  capacityMinutes: number;
  /** Extra travel (estimate) at its best spot in the day's route. */
  extraTravel: number;
  /** The closest visit already planned that day (estimate). */
  nearest: { id: string; minutes: number; mode: TravelMode | null } | null;
  /** Estimated travel from that night's stay. */
  stayMinutes: number | null;
  hours: 'open' | 'closed' | 'unknown' | 'notChecked';
  /** Position in the day's route (0 = first) and the visit it would follow. */
  position: number;
  afterId: string | null;
}

/**
 * Every trip day for one place not yet on the plan: does it fit, how much
 * travel it adds, what's near, and which day is best. Pure; estimates only.
 */
export function compareDays(input: TripPlanInput, stop: PlanStop): DayOption[] {
  const plan: Plan = new Map(input.days.map((day) => [day.day, [...day.stops]]));
  const costs = new Map(targets(input, plan, stop, null).map((target) => [target.day, target]));
  const options = input.days.map((day): DayOption => {
    const stops = plan.get(day.day) ?? [];
    const windows = input.windowsOn(stop.id, day.day);
    const hours = windows === undefined ? 'notChecked' : windows === null ? 'unknown' : openOn(input, stop, day.day) ? 'open' : 'closed';
    const target = costs.get(day.day);
    const loadBefore = dayLoad(stops, day.start);
    const loadAfter = dayLoad([...stops, stop], day.start);
    const fit: DayFit = !day.available ? 'past' : hours === 'closed' ? 'closed' : target?.fits ? 'fits' : 'full';
    const nearest = stop.location
      ? (stops
        .flatMap((other) => {
          const trip = other.location ? leg(stop.location, other.location) : null;
          return trip?.known ? [{ id: other.id, minutes: trip.minutes, mode: trip.mode }] : [];
        })
        .sort((a, b) => a.minutes - b.minutes)[0] ?? null)
      : null;
    const fromStay = stop.location && day.start ? leg(day.start, stop.location) : null;
    const position = bestPosition(stops, day.start, stop);
    return {
      day: day.day,
      fit,
      best: false,
      loadBefore,
      loadAfter,
      capacityMinutes: day.capacityMinutes,
      extraTravel: Math.round(insertionMinutes(stops, day.start, stop)),
      nearest,
      stayMinutes: fromStay?.known ? fromStay.minutes : null,
      hours,
      position,
      afterId: position > 0 ? (stops[position - 1]?.id ?? null) : null,
    };
  });
  const best = options
    .filter((option) => option.fit === 'fits')
    .sort((a, b) => (costs.get(a.day)?.cost ?? 0) - (costs.get(b.day)?.cost ?? 0) || a.day.localeCompare(b.day))[0];
  return options.map((option) => (option === best ? { ...option, best: true } : option));
}

function report(input: TripPlanInput, plan: Plan): DayReport[] {
  return input.days.map((day) => {
    const stops = plan.get(day.day) ?? [];
    const loadMinutes = dayLoad(stops, day.start);
    let status: DayStatus = 'ok';
    let orderSaves = 0;
    if (!day.available) status = 'past';
    else if (loadMinutes > day.capacityMinutes) status = 'overloaded';
    else {
      const better = smartOrder(stops.filter((stop) => !stop.visited), day.start);
      if (better && better.saved >= INEFFICIENT_MIN) {
        status = 'inefficient';
        orderSaves = better.saved;
      } else if (loadMinutes < UNUSED_SHARE * day.capacityMinutes) status = 'unused';
    }
    return { day: day.day, loadMinutes, capacityMinutes: day.capacityMinutes, visits: stops.length, status, orderSaves };
  });
}

/** Why a place is best on this day, most telling first (at most two). */
function reasonsFor(input: TripPlanInput, plan: Plan, stop: PlanStop, day: string): Why[] {
  const info = input.days.find((item) => item.day === day) as TripPlanDay;
  const why: Why[] = [];
  const available = input.days.filter((item) => item.available);
  const closedDays = available.filter((item) => !openOn(input, stop, item.day)).length;
  if (closedDays > 0) why.push({ kind: 'openThatDay', closedDays });
  if (stop.location) {
    const nearest = (plan.get(day) ?? [])
      .filter((other) => other.id !== stop.id && other.location)
      .map((other) => ({ other, minutes: leg(stop.location, other.location).minutes }))
      .sort((a, b) => a.minutes - b.minutes)[0];
    if (nearest && nearest.minutes <= NEAR_MIN) why.push({ kind: 'near', otherId: nearest.other.id, minutes: nearest.minutes });
    else if (info.start) {
      const minutes = leg(info.start, stop.location).minutes;
      if (minutes <= NEAR_MIN) why.push({ kind: 'nearStay', minutes });
    }
  }
  if (why.length < 2) {
    const without = (id: string) => dayLoad((plan.get(id) ?? []).filter((item) => item.id !== stop.id), input.days.find((d) => d.day === id)?.start ?? null);
    const lightest = available
      .filter((item) => openOn(input, stop, item.day))
      .sort((a, b) => without(a.day) - without(b.day))[0];
    if (lightest?.day === day && available.length > 1) why.push({ kind: 'lightest' });
    else why.push({ kind: 'room', freeMinutes: Math.max(0, info.capacityMinutes - dayLoad(plan.get(day) ?? [], info.start)) });
  }
  return why.slice(0, 2);
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export function planTrip(input: TripPlanInput): TripPlan {
  const plan: Plan = new Map(input.days.map((day) => [day.day, [...day.stops]]));
  const before = report(input, plan);
  const changes: TripChange[] = [];
  const unplaced: Unplaced[] = [];
  const closedNoDay: string[] = [];
  const stillOverloaded: string[] = [];
  const dayOf = (day: string) => input.days.find((item) => item.day === day) as TripPlanDay;
  const fixed = new Set<string>();
  const requestsUnmet: string[] = [];

  // 0. Moves the user asked for: the day they named, else the best open day with room (else the least overfilled).
  for (const request of input.moveRequests ?? []) {
    const from = input.days.find((day) => day.stops.some((stop) => stop.id === request.stopId));
    const stop = from?.stops.find((item) => item.id === request.stopId);
    if (!from || !stop || stop.visited) {
      requestsUnmet.push(request.stopId);
      continue;
    }
    const options = targets(input, plan, stop, from.day);
    const target = request.toDay
      ? (dayOf(request.toDay)?.available && request.toDay !== from.day ? request.toDay : null)
      : (options.find((item) => item.fits) ?? options.sort((a, b) => a.loadAfter - b.loadAfter)[0])?.day;
    if (!target) {
      requestsUnmet.push(request.stopId);
      continue;
    }
    moveIn(plan, stop, from.day, target);
    fixed.add(stop.id);
    changes.push({
      key: `move:${stop.id}`,
      kind: 'move',
      itemId: stop.id,
      fromDay: from.day,
      toDay: target,
      cause: 'request',
      why: ([{ kind: 'youAsked' }, ...reasonsFor(input, plan, stop, target)] as Why[]).slice(0, 2),
      defaultOn: true,
    });
  }

  // 0b. Places the user asked to add: the day they named if it has room (or they accepted it full), else the best day with room.
  const requestedAdds = new Set<string>();
  for (const request of input.addRequests ?? []) {
    const stop = input.wishlist.find((item) => item.id === request.stopId);
    if (!stop) continue;
    requestedAdds.add(stop.id);
    const options = targets(input, plan, stop, null);
    const named = request.toDay ? options.find((item) => item.day === request.toDay) : undefined;
    const target = request.toDay ? (named && (named.fits || request.allowOver) ? named : undefined) : options.find((item) => item.fits);
    if (!target) {
      requestsUnmet.push(stop.id);
      continue;
    }
    const why = target.fits
      ? reasonsFor(input, plan, stop, target.day)
      : [{ kind: 'overBy', minutes: Math.max(0, Math.round(target.loadAfter - dayOf(target.day).capacityMinutes)) } as Why];
    insertIn(plan, stop, target.day, dayOf(target.day).start);
    fixed.add(stop.id);
    changes.push({
      key: `add:${stop.id}`,
      kind: 'add',
      itemId: stop.id,
      fromDay: null,
      toDay: target.day,
      cause: 'request',
      why: (request.toDay ? ([{ kind: 'youAsked' }, ...why] as Why[]) : why).slice(0, 2),
      defaultOn: true,
    });
  }

  // 1. Flexible visits closed on their day: an open day with room.
  for (const day of input.days.filter((item) => item.available)) {
    for (const stop of day.stops.filter((item) => movable(item) && !fixed.has(item.id))) {
      const windows = input.windowsOn(stop.id, day.day);
      if (!windows || firstFit(windows, 0, stop.durationMinutes) !== null) continue;
      const target = targets(input, plan, stop, day.day).find((item) => item.fits);
      if (!target) {
        closedNoDay.push(stop.id);
        continue;
      }
      moveIn(plan, stop, day.day, target.day);
      fixed.add(stop.id);
      changes.push({
        key: `move:${stop.id}`,
        kind: 'move',
        itemId: stop.id,
        fromDay: day.day,
        toDay: target.day,
        cause: 'closed',
        why: [{ kind: 'closedOn', day: day.day }],
        defaultOn: true,
      });
    }
  }

  // 2. Overloaded days: move the flexible visit that costs least to take elsewhere.
  for (const day of input.days.filter((item) => item.available)) {
    const loadBefore = dayLoad(plan.get(day.day) ?? [], day.start);
    let guard = 0;
    while (dayLoad(plan.get(day.day) ?? [], day.start) > day.capacityMinutes && guard < 20) {
      guard += 1;
      const options = (plan.get(day.day) ?? [])
        .filter((stop) => movable(stop) && !fixed.has(stop.id))
        .flatMap((stop) => {
          const target = targets(input, plan, stop, day.day).find((item) => item.fits);
          return target ? [{ stop, target, net: target.cost - removalGain(input, plan, stop, day.day) }] : [];
        })
        .sort((a, b) => a.net - b.net);
      const pick = options[0];
      if (!pick) {
        stillOverloaded.push(day.day);
        break;
      }
      moveIn(plan, pick.stop, day.day, pick.target.day);
      fixed.add(pick.stop.id);
      changes.push({
        key: `move:${pick.stop.id}`,
        kind: 'move',
        itemId: pick.stop.id,
        fromDay: day.day,
        toDay: pick.target.day,
        cause: 'overloaded',
        why: [day.limitedByRequest ? ({ kind: 'youAsked' } as Why) : { kind: 'overloaded', day: day.day, minutes: loadBefore }],
        defaultOn: true,
      });
    }
  }

  // 3. Wishlist: most constrained first (open on fewest days), then longest.
  const availableDays = input.days.filter((day) => day.available);
  const openDays = (stop: PlanStop) => availableDays.filter((day) => openOn(input, stop, day.day)).length;
  const queue = input.wishlist
    .filter((stop) => !requestedAdds.has(stop.id))
    .sort((a, b) => openDays(a) - openDays(b) || b.durationMinutes - a.durationMinutes || a.id.localeCompare(b.id));
  const placed = new Map<string, string>();
  for (const stop of queue) {
    if (availableDays.length === 0) {
      unplaced.push({ id: stop.id, reason: 'noDays' });
      continue;
    }
    if (openDays(stop) === 0) {
      unplaced.push({ id: stop.id, reason: 'closedAllDays' });
      continue;
    }
    const target = targets(input, plan, stop, null).find((item) => item.fits);
    if (!target) {
      unplaced.push({ id: stop.id, reason: 'noRoom' });
      continue;
    }
    moveIn(plan, stop, null, target.day);
    placed.set(stop.id, target.day);
  }

  // 4. Second thoughts: move a newly placed place where it fits better now that every day is filled.
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;
    for (const stop of queue.filter((item) => placed.has(item.id))) {
      const from = placed.get(stop.id) as string;
      const gain = removalGain(input, plan, stop, from);
      const target = targets(input, plan, stop, from).find((item) => item.fits);
      if (target && target.cost < gain - 1) {
        moveIn(plan, stop, from, target.day);
        placed.set(stop.id, target.day);
        improved = true;
      }
    }
    if (!improved) break;
  }
  for (const stop of queue.filter((item) => placed.has(item.id))) {
    const day = placed.get(stop.id) as string;
    changes.push({
      key: `add:${stop.id}`,
      kind: 'add',
      itemId: stop.id,
      fromDay: null,
      toDay: day,
      cause: 'wishlist',
      why: reasonsFor(input, plan, stop, day),
      defaultOn: true,
    });
  }

  // 5. A place with no room anywhere: the open day it would overfill least (off until chosen).
  for (const item of unplaced) {
    if (item.reason !== 'noRoom') continue;
    const stop = input.wishlist.find((place) => place.id === item.id) as PlanStop;
    const option = targets(input, plan, stop, null)
      .map((target) => ({ ...target, overBy: target.loadAfter - dayOf(target.day).capacityMinutes }))
      .sort((a, b) => a.overBy - b.overBy || a.cost - b.cost)[0];
    if (!option) continue;
    changes.push({
      key: `alt:${stop.id}`,
      kind: 'add',
      itemId: stop.id,
      fromDay: null,
      toDay: option.day,
      cause: 'alternative',
      why: [{ kind: 'overBy', minutes: Math.max(0, Math.round(option.overBy)) }],
      defaultOn: false,
    });
  }

  // 6. Visits the user placed far from the rest of their day: a day in that area (off until chosen).
  for (let count = 0; count < MAX_AREA_MOVES; count += 1) {
    const best = availableDays
      .flatMap((day) =>
        (plan.get(day.day) ?? [])
          .filter((stop) => movable(stop) && !fixed.has(stop.id) && !placed.has(stop.id) && stop.location)
          .flatMap((stop) => {
            const gain = tourMinutes(plan.get(day.day) ?? [], day.start) - tourMinutes((plan.get(day.day) ?? []).filter((item) => item.id !== stop.id), day.start);
            const target = targets(input, plan, stop, day.day).find((item) => item.fits);
            if (!target) return [];
            const toDay = dayOf(target.day);
            const saved = gain - insertionMinutes(plan.get(target.day) ?? [], toDay.start, stop);
            return saved >= AREA_MIN_SAVING ? [{ stop, from: day.day, to: target.day, saved }] : [];
          }),
      )
      .sort((a, b) => b.saved - a.saved)[0];
    if (!best) break;
    moveIn(plan, best.stop, best.from, best.to);
    fixed.add(best.stop.id);
    const near = reasonsFor(input, plan, best.stop, best.to).filter((why) => why.kind === 'near' || why.kind === 'nearStay');
    changes.push({
      key: `area:${best.stop.id}`,
      kind: 'move',
      itemId: best.stop.id,
      fromDay: best.from,
      toDay: best.to,
      cause: 'area',
      why: ([{ kind: 'savesTravel', minutes: Math.round(best.saved) }, ...near] as Why[]).slice(0, 2),
      defaultOn: false,
    });
  }

  // What wasn't known, for the limitations line.
  const open = [...input.days.filter((day) => day.available).flatMap((day) => day.stops.filter((stop) => !stop.visited)), ...input.wishlist];
  // Opening hours are fetched for every day at once, so any one day tells whether a place has them.
  const someDay = availableDays[0]?.day ?? input.days[0]?.day ?? '';
  return {
    changes,
    unplaced,
    requestsUnmet,
    before,
    stillOverloaded,
    closedNoDay,
    missing: {
      hoursNotChecked: open.filter((stop) => input.windowsOn(stop.id, someDay) === undefined).length,
      hoursUnknown: open.filter((stop) => input.windowsOn(stop.id, someDay) === null).length,
      locationUnknown: open.filter((stop) => stop.location === null).length,
    },
  };
}

/**
 * The trip as it would be with the chosen changes: each day's visits (new
 * ones at the end, for Plan this day to order and time) and its report.
 */
export function tripAfter(
  input: TripPlanInput,
  changes: readonly TripChange[],
): { days: Map<string, PlanStop[]>; reports: DayReport[] } {
  const plan: Plan = new Map(input.days.map((day) => [day.day, [...day.stops]]));
  const byId = new Map<string, PlanStop>([
    ...input.wishlist.map((stop) => [stop.id, stop] as const),
    ...input.days.flatMap((day) => day.stops.map((stop) => [stop.id, stop] as const)),
  ]);
  const done = new Set<string>();
  const requested = new Set((input.addRequests ?? []).map((request) => request.stopId));
  for (const change of changes) {
    const stop = byId.get(change.itemId);
    if (!stop || done.has(change.itemId)) continue;
    done.add(change.itemId);
    // A place the user asked for goes where it adds the least travel; others go last (Plan this day orders them).
    if (change.kind === 'add' && requested.has(change.itemId)) {
      insertIn(plan, stop, change.toDay, input.days.find((day) => day.day === change.toDay)?.start ?? null);
    } else {
      moveIn(plan, stop, change.fromDay, change.toDay);
    }
  }
  return { days: plan, reports: report(input, plan) };
}
