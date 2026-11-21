/**
 * The trip date range, as calendar dates ("YYYY-MM-DD", no time zone). Pure:
 * the month grid shown by DateRangePicker and what a tap on a day does.
 */

export interface DateRange {
    start: string | null;
    end: string | null;
}

const pad = (value: number) => String(value).padStart(2, '0');
export const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

/** Weeks of a month, Sunday first; null pads the days outside the month. */
export function monthGrid(year: number, month: number): (string | null)[][] {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (string | null)[] = [...Array<null>(first).fill(null)];
    for (let day = 1; day <= days; day += 1) cells.push(isoOf(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

export function addMonths(year: number, month: number, count: number): { year: number; month: number } {
    const total = year * 12 + month + count;
    return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * A tap on a day: the first tap (or a tap after a full range) starts a new
 * range; the next tap ends it, or starts over if it's before the start. A
 * second tap on the start day makes a one-day trip. Never an end before the start.
 */
export function pickDay(range: DateRange, day: string): DateRange {
    if (!range.start || range.end) return { start: day, end: null };
    if (day < range.start) return { start: day, end: null };
    return { start: range.start, end: day };
}

/** Days in the trip, both ends included (Nov 23 – 29 = 7). */
export function tripLength(start: string, end: string): number {
    const ms = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) - Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
    return Math.round(ms / 86_400_000) + 1;
}

export function inRange(day: string, range: DateRange): boolean {
    return range.start !== null && range.end !== null && day > range.start && day < range.end;
}
