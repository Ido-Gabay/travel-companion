import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_SETTINGS,
  diffReminders,
  MAX_SCHEDULED,
  planReminders,
  reminderFingerprint,
  type ReminderInput,
  type ReminderStop,
} from './reminders';
import { estimateTravel } from './travel';
import { zonedDateTimeToUtc } from './zoned-time';

const NY = 'America/New_York';
const HOTEL = { latitude: 40.7577, longitude: -73.9857 };
const MOMA = { latitude: 40.7614, longitude: -73.9776 };
const BRYANT = { latitude: 40.7536, longitude: -73.9832 };
const ON = { ...DEFAULT_REMINDER_SETTINGS, enabled: true };
// Before the trip, at home (Israel): 2026-11-20 12:00 UTC.
const BEFORE_TRIP = Date.UTC(2026, 10, 20, 12, 0);

function stop(id: string, extra: Partial<ReminderStop> = {}): ReminderStop {
  return { id, name: id, category: 'sights', startTime: null, visited: false, location: MOMA, ...extra };
}

function input(extra: Partial<ReminderInput>): ReminderInput {
  return {
    tripId: 'trip',
    timeZone: NY,
    hotel: HOTEL,
    days: [],
    muted: new Set(),
    settings: ON,
    nowMs: BEFORE_TRIP,
    ...extra,
  };
}

const nyTime = (day: string, time: string) => zonedDateTimeToUtc(day, time, NY);

