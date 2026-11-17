import { describe, expect, it } from 'vitest';
import { isValidTimeZone, zonedDateTimeToUtc } from './zoned-time';

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
