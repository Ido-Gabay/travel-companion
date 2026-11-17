import type { LatLng, PlaceCategory } from '@travel-companion/shared';
import { BUFFER_MIN } from './today-engine';
import { estimateTravel } from './travel';
import { zonedDateTimeToUtc } from './zoned-time';

/**
 * Local reminders (M10): which notifications the phone should have scheduled
 * for a trip, computed from the itinerary alone. Pure and deterministic; the
 * notification layer (reminder-sync.ts) only applies the result. Reminders
 * never change the plan, and nothing here reads the user's location.
 */

export const LEAD_OPTIONS = [5, 10, 15, 30] as const;
export type LeadMinutes = (typeof LEAD_OPTIONS)[number];

/** Stored on this phone (reminders belong to the device that shows them). */
export interface ReminderSettings {
  /** Master switch. Off until the user turns reminders on (and grants permission). */
  enabled: boolean;
  /** "Leave in N min for X". */
  leaveSoon: boolean;
  leadMinutes: LeadMinutes;
  /** "Time to leave for X". */
  leaveNow: boolean;
  /** "Coming up at 19:30: X", an hour before. */
  headsUp: boolean;
  /** "Today: 4 stops, first at 10:00", at 08:00. */
  morningSummary: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  leaveSoon: true,
  leadMinutes: 10,
  leaveNow: true,
  headsUp: false,
  morningSummary: true,
};

/** iOS keeps at most 64 pending local notifications per app; stay well below. */
export const MAX_SCHEDULED = 50;
/** Used when a stop's travel time can't be estimated (no location). */
export const UNKNOWN_TRAVEL_MIN = 20;
export const HEADS_UP_BEFORE_MIN = 60;
export const MORNING_SUMMARY_TIME = '08:00';
/** Skip a heads-up this close to the leave-soon reminder (it would say the same thing). */
const HEADS_UP_MIN_GAP = 15;
/** Don't schedule anything about to fire (it may not be delivered). */
const MIN_LEAD_MS = 30_000;

export interface ReminderStop {
  id: string;
  name: string;
  category: PlaceCategory;
  startTime: string | null;
  visited: boolean;
  location: LatLng | null;
  /** The name comes from Google (needs "Google Maps" attribution in the notification). */
  google: boolean;
}

export interface ReminderDay {
  day: string;
  /** In itinerary order. */
  stops: readonly ReminderStop[];
}

export interface ReminderInput {
  tripId: string;
  /** The trip's IANA time zone (from the pinned hotel); null = the phone's zone. */
  timeZone: string | null;
  hotel: LatLng | null;
  days: readonly ReminderDay[];
  /** Stops the user muted. */
  muted: ReadonlySet<string>;
  settings: ReminderSettings;
  nowMs: number;
}

export type ReminderKind = 'leaveSoon' | 'leaveNow' | 'headsUp' | 'morning';

export interface PlannedReminder {
  /** Stable identifier: the same reminder keeps the same id across syncs. */
  id: string;
  kind: ReminderKind;
  fireAtMs: number;
  tripId: string;
  day: string;
  placeId: string | null;
  /** Values for the notification text. */
  vars: {
    name?: string;
    /** Planned start, "HH:MM" in the trip's zone. */
    time?: string;
    lead?: number;
    travelMinutes?: number;
    travelMode?: 'walk' | 'transit' | 'unknown';
    count?: number;
    /** The text includes a Google place name. */
    google?: boolean;
  };
}

function toClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * The reminders the plan calls for. `raw` skips the "already past" filter and the
 * cap: used offline to tell whether a scheduled reminder is still wanted at all.
 */
