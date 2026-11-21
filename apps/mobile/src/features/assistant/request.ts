import type { AssistantInstruction, LatLng, PlaceCategory } from '@travel-companion/shared';
import { LATE_END_MIN, toMinutes, toTime, type PlanStop } from '../planning/day-planner';
import { dayLoad, type TripPlanDay, type TripPlanInput } from '../planning/trip-plan';

/**
 * D1 trip assistant: the instructions (from the phone's rules or the AI)
 * turned into planner input. Nothing here plans or changes the trip: it only
 * shapes what trip-plan.ts / smart-plan.ts / complete-plan.ts propose, and
 * says what each instruction did. The user then accepts or rejects each
 * suggestion as before.
 */

/** A visit or wishlist place as the phone knows it (names stay on the phone). */
export interface AssistantItem {
  id: string;
  /** A visit (has a day) or a wishlist place. */
  visit: boolean;
  category: PlaceCategory;
  /** The name shown in the app (may be Google's; never sent to the AI). */
  name: string;
  day: string | null;
  done: boolean;
}

export type RequestNote =
  | { kind: 'lighten'; day: string; maxMinutes: number; already: boolean }
  | { kind: 'dayStart'; time: string; days: string[]; flexible: number; timed: number; shiftDays: number }
  | { kind: 'dayEnd'; time: string; days: string[] }
  | { kind: 'moreTime'; category: PlaceCategory; count: number }
  | { kind: 'keepFixed'; what: 'starred' | 'all'; count: number }
  | { kind: 'move'; id: string; toDay: string | null }
  | { kind: 'moveNotFound'; text: string }
  | { kind: 'findNearby'; category: PlaceCategory; query: string; day: string | null; near: 'dayEnd' | 'stay' }
  /** Running late: visits whose time has passed (the user can keep any of them as is). */
  | { kind: 'catchUp'; day: string; late: { id: string; from: string }[] }
  | { kind: 'catchUpNotToday' }
  /** A place to find; the search (and the pick) happen on screen, by tap. */
  | { kind: 'findPlace'; instruction: Extract<AssistantInstruction, { kind: 'findPlace' }> }
  /** Live: a visit proposed to be skipped (its own switch). */
  | { kind: 'skip'; id: string }
  /** Live: a planned place is closed: skip or keep it, or find an alternative near it. */
  | { kind: 'closed'; id: string; day: string; category: PlaceCategory; location: LatLng | null }
  /** Live: a visit is taking longer; it now ends around `until` (minutes). */
  | { kind: 'longer'; id: string; extra: number; until: number }
  /** Live changes only work on a trip day, for today. */
  | { kind: 'liveNotToday' };

/** The place the user picked from the search, as the planner sees it. */
export interface NewPlace {
  stop: PlanStop;
  /** The day the user wants (null = the best day with room). */
  toDay: string | null;
  /** The user chose a day that's already full. */
  allowOver: boolean;
}

export interface DurationChange {
  id: string;
  from: number;
  to: number;
}

/** "Start every day at 8" on a day whose visits all have times: move them all, keeping the gaps (off by default). */
export interface DayShift {
  day: string;
  /** Minutes (negative = earlier). */
  minutes: number;
  from: string;
  to: string;
  stops: { id: string; from: string; to: string }[];
}

export interface RequestEffect {
  input: TripPlanInput;
  durations: DurationChange[];
  notes: RequestNote[];
  /** One instruction names more than one visit: which one? */
  pick: { index: number; options: string[] } | null;
  /** Visits proposed to be skipped (each on its own switch, on by default). */
  skips: string[];
  /** Today is still too full after a live change: visits that could be shorter (off by default). */
  shorten: DurationChange[];
  /** Days whose timed visits could move to the requested start (off by default). */
  shifts: DayShift[];
}

