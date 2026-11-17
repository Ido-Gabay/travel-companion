import type { Trip } from '@travel-companion/shared';

/**
 * Trips that haven't ended yet, soonest first. Trips without dates count as
 * upcoming (they're still being planned) and come last.
 * `today` is a "YYYY-MM-DD" string in the user's local calendar.
 */
export function upcomingTrips(trips: readonly Trip[], today: string): Trip[] {
  return trips
    .filter((trip) => {
      const lastDay = trip.endDate ?? trip.startDate;
      return lastDay === null || lastDay >= today;
    })
    .sort((a, b) => {
      if (a.startDate === b.startDate) return b.createdAt.localeCompare(a.createdAt);
      if (a.startDate === null) return 1;
      if (b.startDate === null) return -1;
      return a.startDate.localeCompare(b.startDate);
    });
}