describe('planReminders', () => {
  it('does nothing while reminders are off', () => {
    expect(planReminders(input({ settings: DEFAULT_REMINDER_SETTINGS, days: [{ day: '2026-11-23', stops: [stop('moma', { startTime: '11:00' })] }] }))).toEqual([]);
  });

  it('schedules leave reminders in the trip time zone, from the hotel for the first stop', () => {
    const result = planReminders(
      input({ settings: { ...ON, morningSummary: false }, days: [{ day: '2026-11-23', stops: [stop('moma', { startTime: '11:00' })] }] }),
    );
    const travel = estimateTravel(HOTEL, MOMA).minutes;
    const leaveAt = nyTime('2026-11-23', '11:00') - (travel + 5) * 60_000;
    expect(result.map((r) => r.kind)).toEqual(['leaveSoon', 'leaveNow']);
    expect(result[1]?.fireAtMs).toBe(leaveAt);
    expect(result[0]?.fireAtMs).toBe(leaveAt - 10 * 60_000);
    expect(result[0]?.vars).toMatchObject({ name: 'moma', lead: 10, travelMode: 'walk', travelMinutes: travel });
    // 11:00 in New York is 16:00 UTC: the reminder is not on Israel time.
    expect(new Date(nyTime('2026-11-23', '11:00')).toISOString()).toBe('2026-11-23T16:00:00.000Z');
  });

  it('measures travel from the previous stop and uses a default when location is unknown', () => {
    const result = planReminders(
      input({
        settings: { ...ON, morningSummary: false, leaveSoon: false },
        days: [
          {
            day: '2026-11-23',
            stops: [stop('park', { location: BRYANT }), stop('moma', { startTime: '15:00' }), stop('dinner', { startTime: '19:00', location: null })],
          },
        ],
      }),
    );
    const moma = result.find((r) => r.placeId === 'moma');
    expect(moma?.vars.travelMinutes).toBe(estimateTravel(BRYANT, MOMA).minutes);
    const dinner = result.find((r) => r.placeId === 'dinner');
    expect(dinner?.vars).toMatchObject({ travelMode: 'unknown', travelMinutes: 20 });
  });

  it('skips flexible, visited, muted and past stops', () => {
    const result = planReminders(
      input({
        settings: { ...ON, morningSummary: false },
        nowMs: nyTime('2026-11-23', '12:00'),
        muted: new Set(['muted']),
        days: [
          {
            day: '2026-11-23',
            stops: [
              stop('flexible'),
              stop('visited', { startTime: '14:00', visited: true }),
              stop('muted', { startTime: '15:00' }),
              stop('past', { startTime: '11:00' }),
              stop('later', { startTime: '18:00' }),
            ],
          },
        ],
      }),
    );
    expect([...new Set(result.map((r) => r.placeId))]).toEqual(['later']);
  });

  it('adds a morning summary and a heads-up only when it is not redundant', () => {
    const BROOKLYN = { latitude: 40.6782, longitude: -73.9442 };
    const result = planReminders(
      input({
        settings: { ...ON, headsUp: true },
        days: [
          {
            day: '2026-11-24',
            stops: [stop('moma', { startTime: '11:00' }), stop('brooklyn', { startTime: '20:00', location: BROOKLYN })],
          },
        ],
      }),
    );
    const morning = result.find((r) => r.kind === 'morning');
    expect(morning?.fireAtMs).toBe(nyTime('2026-11-24', '08:00'));
    expect(morning?.vars).toMatchObject({ count: 2, name: 'moma', time: '11:00' });
    // MoMA: heads-up at 10:00, well before "leave in 10 min" (~10:32): kept.
    // Brooklyn (~45 min by subway): "leave in 10 min" comes before the heads-up would: skipped.
    expect(result.filter((r) => r.kind === 'headsUp').map((r) => r.placeId)).toEqual(['moma']);
  });

  it('caps the number of reminders and keeps the soonest', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-11-${23 + i}`,
      stops: Array.from({ length: 6 }, (_, j) => stop(`s${i}-${j}`, { startTime: `${String(9 + 2 * j).padStart(2, '0')}:00` })),
    }));
    const result = planReminders(input({ days }));
    expect(result).toHaveLength(MAX_SCHEDULED);
    expect(result.every((r, i) => i === 0 || (result[i - 1]?.fireAtMs ?? 0) <= r.fireAtMs)).toBe(true);
    expect(result[0]?.day).toBe('2026-11-23');
  });

  it('keeps stable ids so the same reminder is recognized next time', () => {
    const a = planReminders(input({ days: [{ day: '2026-11-23', stops: [stop('moma', { startTime: '11:00' })] }] }));
    const b = planReminders(input({ days: [{ day: '2026-11-23', stops: [stop('moma', { startTime: '11:00' })] }] }));
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    expect(a.map((r) => r.id)).toContain('tc:leaveNow:trip:moma');
  });
});

describe('diffReminders', () => {
  const plan = planReminders(input({ settings: { ...ON, morningSummary: false }, days: [{ day: '2026-11-23', stops: [stop('moma', { startTime: '11:00' })] }] }));
  const scheduled = plan.map((r) => ({ id: r.id, fingerprint: reminderFingerprint(r, 'en') }));

  it('changes nothing when the phone already matches the plan', () => {
    expect(diffReminders(scheduled, plan, 'en')).toEqual({ cancel: [], schedule: [] });
  });

  it('replaces reminders whose time changed and cancels ones no longer planned', () => {
    const moved = planReminders(input({ settings: { ...ON, morningSummary: false, leaveSoon: false }, days: [{ day: '2026-11-23', stops: [stop('moma', { startTime: '12:00' })] }] }));
    const diff = diffReminders(scheduled, moved, 'en');
    expect(diff.cancel.sort()).toEqual(['tc:leaveNow:trip:moma', 'tc:leaveSoon:trip:moma']);
    expect(diff.schedule.map((r) => r.id)).toEqual(['tc:leaveNow:trip:moma']);
  });

  it('reschedules when the language changes (new text)', () => {
    expect(diffReminders(scheduled, plan, 'he').schedule).toHaveLength(plan.length);
  });

  it('cancels everything when reminders are turned off', () => {
    expect(diffReminders(scheduled, [], 'en').cancel).toHaveLength(scheduled.length);
  });
});