export const durationKey = (id: string) => `duration:${id}`;
export const catchUpKey = (id: string) => `catchUp:${id}`;
export const skipKey = (id: string) => `skip:${id}`;
export const shortenKey = (id: string) => `shorten:${id}`;
export const shiftKey = (day: string) => `shift:${day}`;
/** "Staying longer" without an amount. */
export const DEFAULT_EXTRA_MIN = 30;
/** Shortening a long flexible visit by this much when today is too full. */
export const SHORTEN_MIN = 30;

const normalize = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^ה(?=[א-ת]{3,})/, ''))
    .filter((word) => word.length >= 3 && !['the', 'visit', 'place', 'trip', 'ביקור', 'מקום', 'את'].includes(word));

/** Visits whose name has the request's words (on the phone), else of the category named. */
function matchVisits(
  target: Extract<AssistantInstruction, { kind: 'moveVisit' }>['target'],
  items: readonly AssistantItem[],
  refs: ReadonlyMap<string, string>,
  movableDays: ReadonlySet<string>,
): AssistantItem[] {
  const candidates = items.filter((item) => item.visit && !item.done && item.day !== null && movableDays.has(item.day));
  if (target.ref) {
    const id = refs.get(target.ref);
    const found = candidates.filter((item) => item.id === id);
    if (found.length > 0) return found;
  }
  const onDay = target.day ? candidates.filter((item) => item.day === target.day) : candidates;
  const words = target.text ? normalize(target.text) : [];
  if (words.length > 0) {
    const byName = onDay.filter((item) => {
      const name = normalize(item.name).join(' ');
      return words.some((word) => name.includes(word));
    });
    if (byName.length > 0) return byName;
  }
  return target.category ? onDay.filter((item) => item.category === target.category) : [];
}

