import type { LatLng, TripDetail, TripJournal, TripPlace } from '@travel-companion/shared';
import { distanceMeters } from '../companion/geo';
import { ROUTE_DETOUR } from '../companion/travel';

/**
 * M15 trip recap: pure. Built from the itinerary (stops marked Done, highlights)
 * and the journal (notes, ratings). Nothing here is stored.
 */
export interface RecapDay {
  day: string;
  /** Stops planned for this day that were marked Done, in the order they were done. */
  done: TripPlace[];
  note: string | null;
  rating: number | null;
}

export interface Recap {
  /** Trip length in days (0 without dates). */
  days: number;
  visited: number;
  planned: number;
  highlights: TripPlace[];
  /** Rough distance between visited places (straight line × detour), or null if unknown. */
  meters: number | null;
  entries: RecapDay[];
}

const byVisit = (a: TripPlace, b: TripPlace) => (a.visitedAt ?? '').localeCompare(b.visitedAt ?? '');

export function buildRecap(
  trip: TripDetail,
  journal: TripJournal | undefined,
  tripDays: readonly string[],
  locationOf: (place: TripPlace) => LatLng | null,
): Recap {
  const planned = trip.places.filter((place) => place.day !== null);
  const visited = planned.filter((place) => place.visitedAt !== null);
  const notes = new Map((journal?.days ?? []).map((entry) => [entry.day, entry]));

  let meters = 0;
  let legs = 0;
  const entries = tripDays.map((day): RecapDay => {
    const done = visited.filter((place) => place.day === day).sort(byVisit);
    const located = done.map(locationOf).filter((point): point is LatLng => point !== null);
    for (let i = 1; i < located.length; i += 1) {
      meters += distanceMeters(located[i - 1] as LatLng, located[i] as LatLng) * ROUTE_DETOUR;
      legs += 1;
    }
    const entry = notes.get(day);
    return { day, done, note: entry?.note ?? null, rating: entry?.rating ?? null };
  });

  // Highlights: in itinerary order (days, then position), wishlist last.
  const order = new Map(trip.places.map((place, index) => [place.id, index]));
  const highlights = trip.places.filter((place) => place.highlight).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    days: tripDays.length,
    visited: visited.length,
    planned: planned.length,
    highlights,
    meters: legs > 0 ? Math.round(meters) : null,
    entries,
  };
}

export interface RecapFormat {
  title: string;
  dates: string | null;
  summary: string;
  highlightsLabel: string;
  nameOf: (place: TripPlace) => string;
  dayTitle: (day: string) => string;
}

/** Plain text for the share sheet (no Google text is stored; names are resolved now). */
export function recapText(recap: Recap, format: RecapFormat): string {
  const lines = [format.dates ? `${format.title} · ${format.dates}` : format.title, format.summary];
  if (recap.highlights.length > 0) {
    lines.push('', `${format.highlightsLabel}: ${recap.highlights.map(format.nameOf).join(', ')}`);
  }
  for (const entry of recap.entries) {
    if (entry.done.length === 0 && !entry.note && entry.rating === null) continue;
    lines.push('', entry.rating ? `${format.dayTitle(entry.day)} ${'★'.repeat(entry.rating)}` : format.dayTitle(entry.day));
    if (entry.done.length > 0) lines.push(entry.done.map(format.nameOf).join(' → '));
    if (entry.note) lines.push(entry.note);
  }
  return lines.join('\n');
}