export function planReminders(input: ReminderInput, options: { raw?: boolean } = {}): PlannedReminder[] {
  const { settings, tripId, timeZone, nowMs } = input;
  if (!settings.enabled) return [];
  const at = (day: string, minutes: number) =>
    // Minutes may go below 0 (leave before midnight): shift through the day boundary.
    zonedDateTimeToUtc(day, toClock(Math.max(0, minutes)), timeZone) + Math.min(0, minutes) * 60_000;

  const planned: PlannedReminder[] = [];
  for (const { day, stops } of input.days) {
    const open = stops.filter((stop) => !stop.visited);

    if (settings.morningSummary && open.length > 0) {
      const firstTimed = open.find((stop) => stop.startTime !== null);
      planned.push({
        id: `tc:morning:${tripId}:${day}`,
        kind: 'morning',
        fireAtMs: zonedDateTimeToUtc(day, MORNING_SUMMARY_TIME, timeZone),
        tripId,
        day,
        placeId: null,
        vars: {
          count: open.length,
          ...(firstTimed ? { name: firstTimed.name, time: firstTimed.startTime ?? '', google: firstTimed.google } : {}),
        },
      });
    }

    stops.forEach((stop, index) => {
      if (stop.visited || stop.startTime === null || input.muted.has(stop.id)) return;
      const start = minutesOf(stop.startTime);
      // Travel from the previous stop of the day (its location), else from the hotel.
      const previous = [...stops.slice(0, index)].reverse().find((item) => item.location !== null)?.location ?? input.hotel;
      const travel = previous && stop.location ? estimateTravel(previous, stop.location) : null;
      const travelMinutes = travel?.minutes ?? UNKNOWN_TRAVEL_MIN;
      const leaveAt = start - travelMinutes - BUFFER_MIN;
      const travelVars = { travelMinutes, travelMode: travel?.mode ?? ('unknown' as const), google: stop.google };
      const base = { tripId, day, placeId: stop.id };

      const leaveSoonAt = leaveAt - settings.leadMinutes;
      if (settings.leaveSoon) {
        planned.push({
          ...base,
          id: `tc:leaveSoon:${tripId}:${stop.id}`,
          kind: 'leaveSoon',
          fireAtMs: at(day, leaveSoonAt),
          vars: { name: stop.name, time: stop.startTime, lead: settings.leadMinutes, ...travelVars },
        });
      }
      if (settings.leaveNow) {
        planned.push({
          ...base,
          id: `tc:leaveNow:${tripId}:${stop.id}`,
          kind: 'leaveNow',
          fireAtMs: at(day, leaveAt),
          vars: { name: stop.name, time: stop.startTime, ...travelVars },
        });
      }
      const headsUpAt = start - HEADS_UP_BEFORE_MIN;
      const redundant = settings.leaveSoon && headsUpAt > leaveSoonAt - HEADS_UP_MIN_GAP;
      if (settings.headsUp && !redundant) {
        planned.push({
          ...base,
          id: `tc:headsUp:${tripId}:${stop.id}`,
          kind: 'headsUp',
          fireAtMs: at(day, headsUpAt),
          vars: { name: stop.name, time: stop.startTime, google: stop.google },
        });
      }
    });
  }

  if (options.raw) return planned;
  return planned
    .filter((reminder) => reminder.fireAtMs > nowMs + MIN_LEAD_MS)
    .sort((a, b) => a.fireAtMs - b.fireAtMs || a.id.localeCompare(b.id))
    .slice(0, MAX_SCHEDULED);
}

/** What makes a scheduled reminder current: same time and same text inputs. */
export function reminderFingerprint(reminder: PlannedReminder, locale: string): string {
  return JSON.stringify([reminder.fireAtMs, reminder.kind, reminder.vars, locale]);
}

/**
 * What a reminder depends on from the user's own plan only (kind, day, planned time,
 * lead, stop count), not Google names or travel estimates. Stored with each
 * scheduled reminder so an offline sync can tell "the plan changed" from "Google
 * details are just unavailable right now".
 */
export function reminderPlanKey(reminder: PlannedReminder): string {
  const { vars } = reminder;
  return reminder.kind === 'morning'
    ? JSON.stringify([reminder.kind, reminder.day, vars.count ?? 0, vars.time ?? null])
    : JSON.stringify([reminder.kind, reminder.day, reminder.placeId, vars.time ?? null, vars.lead ?? null]);
}