export function resolveRequest(
  instructions: readonly AssistantInstruction[],
  base: TripPlanInput,
  items: readonly AssistantItem[],
  options: {
    /** AI refs → item ids. */
    refs?: ReadonlyMap<string, string>;
    /** The user's answer to "which one?" per instruction index. */
    picks?: Readonly<Record<number, string>>;
    /** Whether each proposed duration change is on (default on). */
    durationOn?: (id: string) => boolean;
    /** Whether each late visit gets a new time (default on). */
    catchUpOn?: (id: string) => boolean;
    /** Whether each proposed skip is on (default on). */
    skipOn?: (id: string) => boolean;
    /** Whether each proposed shorter visit is on (default off). */
    shortenOn?: (id: string) => boolean;
    /** Whether a day's timed visits move to the requested start (default off). */
    shiftOn?: (day: string) => boolean;
    /** The trip's today and the time now there (catch-up only works on today). */
    today?: string | null;
    nowMinutes?: number | null;
    /** findPlace: the place the user picked, to plan in (only that place is proposed). */
    newPlace?: NewPlace | null;
  } = {},
): RequestEffect {
  const refs = options.refs ?? new Map<string, string>();
  const picks = options.picks ?? {};
  const durationOn = options.durationOn ?? (() => true);
  const catchUpOn = options.catchUpOn ?? (() => true);
  const skipOn = options.skipOn ?? (() => true);
  const shortenOn = options.shortenOn ?? (() => false);
  const shiftOn = options.shiftOn ?? (() => false);
  const shifts: DayShift[] = [];
  // Today, nothing can be suggested before a little after now.
  const nowFloor =
    options.today && options.nowMinutes !== null && options.nowMinutes !== undefined ? Math.ceil((options.nowMinutes + 15) / 5) * 5 : null;
  const skips: string[] = [];
  let live = false;
  const days: TripPlanDay[] = base.days.map((day) => ({ ...day, stops: day.stops.map((stop) => ({ ...stop })) }));
  let wishlist = base.wishlist.map((stop) => ({ ...stop }));
  const available = days.filter((day) => day.available);
  const movableDays = new Set(available.map((day) => day.day));
  const notes: RequestNote[] = [];
  const durations: DurationChange[] = [];
  const moveRequests: { stopId: string; toDay: string | null }[] = [];
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const limits = new Map<string, number>();
  let pick: RequestEffect['pick'] = null;
  const scope = (list: readonly string[]) => (list.length === 0 ? available : available.filter((day) => list.includes(day.day)));
  const categoryOf = new Map(items.map((item) => [item.id, item.category]));

  instructions.forEach((instruction, index) => {
    switch (instruction.kind) {
      case 'lighten': {
        const day = days.find((item) => item.day === instruction.day);
        if (!day?.available) return;
        const load = dayLoad(day.stops, day.start);
        // "Less busy" with no amount: about a third lighter, in half hours.
        const maxMinutes =
          instruction.maxHours !== null ? Math.round(instruction.maxHours * 60) : Math.floor((load * 0.7) / 30) * 30;
        limits.set(day.day, Math.min(limits.get(day.day) ?? Number.POSITIVE_INFINITY, maxMinutes));
        notes.push({ kind: 'lighten', day: day.day, maxMinutes, already: load <= maxMinutes });
        return;
      }
      case 'dayStart': {
        const begin = toMinutes(instruction.time);
        let flexible = 0;
        let timed = 0;
        let shiftDays = 0;
        for (const day of scope(instruction.days)) {
          starts.set(day.day, begin);
          const open = day.stops.filter((stop) => !stop.visited && !stop.pinned);
          flexible += open.filter((stop) => !stop.startTime).length;
          const withTime = open.filter((stop): stop is PlanStop & { startTime: string } => stop.startTime !== null);
          timed += withTime.length;
          // Only days where every open visit has a time; otherwise the new start already moves the flexible ones.
          if (withTime.length === 0 || withTime.length < open.length) continue;
          const first = Math.min(...withTime.map((stop) => toMinutes(stop.startTime)));
          const minutes = begin - first;
          const moved = withTime.map((stop) => ({ id: stop.id, from: stop.startTime, to: toTime(toMinutes(stop.startTime) + minutes) }));
          const floor = day.day === options.today ? nowFloor : null;
          const fits = withTime.every((stop) => {
            const at = toMinutes(stop.startTime) + minutes;
            return at >= (floor ?? 0) && at < 24 * 60;
          });
          if (minutes === 0 || !fits) continue;
          shiftDays += 1;
          shifts.push({ day: day.day, minutes, from: toTime(first), to: instruction.time, stops: moved });
          if (shiftOn(day.day)) {
            const to = new Map(moved.map((item) => [item.id, item.to]));
            day.stops = day.stops.map((stop) => (to.has(stop.id) ? { ...stop, startTime: to.get(stop.id) ?? stop.startTime } : stop));
          }
        }
        notes.push({ kind: 'dayStart', time: instruction.time, days: instruction.days, flexible, timed, shiftDays });
        return;
      }
      case 'dayEnd':
        for (const day of scope(instruction.days)) ends.set(day.day, toMinutes(instruction.time));
        notes.push({ kind: 'dayEnd', time: instruction.time, days: instruction.days });
        return;
      case 'moreTime': {
        let count = 0;
        const longer = <T extends { id: string; durationMinutes: number; visited: boolean; pinned?: boolean; typicalDuration?: boolean }>(stop: T): T => {
          if (stop.visited || categoryOf.get(stop.id) !== instruction.category) return stop;
          const extra = instruction.extraMinutes ?? Math.max(30, Math.round((stop.durationMinutes * 0.5) / 15) * 15);
          const to = Math.min(600, stop.durationMinutes + extra);
          durations.push({ id: stop.id, from: stop.durationMinutes, to });
          count += 1;
          return durationOn(stop.id) ? { ...stop, durationMinutes: to, typicalDuration: false } : stop;
        };
        for (const day of available) day.stops = day.stops.map(longer);
        wishlist = wishlist.map(longer);
        notes.push({ kind: 'moreTime', category: instruction.category, count });
        return;
      }
      case 'keepFixed': {
        let count = 0;
        for (const day of days) {
          day.stops = day.stops.map((stop) => {
            if (stop.visited || stop.pinned) return stop;
            if (instruction.what === 'all' || stop.priority) {
              count += 1;
              // "pinned" = stays where and when it is, for every planner step.
              return { ...stop, pinned: true };
            }
            return stop;
          });
        }
        notes.push({ kind: 'keepFixed', what: instruction.what, count });
        return;
      }
      case 'moveVisit': {
        const matches = matchVisits(instruction.target, items, refs, movableDays);
        const chosen = picks[index] ? matches.find((item) => item.id === picks[index]) : matches.length === 1 ? matches[0] : undefined;
        if (!chosen) {
          if (matches.length > 1 && !pick) pick = { index, options: matches.map((item) => item.id) };
          else if (matches.length === 0) notes.push({ kind: 'moveNotFound', text: instruction.target.text ?? instruction.target.category ?? '' });
          return;
        }
        moveRequests.push({ stopId: chosen.id, toDay: instruction.toDay });
        notes.push({ kind: 'move', id: chosen.id, toDay: instruction.toDay });
        return;
      }
      case 'findNearby':
        notes.push({ kind: 'findNearby', category: instruction.category, query: instruction.query, day: instruction.day, near: instruction.near });
        return;
      case 'catchUp': {
        const now = options.nowMinutes;
        const day = days.find((item) => item.day === options.today && item.available);
        if (!day || now === null || now === undefined) {
          if (!notes.some((note) => note.kind === 'catchUpNotToday')) notes.push({ kind: 'catchUpNotToday' });
          return;
        }
        const late: { id: string; from: string }[] = [];
        day.stops = day.stops.map((stop) => {
          if (stop.visited || stop.pinned || !stop.startTime || toMinutes(stop.startTime) >= now) return stop;
          late.push({ id: stop.id, from: stop.startTime });
          // Without its passed time it gets a new one from now, and stays on today.
          return catchUpOn(stop.id) ? { ...stop, startTime: null, keepDay: true } : stop;
        });
        notes.push({ kind: 'catchUp', day: day.day, late });
        return;
      }
      case 'findPlace':
        notes.push({ kind: 'findPlace', instruction });
        return;
      case 'skipVisit':
      case 'closedVisit':
      case 'extendVisit': {
        live = true;
        const today = days.find((item) => item.day === options.today && item.available);
        const now = options.nowMinutes;
        // "The one happening now / the next one" needs today.
        if (!instruction.target && (!today || now === null || now === undefined)) {
          if (!notes.some((note) => note.kind === 'liveNotToday')) notes.push({ kind: 'liveNotToday' });
          return;
        }
        let id: string | undefined;
        if (instruction.target) {
          const matches = matchVisits(instruction.target, items, refs, movableDays);
          // On a trip day, "the Met" means today's visit when there is one.
          const todays = matches.filter((item) => item.day === today?.day);
          const pool = todays.length > 0 ? todays : matches;
          const chosen = picks[index] ? pool.find((item) => item.id === picks[index]) : pool.length === 1 ? pool[0] : undefined;
          if (!chosen) {
            if (pool.length > 1 && !pick) pick = { index, options: pool.map((item) => item.id) };
            else if (pool.length === 0) notes.push({ kind: 'moveNotFound', text: instruction.target.text ?? instruction.target.category ?? '' });
            return;
          }
          id = chosen.id;
        } else {
          const ahead = today?.stops.filter((stop) => !stop.visited) ?? [];
          id = (instruction.kind === 'extendVisit' ? (ahead.find((stop) => stop.pinned) ?? ahead[0]) : ahead.find((stop) => !stop.pinned))?.id;
          if (!id) {
            notes.push({ kind: 'moveNotFound', text: '' });
            return;
          }
        }
        const day = days.find((item) => item.stops.some((stop) => stop.id === id)) as TripPlanDay;
        const stop = day.stops.find((item) => item.id === id) as PlanStop;
        if (instruction.kind === 'extendVisit') {
          const extra = instruction.extraMinutes ?? DEFAULT_EXTRA_MIN;
          const to = Math.min(600, stop.durationMinutes + extra);
          durations.push({ id: stop.id, from: stop.durationMinutes, to });
          const on = durationOn(stop.id);
          const length = on ? to : stop.durationMinutes;
          const begin = stop.startTime ? toMinutes(stop.startTime) : (now ?? day.dayStart ?? 0);
          const until = stop.pinned && !stop.startTime ? (now ?? begin) + extra : begin + length;
          // The user is (or will be) there: it stays on this day; later timed visits it now overlaps get new times.
          const position = day.stops.indexOf(stop);
          const late: { id: string; from: string }[] = [];
          day.stops = day.stops.map((item, i) => {
            if (item === stop) return { ...item, durationMinutes: length, typicalDuration: on ? false : item.typicalDuration, keepDay: true };
            if (!on || i < position || item.visited || item.pinned || !item.startTime || toMinutes(item.startTime) >= until + 10) return item;
            late.push({ id: item.id, from: item.startTime });
            return catchUpOn(item.id) ? { ...item, startTime: null, keepDay: true } : item;
          });
          notes.push({ kind: 'longer', id: stop.id, extra, until });
          if (late.length > 0) notes.push({ kind: 'catchUp', day: day.day, late });
          return;
        }
        skips.push(stop.id);
        if (skipOn(stop.id)) day.stops = day.stops.filter((item) => item.id !== stop.id);
        if (instruction.kind === 'closedVisit') {
          notes.push({ kind: 'closed', id: stop.id, day: day.day, category: categoryOf.get(stop.id) ?? 'other', location: stop.location });
        } else {
          notes.push({ kind: 'skip', id: stop.id });
        }
        return;
      }
    }
  });

  // Each day's window and limit: the earliest start, the latest end, and what the user asked for.
  for (const day of available) {
    const requested = starts.get(day.day);
    // A requested start counts as asked (earlier than the usual 9:30 too); today it can't be before now.
    const start =
      requested !== undefined ? Math.max(requested, day.day === options.today ? (nowFloor ?? 0) : 0) : day.dayStart;
    const end = ends.get(day.day) ?? LATE_END_MIN;
    const window = start !== undefined ? Math.max(0, end - start) : Number.POSITIVE_INFINITY;
    const limit = limits.get(day.day);
    if (start !== undefined) day.dayStart = start;
    day.capacityMinutes = Math.min(day.capacityMinutes, window, limit ?? Number.POSITIVE_INFINITY);
    if (limit !== undefined || ends.has(day.day) || starts.has(day.day)) day.limitedByRequest = true;
  }

  // After a live change today is still too full: long flexible visits could be shorter (off until chosen).
  const shorten: DurationChange[] = [];
  const today = days.find((item) => item.day === options.today && item.available);
  if ((live || instructions.some((item) => item.kind === 'catchUp')) && today && dayLoad(today.stops, today.start) > today.capacityMinutes) {
    const changed = new Set(durations.map((item) => item.id));
    for (const stop of today.stops) {
      if (stop.visited || stop.pinned || stop.startTime || stop.priority || stop.keepDay || stop.durationMinutes < 90 || changed.has(stop.id)) continue;
      shorten.push({ id: stop.id, from: stop.durationMinutes, to: stop.durationMinutes - SHORTEN_MIN });
    }
    today.stops = today.stops.map((stop) =>
      shorten.some((item) => item.id === stop.id) && shortenOn(stop.id) ? { ...stop, durationMinutes: stop.durationMinutes - SHORTEN_MIN, typicalDuration: false } : stop,
    );
  }

  // A place the user picked: it's the only one proposed (the rest of the wishlist waits).
  const place = options.newPlace;
  const addRequests = place ? [{ stopId: place.stop.id, toDay: place.toDay, allowOver: place.allowOver }] : undefined;
  if (place) wishlist = [place.stop];

  return { input: { ...base, days, wishlist, moveRequests, ...(addRequests ? { addRequests } : {}) }, durations, notes, pick, skips, shorten, shifts };
}
