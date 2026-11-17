import type { Trip, TripPlace } from '@travel-companion/shared';

/** Places planned for one day, in their order. */
export function placesForDay(places: readonly TripPlace[], day: string): TripPlace[] {
  return places
    .filter((place) => place.day === day)
    .sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt));
}

/** Places on the wishlist (not planned for any day), oldest first. */
export function wishlistPlaces(places: readonly TripPlace[]): TripPlace[] {
  return places.filter((place) => place.day === null);
}

/** How many places each day has, for the day strip. */
export function countByDay(places: readonly TripPlace[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const place of places) {
    if (place.day) counts.set(place.day, (counts.get(place.day) ?? 0) + 1);
  }
  return counts;
}

/** The day to open first: today while the trip is on, otherwise the first day. */
export function initialDay(days: readonly string[], today: string): string | null {
  if (days.length === 0) return null;
  return days.includes(today) ? today : (days[0] ?? null);
}

/** The ids in a new order after moving one item up (-1) or down (+1). Null when it can't move. */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (item === undefined) return null;
  next.splice(to, 0, item);
  return next;
}

function utcNoon(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** "Mon" and "23" for the day strip, in the app language. */
export function dayChipParts(day: string, locale: string): { weekday: string; date: string } {
  const date = utcNoon(day);
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date),
    date: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(date),
  };
}

/** "Monday, November 23" in the app language. */
export function dayTitle(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utcNoon(day));
}

/** "Mon, Nov 23" in the app language, e.g. for a place's plan badge. */
export function dayShort(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utcNoon(day));
}

/** "09:30" shown the local way ("9:30 AM" in English, "09:30" in Hebrew). */
export function formatStartTime(startTime: string, locale: string): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hours ?? 0, minutes ?? 0));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(date);
}

/** "HH:MM" from a time picked in the native picker (device local time). */
export function toStartTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A Date for the native time picker showing "HH:MM" (or 09:00 when no time is set). */
export function fromStartTime(startTime: string | null): Date {
  const [hours, minutes] = (startTime ?? '09:00').split(':').map(Number);
  const date = new Date();
  date.setHours(hours ?? 9, minutes ?? 0, 0, 0);
  return date;
}

/** Whole days from one calendar date to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** How far ahead Home starts showing a trip's countdown. */
export const TRIP_MODE_LEAD_DAYS = 30;

export type TripMode =
  | { phase: 'during'; trip: Trip; dayNumber: number; totalDays: number }
  | { phase: 'before'; trip: Trip; daysUntil: number };

/**
 * The trip Home should focus on: the one happening today, otherwise the next
 * dated trip starting within TRIP_MODE_LEAD_DAYS. Null when there is none.
 */
export function tripMode(trips: readonly Trip[], today: string): TripMode | null {
  const dated = trips.filter(
    (trip): trip is Trip & { startDate: string; endDate: string } => trip.startDate !== null && trip.endDate !== null,
  );
  const current = dated
    .filter((trip) => trip.startDate <= today && today <= trip.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (current) {
    return {
      phase: 'during',
      trip: current,
      dayNumber: daysBetween(current.startDate, today) + 1,
      totalDays: daysBetween(current.startDate, current.endDate) + 1,
    };
  }
  const next = dated
    .filter((trip) => trip.startDate > today && daysBetween(today, trip.startDate) <= TRIP_MODE_LEAD_DAYS)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return next ? { phase: 'before', trip: next, daysUntil: daysBetween(today, next.startDate) } : null;
}

/** The first stop of the day not yet marked visited. */
export function nextStop(stops: readonly TripPlace[]): TripPlace | null {
  return stops.find((stop) => stop.visitedAt === null) ?? null;
}
