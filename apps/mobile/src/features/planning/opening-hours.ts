import type { OpeningPeriod } from '@travel-companion/shared';

/**
 * Google's weekly opening hours turned into windows for one calendar day (M13).
 * Times are the place's local time, as the itinerary's are. Hours are fetched on
 * request and kept in memory only (Google terms); nothing here is stored.
 */
export interface OpenWindow {
  /** Minutes since that day's midnight. */
  open: number;
  /** May be > 1440 when the place closes after midnight. */
  close: number;
}

const DAY = 24 * 60;

/** 0 = Sunday … 6 = Saturday, for an ISO calendar day ("2026-11-23"). */
export function weekdayOf(isoDay: string): number {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

const minutes = (point: { hour: number; minute: number }) => point.hour * 60 + point.minute;

/**
 * Opening windows on that day: null = hours unknown, [] = closed all day.
 * Includes a night that started the day before and ends after midnight.
 */
export function dayWindows(periods: readonly OpeningPeriod[], isoDay: string): OpenWindow[] | null {
  if (periods.length === 0) return null;
  // Google's "open 24/7": one period opening Sunday 00:00 with no close.
  if (periods.some((period) => period.close === null)) return [{ open: 0, close: DAY }];
  const weekday = weekdayOf(isoDay);
  const yesterday = (weekday + 6) % 7;
  const windows: OpenWindow[] = [];
  for (const period of periods) {
    const close = period.close as NonNullable<OpeningPeriod['close']>;
    const daysToClose = (close.day - period.open.day + 7) % 7;
    let length = daysToClose * DAY + minutes(close) - minutes(period.open);
    if (length <= 0) length += 7 * DAY;
    if (period.open.day === weekday) {
      windows.push({ open: minutes(period.open), close: minutes(period.open) + length });
    } else if (period.open.day === yesterday) {
      const end = minutes(period.open) + length - DAY;
      if (end > 0) windows.push({ open: 0, close: end });
    }
  }
  return windows.sort((a, b) => a.open - b.open);
}

/** The first moment at or after `start` when a visit of `duration` fits, or null. */
export function firstFit(windows: readonly OpenWindow[], start: number, duration: number): number | null {
  for (const window of windows) {
    const begin = Math.max(start, window.open);
    if (begin + duration <= window.close) return begin;
  }
  return null;
}

export type HoursIssue =
  | { kind: 'closedAllDay' }
  | { kind: 'notOpenYet'; opensAt: number }
  | { kind: 'closesEarly'; closesAt: number }
  | { kind: 'closed' };

/** Is a visit from `start` to `end` inside opening hours? Null when it is (or hours are unknown). */
export function hoursIssue(windows: readonly OpenWindow[] | null, start: number, end: number): HoursIssue | null {
  if (windows === null) return null;
  if (windows.length === 0) return { kind: 'closedAllDay' };
  const containing = windows.find((window) => start >= window.open && start < window.close);
  if (containing) return end > containing.close ? { kind: 'closesEarly', closesAt: containing.close } : null;
  const later = windows.find((window) => window.open > start);
  return later ? { kind: 'notOpenYet', opensAt: later.open } : { kind: 'closed' };
}
