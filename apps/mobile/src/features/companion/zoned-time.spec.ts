import { describe, expect, it } from 'vitest';
import { isValidTimeZone, zonedDateTimeToUtc, zonedNow } from './zoned-time';

describe('zoned times', () => {
  it('turns New York wall-clock time into the right instant (EST, UTC-5 in late November)', () => {
    expect(new Date(zonedDateTimeToUtc('2026-11-23', '10:00', 'America/New_York')).toISOString()).toBe('2026-11-23T15:00:00.000Z');
    expect(new Date(zonedDateTimeToUtc('2026-11-29', '23:30', 'America/New_York')).toISOString()).toBe('2026-11-30T04:30:00.000Z');
  });

  it('handles summer time and other zones', () => {
    expect(new Date(zonedDateTimeToUtc('2026-07-01', '10:00', 'America/New_York')).toISOString()).toBe('2026-07-01T14:00:00.000Z');
    expect(new Date(zonedDateTimeToUtc('2026-11-23', '10:00', 'Asia/Jerusalem')).toISOString()).toBe('2026-11-23T08:00:00.000Z');
  });

  it('falls back to the phone zone without a valid zone', () => {
    const local = new Date(2026, 10, 23, 10, 0).getTime();
    expect(zonedDateTimeToUtc('2026-11-23', '10:00', null)).toBe(local);
    expect(zonedDateTimeToUtc('2026-11-23', '10:00', 'Not/AZone')).toBe(local);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('zonedNow', () => {
  it("gives the trip's day and time, not the phone's", () => {
    // 2026-11-24 03:30 UTC is still Nov 23, 22:30 in New York (and 05:30 Nov 24 in Israel).
    const instant = Date.UTC(2026, 10, 24, 3, 30);
    expect(zonedNow(instant, 'America/New_York')).toEqual({ day: '2026-11-23', minutes: 22 * 60 + 30 });
    expect(zonedNow(instant, 'Asia/Jerusalem')).toEqual({ day: '2026-11-24', minutes: 5 * 60 + 30 });
  });

  it('uses the phone clock without a valid zone', () => {
    const instant = new Date(2026, 10, 23, 9, 15).getTime();
    expect(zonedNow(instant, null)).toEqual({ day: '2026-11-23', minutes: 9 * 60 + 15 });
    expect(zonedNow(instant, 'Not/AZone')).toEqual({ day: '2026-11-23', minutes: 9 * 60 + 15 });
  });

  it('round-trips with zonedDateTimeToUtc', () => {
    const instant = zonedDateTimeToUtc('2026-11-25', '13:40', 'America/New_York');
    expect(zonedNow(instant, 'America/New_York')).toEqual({ day: '2026-11-25', minutes: 13 * 60 + 40 });
  });
});
