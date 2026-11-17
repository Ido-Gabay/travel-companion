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

export function planReminders(input: ReminderInput): PlannedReminder[] {
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

  return planned
    .filter((reminder) => reminder.fireAtMs > nowMs + MIN_LEAD_MS)
    .sort((a, b) => a.fireAtMs - b.fireAtMs || a.id.localeCompare(b.id))
    .slice(0, MAX_SCHEDULED);
}

/** What makes a scheduled reminder current: same time and same text inputs. */
export function reminderFingerprint(reminder: PlannedReminder, locale: string): string {
  return JSON.stringify([reminder.fireAtMs, reminder.kind, reminder.vars, locale]);
}

export interface ScheduledReminder {
  id: string;
  fingerprint: string;
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
