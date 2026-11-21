import type { LatLng } from '@travel-companion/shared';
import { checkDay, DEFAULT_DAY_START_MIN, projectDay, type DayCheck, type DayWarning, type Leg, type PlanStop } from './day-planner';
import { applySuggestions, planDay, type PlanProblem, type RetimeSuggestion, type SmartOrder } from './smart-plan';
import { tripAfter, type DayStatus, type TripChange, type TripPlan, type TripPlanInput } from './trip-plan';

/**
 * D1 complete trip plan: trip-plan.ts decides the day of every place, then
 * smart-plan.ts orders and times each day as it would be. One proposal, one
 * preview, one Apply. Pure; nothing here changes the trip.
 *
 * Every suggestion has a key and a default; the user's choices override the
 * default (`choice[key]`). Turning off a day change re-plans the days it
 * touched, so the preview always matches what Apply would do.
 */

export type Choice = Readonly<Record<string, boolean>>;

export const orderKey = (day: string) => `order:${day}`;
export const timesKey = (day: string) => `times:${day}`;
export const retimeKey = (stopId: string) => `retime:${stopId}`;

export const isOn = (choice: Choice, key: string, defaultOn: boolean) => choice[key] ?? defaultOn;

/** Where a time in the preview comes from. */
export type TimeSource = 'yours' | 'retimed' | 'suggested' | 'approx';
/** Opening hours: checked with Google, known to be missing, or not checked yet. */
export type HoursSource = 'checked' | 'unknown' | 'notChecked';

export interface PlannedVisit {
  id: string;
  start: number;
  end: number;
  durationMinutes: number;
  /** The length is the category's typical one (an estimate), not the user's. */
  typicalDuration: boolean;
  time: TimeSource;
  hours: HoursSource;
  /** Travel from the stay or the previous visit (always an estimate). */
  travel: Leg | null;
  /** Comes to this day with the plan. */
  arriving: 'new' | 'moved' | null;
  done: boolean;
  starred: boolean;
}

export interface DayDraft {
  day: string;
  available: boolean;
  start: LatLng | null;
  visits: PlannedVisit[];
  check: DayCheck;
  capacityMinutes: number;
  status: DayStatus;
  /** The day's own suggestions (none for days already over). */
  order: SmartOrder | null;
  orderOn: boolean;
  /** Flexible visits that would get a time. */
  timesCount: number;
  timesOn: boolean;
  retimes: RetimeSuggestion[];
  warnings: DayWarning[];
  problems: PlanProblem[];
}

/** What Apply sends, in this order: new visits, moves, times, then each day's order. */
export interface ApplyPlan {
  adds: { tripPlaceId: string; day: string; startTime: string | null }[];
  moves: { stopId: string; day: string }[];
  times: { stopId: string; startTime: string }[];
  /** Ids in order; a new visit appears under its saved-place id. */
  orders: { day: string; ids: string[] }[];
}

export interface CompletePlan {
  days: DayDraft[];
  chosen: TripChange[];
  apply: ApplyPlan;
  /** Changes Apply makes (each new visit, move, time and day order). */
  count: number;
}

