/** Helpers for calendar dates ("YYYY-MM-DD"), which have no time zone. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date of a Date object, e.g. a value picked in a date picker. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A Date at local midnight for a calendar date (for date pickers). */
export function fromIsoDate(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Not a calendar date: ${iso}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function utcDate(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Not a calendar date: ${iso}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/**
 * Human-readable trip dates in the app language, e.g. "Nov 23 – 29, 2026".
 * Formatting in UTC keeps the calendar date exactly as stored.
 * Returns null when no dates are set.
 */
export function formatTripDates(
  startDate: string | null,
  endDate: string | null,
  locale: string,
): string | null {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const format = (iso: string) => formatter.format(utcDate(iso));

  if (startDate && endDate) {
    // formatRange gives "Nov 23 – 29, 2026"; not every JS engine has it.
    return typeof formatter.formatRange === 'function'
      ? formatter.formatRange(utcDate(startDate), utcDate(endDate))
      : `${format(startDate)} – ${format(endDate)}`;
  }
  if (startDate) return format(startDate);
  if (endDate) return format(endDate);
  return null;
}
