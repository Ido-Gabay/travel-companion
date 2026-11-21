import type { LatLng } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { OVERLOADED_MIN, toMinutes, type PlanStop } from './day-planner';
import type { OpenWindow } from './opening-hours';
import { applySuggestions, estimateDayLoad, planDay, smartOrder, type SmartPlanInput } from './smart-plan';

const HOTEL: LatLng = { latitude: 40.7577, longitude: -73.9857 }; // Times Square
const MOMA: LatLng = { latitude: 40.7614, longitude: -73.9776 };
const ZOO: LatLng = { latitude: 40.7678, longitude: -73.9718 };
const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 };
const BAKERY: LatLng = { latitude: 40.7505, longitude: -73.9934 };
const CHELSEA: LatLng = { latitude: 40.7424, longitude: -74.006 };
const DAY = '2026-11-24';

const stop = (id: string, location: LatLng | null, extra: Partial<PlanStop> = {}): PlanStop => ({
  id,
  startTime: null,
  durationMinutes: 60,
  location,
  visited: false,
  ...extra,
});
const at = (open: string, close: string): OpenWindow => ({ open: toMinutes(open), close: toMinutes(close) });

function input(stops: PlanStop[], extra: Partial<SmartPlanInput> = {}): SmartPlanInput {
  return {
    day: DAY,
    stops,
    start: HOTEL,
    otherDays: [
      { day: '2026-11-23', loadMinutes: 300 },
      { day: '2026-11-25', loadMinutes: 120 },
    ],
    windowsOn: (id) => stops.find((item) => item.id === id)?.hours,
    ...extra,
  };
}

describe('smart order: travel AND opening hours', () => {
  it('puts the morning-only bakery first, even if it costs a little travel', () => {
    const stops = [
      stop('met', MET, { durationMinutes: 120, hours: [at('10:00', '17:00')] }),
      stop('bakery', BAKERY, { hours: [at('07:00', '11:00')] }),
    ];
    const order = smartOrder(stops, HOTEL);
    expect(order?.order).toEqual(['bakery', 'met']);
    expect(order?.problemsFixed).toBeGreaterThan(0);
  });

  it('never moves timed, done or happening-now visits; only flexible ones', () => {
    const stops = [
      stop('lunch', CHELSEA, { startTime: '12:30' }),
      stop('zoo', ZOO),
      stop('done', MET, { visited: true }),
      stop('here', MOMA, { pinned: true }),
      stop('moma', MOMA),
    ];
    const order = smartOrder(stops, HOTEL);
    const fixed = (order?.order ?? stops.map((s) => s.id)).filter((id) => ['lunch', 'done', 'here'].includes(id));
    expect(fixed).toEqual(['lunch', 'done', 'here']);
  });

  it('returns nothing when the day is already good', () => {
    expect(smartOrder([stop('moma', MOMA), stop('zoo', ZOO)], HOTEL)).toBeNull();
  });
});

describe('planDay: suggestions with reasons, nothing removed', () => {
  it('a flexible visit closed all day is suggested for a day it is open (and with room)', () => {
    const stops = [stop('moma', MOMA), stop('museum', MET, { hours: [] })];
    const plan = planDay(
      input(stops, {
        windowsOn: (id, day) => (id === 'museum' ? (day === '2026-11-25' ? [at('10:00', '17:00')] : []) : undefined),
      }),
    );
    expect(plan.moves).toEqual([{ stopId: 'museum', toDay: '2026-11-25', reason: 'closed' }]);
  });

  it('a starred (priority) visit is never moved: the closed day is reported instead', () => {
    const stops = [stop('museum', MET, { hours: [], priority: true })];
    const plan = planDay(input(stops));
    expect(plan.moves).toEqual([]);
    expect(plan.problems).toContainEqual({ kind: 'closedNoOtherDay', stopId: 'museum' });
  });

  it('an overloaded day: the least important flexible visits are suggested for lighter days', () => {
    const stops = [
      stop('breakfast', BAKERY, { startTime: '08:00' }),
      stop('met', MET, { durationMinutes: 180, priority: true }),
      stop('moma', MOMA, { durationMinutes: 150 }),
      stop('zoo', ZOO, { durationMinutes: 120 }),
      stop('chelsea', CHELSEA, { durationMinutes: 150 }),
      stop('dinner', BAKERY, { startTime: '21:00', durationMinutes: 90 }),
    ];
    const plan = planDay(input(stops));
    expect(plan.before.warnings.some((warning) => warning.kind === 'overloaded')).toBe(true);
    expect(plan.moves.length).toBeGreaterThan(0);
    for (const move of plan.moves) {
      expect(move.reason).toBe('overloaded');
      expect(['met', 'breakfast', 'dinner']).not.toContain(move.stopId);
    }
    // The lightest day takes the first one.
    expect(plan.moves[0]?.toDay).toBe('2026-11-25');
    const after = applySuggestions(stops, HOTEL, { order: plan.order?.order ?? null, moves: plan.moves, retimes: [] });
    expect(after.check.visitMinutes + after.check.travelMinutes).toBeLessThanOrEqual(OVERLOADED_MIN);
    // Nothing disappears: every visit is either still here or suggested for another day.
    expect(after.stops.length + plan.moves.length).toBe(stops.length);
  });

  it('a time the user set before opening gets an opt-in new time, never a silent change', () => {
    const stops = [stop('met', MET, { startTime: '09:00', hours: [at('10:00', '17:00')] })];
    const plan = planDay(input(stops));
    expect(plan.retimes).toEqual([{ stopId: 'met', from: '09:00', to: '10:00', reason: 'opensAt' }]);
    expect(plan.order).toBeNull();
    // Without choosing it, the user's time stays.
    expect(applySuggestions(stops, HOTEL, { order: null, moves: [], retimes: [] }).stops[0]?.startTime).toBe('09:00');
  });

  it('says when hours or locations are unknown instead of guessing', () => {
    const plan = planDay(input([stop('a', MOMA, { hours: null }), stop('b', null)]));
    expect(plan.problems).toEqual(expect.arrayContaining([{ kind: 'hoursUnknown', count: 1 }, { kind: 'locationUnknown', count: 1 }]));
    expect(plan.moves).toEqual([]);
  });
});

describe('applying the chosen suggestions', () => {
  it('times flexible visits after travel plus a buffer, and waits for opening time', () => {
    const stops = [stop('moma', MOMA, { startTime: '09:30' }), stop('met', MET, { hours: [at('11:00', '17:00')] })];
    const result = applySuggestions(stops, HOTEL, { order: null, moves: [], retimes: [] });
    expect(result.times.get('met')).toBe('11:00');
    const open = applySuggestions([stops[0]!, stop('zoo', ZOO)], HOTEL, { order: null, moves: [], retimes: [] });
    // 09:30 + 60 min + a few minutes' walk + 5 min buffer.
    expect(toMinutes(open.times.get('zoo')!)).toBeGreaterThanOrEqual(toMinutes('10:35'));
  });

  it('estimates another day’s load without lookups', () => {
    expect(estimateDayLoad([60, 90])).toBe(60 + 90 + 40);
  });
});
