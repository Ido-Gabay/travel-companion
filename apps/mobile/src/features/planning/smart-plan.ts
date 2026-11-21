import type { LatLng } from '@travel-companion/shared';
import {
  checkDay,
  DEFAULT_DAY_START_MIN,
  MIN_SAVING_MIN,
  optimizeOrder,
  OVERLOADED_MIN,
  suggestTimes,
  toMinutes,
  toTime,
  type DayCheck,
  type PlanStop,
  type RouteFn,
} from './day-planner';
import { firstFit, hoursIssue, type OpenWindow } from './opening-hours';

/**
 * D1 smart day planning, on top of the M13 planner (pure, free, deterministic).
 * It proposes; it never changes anything. Each suggestion carries the reason
 * the screen shows, and the user accepts or rejects each one.
 *
 * Constraints it never breaks on its own:
 *  - a visit with a time the user set keeps its place in the order (changing
 *    that time is only ever a separate, opt-in suggestion);
 *  - done, skipped and happening-now visits don't move;
 *  - a starred visit (priority) is never suggested for another day;
 *  - nothing is removed: a visit that doesn't fit is suggested for another day.
 * Unknown data (no opening hours, no location) never blocks a plan: it just
 * isn't used, and the result says so.
 */

/** A problem counts as much as this many minutes of travel when comparing orders. */
const PROBLEM_WEIGHT_MIN = 120;
/** Earliest time a moved visit is assumed to start on another day. */
const OTHER_DAY_START_MIN = 8 * 60;

/** Problems and travel of an order (estimates only, like the M13 order check). */
export function scoreOrder(stops: readonly PlanStop[], start: LatLng | null) {
  const check = checkDay(stops, start);
  const problems = check.warnings.filter((warning) => warning.kind === 'hours' || warning.kind === 'tight').length;
  return { problems, travel: check.travelMinutes, cost: problems * PROBLEM_WEIGHT_MIN + check.travelMinutes };
}

export interface SmartOrder {
  order: string[];
  travelBefore: number;
  travelAfter: number;
  /** Travel saved (may be 0 or negative when the order fixes problems instead). */
  saved: number;
  /** Opening-hours and timing problems the new order avoids. */
  problemsFixed: number;
}

/**
 * The best order found: shortest travel AND fewest opening-hours / timing
 * problems. Starts from the current order and the M13 shortest order, then
 * moves single flexible visits while that helps. Only flexible visits move.
 */