export interface ScheduledReminder {
  id: string;
  fingerprint: string;
  /** reminderPlanKey at scheduling time; null for reminders scheduled before M12a. */
  planKey?: string | null;
}

/**
 * Brings the phone's scheduled reminders in line with the plan: cancel ours
 * that are gone or changed, schedule new or changed ones. Never duplicates.
 */
export function diffReminders(
  scheduled: readonly ScheduledReminder[],
  desired: readonly PlannedReminder[],
  locale: string,
): { cancel: string[]; schedule: PlannedReminder[] } {
  const want = new Map(desired.map((reminder) => [reminder.id, reminderFingerprint(reminder, locale)]));
  const have = new Map(scheduled.map((reminder) => [reminder.id, reminder.fingerprint]));
  return {
    cancel: scheduled.filter((item) => want.get(item.id) !== item.fingerprint).map((item) => item.id),
    schedule: desired.filter((reminder) => have.get(reminder.id) !== want.get(reminder.id)),
  };
}

/**
 * Offline / degraded sync (M12a). Used when Google details (names, locations) or the
 * trip time zone can't be loaded. Reminders scheduled earlier with full information
 * stay as they are unless the user's own plan for them changed:
 * - still wanted and plan unchanged (or scheduled before plan keys existed): keep;
 * - still wanted but the plan changed (new time, lead…): replace with the new one;
 * - no longer wanted at all (stop done, muted, unscheduled, removed, setting off): cancel;
 * - newly wanted (a stop timed offline): schedule.
 * `raw` = planReminders(input, { raw: true }); `desired` = planReminders(input).
 */
export function diffRemindersPreserving(
  scheduled: readonly ScheduledReminder[],
  raw: readonly PlannedReminder[],
  desired: readonly PlannedReminder[],
): { cancel: string[]; schedule: PlannedReminder[] } {
  const rawById = new Map(raw.map((reminder) => [reminder.id, reminder]));
  const desiredById = new Map(desired.map((reminder) => [reminder.id, reminder]));
  const cancel: string[] = [];
  const schedule: PlannedReminder[] = [];
  const kept = new Set<string>();

  for (const item of scheduled) {
    const wanted = rawById.get(item.id);
    if (!wanted) {
      cancel.push(item.id);
      continue;
    }
    if (item.planKey == null || item.planKey === reminderPlanKey(wanted)) {
      kept.add(item.id);
      continue;
    }
    cancel.push(item.id);
    const replacement = desiredById.get(item.id);
    if (replacement) {
      schedule.push(replacement);
      kept.add(item.id);
    }
  }
  for (const reminder of desired) {
    if (!kept.has(reminder.id) && !scheduled.some((item) => item.id === reminder.id)) schedule.push(reminder);
  }
  return { cancel, schedule };
}

export type ReminderSyncMode = 'wait' | 'cancelAll' | 'full' | 'preserve';

/**
 * What a reminder sync may do (M12a). The key rule: reminders are only cancelled
 * for a known reason (turned off, no permission, or the trip list is known and has
 * no current/upcoming trip), never because data couldn't be loaded.
 */
export function reminderSyncMode(state: {
  settingsLoaded: boolean;
  enabled: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  /** The trip list is known (from the server or the saved copy). */
  tripsKnown: boolean;
  hasTrip: boolean;
  /** The trip's own data is known (server or saved copy). */
  tripKnown: boolean;
  /** Google names/locations or the trip time zone are missing. */
  degraded: boolean;
}): ReminderSyncMode {
  if (!state.settingsLoaded) return 'wait';
  if (!state.enabled || state.permission !== 'granted') return 'cancelAll';
  if (!state.tripsKnown) return 'wait';
  if (!state.hasTrip) return 'cancelAll';
  if (!state.tripKnown) return 'wait';
  return state.degraded ? 'preserve' : 'full';
}