export function completePlan(input: TripPlanInput, trip: TripPlan, choice: Choice): CompletePlan {
  const chosen = trip.changes.filter((change) => isOn(choice, change.key, change.defaultOn));
  const after = tripAfter(input, chosen);
  const arriving = new Map(chosen.map((change) => [change.itemId, change]));
  const apply: ApplyPlan = { adds: [], moves: [], times: [], orders: [] };
  const added = new Set(chosen.filter((change) => change.kind === 'add').map((change) => change.itemId));

  const days = input.days.map((day, index): DayDraft => {
    const dayStart = day.dayStart ?? DEFAULT_DAY_START_MIN;
    const stops = (after.days.get(day.day) ?? []).map((stop) => ({ ...stop, hours: input.windowsOn(stop.id, day.day) }));
    const report = after.reports[index];
    const hoursOf = (id: string): HoursSource => {
      const windows = input.windowsOn(id, day.day);
      return windows === undefined ? 'notChecked' : windows === null ? 'unknown' : 'checked';
    };
    const visitOf = (stop: PlanStop, entry: ReturnType<typeof projectDay>[number], time: TimeSource): PlannedVisit => {
      const change = arriving.get(stop.id);
      return {
        id: stop.id,
        start: entry.start,
        end: entry.end,
        durationMinutes: stop.durationMinutes,
        typicalDuration: stop.typicalDuration ?? false,
        time,
        hours: hoursOf(stop.id),
        travel: entry.travel,
        arriving: change && change.toDay === day.day ? (change.kind === 'add' ? 'new' : 'moved') : null,
        done: stop.visited,
        starred: stop.priority ?? false,
      };
    };

    if (!day.available) {
      const check = checkDay(stops, day.start, dayStart);
      const timeline = projectDay(stops, day.start, dayStart);
      return {
        day: day.day,
        available: false,
        start: day.start,
        visits: stops.map((stop, i) => visitOf(stop, timeline[i] as (typeof timeline)[number], stop.startTime ? 'yours' : 'approx')),
        check,
        capacityMinutes: 0,
        status: 'past',
        order: null,
        orderOn: false,
        timesCount: 0,
        timesOn: false,
        retimes: [],
        warnings: [],
        problems: [],
      };
    }

    // The day planner on the day as the trip plan leaves it: other days were already handled.
    const smart = planDay({ day: day.day, stops, start: day.start, otherDays: [], windowsOn: input.windowsOn });
    const orderOn = smart.order !== null && isOn(choice, orderKey(day.day), true);
    const retimes = smart.retimes.filter((item) => isOn(choice, retimeKey(item.stopId), false));
    const draft = applySuggestions(
      stops,
      day.start,
      { order: orderOn ? (smart.order?.order ?? null) : null, moves: [], retimes },
      undefined,
      dayStart,
    );
    // Happening now: it keeps what it has (no time is set on it).
    for (const stop of stops) if (stop.pinned) draft.times.delete(stop.id);
    const timesOn = draft.times.size > 0 && isOn(choice, timesKey(day.day), true);
    const final = draft.stops.map((stop) =>
      timesOn && draft.times.has(stop.id) ? { ...stop, startTime: draft.times.get(stop.id) as string } : stop,
    );
    const timeline = projectDay(final, day.start, dayStart);
    const retimed = new Set(retimes.map((item) => item.stopId));
    const visits = final.map((stop, i) => {
      const own = stops.find((item) => item.id === stop.id)?.startTime ?? null;
      const time: TimeSource = retimed.has(stop.id)
        ? 'retimed'
        : own
          ? 'yours'
          : timesOn && draft.times.has(stop.id)
            ? 'suggested'
            : 'approx';
      return visitOf(stop, timeline[i] as (typeof timeline)[number], time);
    });
    const check = checkDay(final, day.start, dayStart);

    // What Apply does for this day.
    for (const stop of final) {
      const time = (timesOn ? draft.times.get(stop.id) : undefined) ?? (retimed.has(stop.id) ? stop.startTime : undefined);
      if (added.has(stop.id)) {
        apply.adds.push({ tripPlaceId: stop.id, day: day.day, startTime: timesOn ? (draft.times.get(stop.id) ?? null) : null });
        continue;
      }
      const change = arriving.get(stop.id);
      if (change && change.kind === 'move' && change.toDay === day.day) apply.moves.push({ stopId: stop.id, day: day.day });
      if (time) apply.times.push({ stopId: stop.id, startTime: time });
    }
    if (orderOn) apply.orders.push({ day: day.day, ids: final.map((stop) => stop.id) });

    const load = check.visitMinutes + check.travelMinutes;
    const status: DayStatus =
      load > day.capacityMinutes
        ? 'overloaded'
        : report?.status === 'inefficient' && orderOn
          ? 'ok'
          : (report?.status ?? 'ok');
    return {
      day: day.day,
      available: true,
      start: day.start,
      visits,
      check,
      capacityMinutes: day.capacityMinutes,
      status,
      order: smart.order,
      orderOn,
      timesCount: draft.times.size,
      timesOn,
      retimes: smart.retimes,
      // Counted once for the whole trip instead.
      warnings: check.warnings.filter((warning) => warning.kind !== 'overloaded'),
      problems: smart.problems.filter((problem) => problem.kind !== 'hoursUnknown' && problem.kind !== 'locationUnknown'),
    };
  });

  const count = apply.adds.length + apply.moves.length + apply.times.length + apply.orders.length;
  return { days, chosen, apply, count };
}

