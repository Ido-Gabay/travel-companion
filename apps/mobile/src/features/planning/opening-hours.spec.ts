import type { OpeningPeriod } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { checkDay, suggestTimes, toMinutes, type PlanStop } from './day-planner';
import { dayWindows, firstFit, hoursIssue, weekdayOf } from './opening-hours';

const p = (day: number, open: string, closeDay: number, close: string): OpeningPeriod => {
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  return { open: { day, hour: oh ?? 0, minute: om ?? 0 }, close: { day: closeDay, hour: ch ?? 0, minute: cm ?? 0 } };
};
// The Met: closed Wednesdays; Fri–Sat until 21:00.
const MET: OpeningPeriod[] = [0, 1, 2, 4].map((day) => p(day, '10:00', day, '17:00')).concat([p(5, '10:00', 5, '21:00'), p(6, '10:00', 6, '21:00')]);
// A bar open 17:00–02:00.
const BAR: OpeningPeriod[] = [0, 1, 2, 3, 4, 5, 6].map((day) => p(day, '17:00', (day + 1) % 7, '02:00'));
const MON = '2026-11-23';
const WED = '2026-11-25';

describe('opening hours (in memory, for planning)', () => {
  it('knows the weekday of a trip day', () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf('2026-11-29')).toBe(0);
  });

  it('turns weekly periods into windows for a day: open, closed, unknown, overnight, 24/7', () => {
    expect(dayWindows(MET, MON)).toEqual([{ open: 600, close: 1020 }]);
    expect(dayWindows(MET, WED)).toEqual([]);
    expect(dayWindows([], MON)).toBeNull();
    expect(dayWindows(BAR, MON)).toEqual([{ open: 0, close: 120 }, { open: 1020, close: 1560 }]);
    expect(dayWindows([{ open: { day: 0, hour: 0, minute: 0 }, close: null }], MON)).toEqual([{ open: 0, close: 1440 }]);
  });

  it('finds the first time a visit fits and explains when it does not', () => {
    const windows = dayWindows(MET, MON) ?? [];
    expect(firstFit(windows, 9 * 60, 120)).toBe(600);
    expect(firstFit(windows, 16 * 60, 120)).toBeNull();
    expect(hoursIssue(windows, 9 * 60, 11 * 60)).toEqual({ kind: 'notOpenYet', opensAt: 600 });
    expect(hoursIssue(windows, 16 * 60, 18 * 60)).toEqual({ kind: 'closesEarly', closesAt: 1020 });
    expect(hoursIssue(windows, 18 * 60, 19 * 60)).toEqual({ kind: 'closed' });
    expect(hoursIssue([], 600, 700)).toEqual({ kind: 'closedAllDay' });
    expect(hoursIssue(null, 600, 700)).toBeNull();
  });
});

describe('planning with opening hours', () => {
  const met = (extra: Partial<PlanStop> = {}): PlanStop => ({
    id: 'met',
    startTime: null,
    durationMinutes: 120,
    location: { latitude: 40.7794, longitude: -73.9632 },
    visited: false,
    hours: dayWindows(MET, MON),
    ...extra,
  });

  it('suggested times wait for opening time', () => {
    const times = suggestTimes([met()], null, 9 * 60);
    expect(times.get('met')).toBe('10:00');
  });

  it('warns when a stop is closed that day or closes before the visit ends', () => {
    const closed = checkDay([met({ startTime: '11:00', hours: dayWindows(MET, WED) })], null);
    expect(closed.warnings).toEqual([{ kind: 'hours', stopId: 'met', issue: { kind: 'closedAllDay' } }]);
    const late = checkDay([met({ startTime: '16:00' })], null);
    expect(late.warnings).toEqual([{ kind: 'hours', stopId: 'met', issue: { kind: 'closesEarly', closesAt: 1020 } }]);
    expect(toMinutes('17:00')).toBe(1020);
  });

  it('says nothing about hours that were not checked', () => {
    expect(checkDay([met({ startTime: '08:00', hours: undefined })], null).warnings).toEqual([]);
  });
});