export function smartOrder(stops: readonly PlanStop[], start: LatLng | null): SmartOrder | null {
  const movable = (stop: PlanStop) => !stop.startTime && !stop.visited && !stop.pinned && stop.location !== null;
  const free = stops.filter(movable);
  if (free.length === 0 || stops.length < 2) return null;

  const before = scoreOrder(stops, start);
  let best = [...stops];
  let bestScore = before;
  const geo = optimizeOrder(stops, start);
  if (geo) {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const candidate = geo.order.map((id) => byId.get(id) as PlanStop);
    const score = scoreOrder(candidate, start);
    if (score.cost < bestScore.cost) {
      best = candidate;
      bestScore = score;
    }
  }
  for (let pass = 0; pass < 8; pass += 1) {
    let improved = false;
    for (const stop of free) {
      const without = best.filter((item) => item !== stop);
      for (let index = 0; index <= without.length; index += 1) {
        const candidate = [...without.slice(0, index), stop, ...without.slice(index)];
        const score = scoreOrder(candidate, start);
        if (score.cost < bestScore.cost - 0.5) {
          best = candidate;
          bestScore = score;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const order = best.map((stop) => stop.id);
  if (order.every((id, index) => id === stops[index]?.id)) return null;
  const problemsFixed = before.problems - bestScore.problems;
  const saved = before.travel - bestScore.travel;
  if (problemsFixed <= 0 && saved < MIN_SAVING_MIN) return null;
  return { order, travelBefore: before.travel, travelAfter: bestScore.travel, saved, problemsFixed };
}

/** Another day of the same trip, for "move to another day" suggestions. */
export interface OtherDay {
  day: string;
  /** Visit time + estimated travel already planned that day. */
  loadMinutes: number;
}

export type MoveReason = 'closed' | 'overloaded';

export interface MoveSuggestion {
  stopId: string;
  toDay: string;
  reason: MoveReason;
}

/** A new time for a visit whose time the user set (opt-in only). */
export interface RetimeSuggestion {
  stopId: string;
  from: string;
  to: string;
  reason: 'opensAt' | 'closesAt';
}

export type PlanProblem =
  | { kind: 'closedNoOtherDay'; stopId: string }
  | { kind: 'stillOverloaded'; minutes: number }
  | { kind: 'timedClosed'; stopId: string }
  | { kind: 'hoursUnknown'; count: number }
  | { kind: 'locationUnknown'; count: number };

export interface SmartPlanInput {
  day: string;
  /** The day's visits in their current order (skipped ones left out). */
  stops: PlanStop[];
  start: LatLng | null;
  /** The trip's other days. */
  otherDays: OtherDay[];
  /**
   * Opening windows of a visit on any trip day: undefined = hours not checked,
   * null = unknown (no data), [] = closed all day.
   */
  windowsOn: (stopId: string, day: string) => OpenWindow[] | null | undefined;
  routeFor?: RouteFn;
}

export interface SmartPlan {
  before: DayCheck;
  order: SmartOrder | null;
  moves: MoveSuggestion[];
  retimes: RetimeSuggestion[];
  problems: PlanProblem[];
}

const flexible = (stop: PlanStop) => !stop.startTime && !stop.visited && !stop.pinned;

/** A day that can take this visit: room left, and open that day when hours are known. */
function bestOtherDay(
  stop: PlanStop,
  input: SmartPlanInput,
  extra: ReadonlyMap<string, number>,
  needOpen: boolean,
): string | null {
  const candidates = input.otherDays
    .map((other) => ({ ...other, load: other.loadMinutes + (extra.get(other.day) ?? 0) }))
    .filter((other) => other.load + stop.durationMinutes <= OVERLOADED_MIN)
    .filter((other) => {
      const windows = input.windowsOn(stop.id, other.day);
      if (windows === undefined || windows === null) return !needOpen;
      return firstFit(windows, OTHER_DAY_START_MIN, stop.durationMinutes) !== null;
    })
    .sort((a, b) => a.load - b.load || a.day.localeCompare(b.day));
  return candidates[0]?.day ?? null;
}

export function planDay(input: SmartPlanInput): SmartPlan {
  const { stops, start } = input;
  const before = checkDay(stops, start, DEFAULT_DAY_START_MIN, input.routeFor);
  const moves: MoveSuggestion[] = [];
  const retimes: RetimeSuggestion[] = [];
  const problems: PlanProblem[] = [];
  const extra = new Map<string, number>();
  const moved = new Set<string>();
  const suggestMove = (stop: PlanStop, toDay: string, reason: MoveReason) => {
    moves.push({ stopId: stop.id, toDay, reason });
    moved.add(stop.id);
    extra.set(toDay, (extra.get(toDay) ?? 0) + stop.durationMinutes);
  };

  // 1. Flexible visits that can't fit this day's opening hours at all: another day where they're open.
  for (const stop of stops.filter(flexible)) {
    const windows = input.windowsOn(stop.id, input.day);
    if (!windows || firstFit(windows, 0, stop.durationMinutes) !== null) continue;
    const toDay = stop.priority ? null : bestOtherDay(stop, input, extra, true);
    if (toDay) suggestMove(stop, toDay, 'closed');
    else problems.push({ kind: 'closedNoOtherDay', stopId: stop.id });
  }

  // 2. Better order for what stays (hours, timing and travel).
  const staying = stops.filter((stop) => !moved.has(stop.id));
  const order = smartOrder(staying, start);
  const ordered = order
    ? order.order.map((id) => staying.find((stop) => stop.id === id) as PlanStop)
    : staying;

  // 3. Still too much for one day: suggest the least important flexible visits for lighter days.
  const load = (list: readonly PlanStop[]) => {
    const check = checkDay(list, start);
    return check.visitMinutes + check.travelMinutes;
  };
  let remaining = [...ordered];
  while (load(remaining) > OVERLOADED_MIN) {
    const candidates = remaining
      .filter((stop) => flexible(stop) && !stop.priority)
      .map((stop) => ({ stop, after: load(remaining.filter((item) => item !== stop)) }))
      .sort((a, b) => a.after - b.after);
    const pick = candidates.find(({ stop }) => bestOtherDay(stop, input, extra, false) !== null);
    if (!pick) {
      problems.push({ kind: 'stillOverloaded', minutes: load(remaining) });
      break;
    }
    suggestMove(pick.stop, bestOtherDay(pick.stop, input, extra, false) as string, 'overloaded');
    remaining = remaining.filter((stop) => stop !== pick.stop);
  }

  // 4. Times the user set at a moment the place is closed: an opt-in new time.
  for (const stop of stops) {
    if (!stop.startTime || stop.visited || stop.pinned) continue;
    const windows = input.windowsOn(stop.id, input.day);
    if (!windows) continue;
    const begin = toMinutes(stop.startTime);
    const issue = hoursIssue(windows, begin, begin + stop.durationMinutes);
    if (!issue) continue;
    if (issue.kind === 'notOpenYet') {
      retimes.push({ stopId: stop.id, from: stop.startTime, to: toTime(issue.opensAt), reason: 'opensAt' });
    } else if (issue.kind === 'closesEarly' && issue.closesAt - stop.durationMinutes >= 0) {
      const to = Math.floor((issue.closesAt - stop.durationMinutes) / 5) * 5;
      if (firstFit(windows, to, stop.durationMinutes) === to) {
        retimes.push({ stopId: stop.id, from: stop.startTime, to: toTime(to), reason: 'closesAt' });
      } else {
        problems.push({ kind: 'timedClosed', stopId: stop.id });
      }
    } else {
      problems.push({ kind: 'timedClosed', stopId: stop.id });
    }
  }

  const open = stops.filter((stop) => !stop.visited);
  const hoursUnknown = open.filter((stop) => input.windowsOn(stop.id, input.day) === null).length;
  if (hoursUnknown > 0) problems.push({ kind: 'hoursUnknown', count: hoursUnknown });
  const noLocation = open.filter((stop) => stop.location === null).length;
  if (noLocation > 0) problems.push({ kind: 'locationUnknown', count: noLocation });

  return { before, order, moves, retimes, problems };
}

/**
 * The day as it would be with the chosen suggestions: visits moved away are
 * gone, the new order is used, chosen new times are set, and the remaining
 * flexible visits get times (travel + buffer, opening hours).
 */
export function applySuggestions(
  stops: readonly PlanStop[],
  start: LatLng | null,
  chosen: { order: string[] | null; moves: readonly MoveSuggestion[]; retimes: readonly RetimeSuggestion[] },
  routeFor?: RouteFn,
  dayStart = DEFAULT_DAY_START_MIN,
): { stops: PlanStop[]; times: Map<string, string>; check: DayCheck } {
  const away = new Set(chosen.moves.map((move) => move.stopId));
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const base = chosen.order
    ? [
        ...chosen.order.flatMap((id) => (byId.has(id) && !away.has(id) ? [byId.get(id) as PlanStop] : [])),
        // Anything the order didn't list keeps its relative place at the end.
        ...stops.filter((stop) => !away.has(stop.id) && !chosen.order?.includes(stop.id)),
      ]
    : stops.filter((stop) => !away.has(stop.id));
  const retime = new Map(chosen.retimes.map((item) => [item.stopId, item.to]));
  const next = base.map((stop) => (retime.has(stop.id) ? { ...stop, startTime: retime.get(stop.id) as string } : stop));
  const times = suggestTimes(next, start, dayStart, routeFor);
  const timed = next.map((stop) => (times.has(stop.id) ? { ...stop, startTime: times.get(stop.id) as string } : stop));
  return { stops: next, times, check: checkDay(timed, start, dayStart, routeFor) };
}

/** Rough load of another trip day (no Google lookups): visit time plus an average leg per visit. */
export function estimateDayLoad(durations: readonly number[]): number {
  const AVERAGE_LEG_MIN = 20;
  return durations.reduce((sum, minutes) => sum + minutes + AVERAGE_LEG_MIN, 0);
}

