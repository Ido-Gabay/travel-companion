import type { LatLng } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { OVERLOADED_MIN, toMinutes, type PlanStop } from './day-planner';
import type { OpenWindow } from './opening-hours';
import { completePlan, orderKey, retimeKey, timesKey } from './complete-plan';
import { planTrip, type TripPlanDay, type TripPlanInput } from './trip-plan';

const HOTEL: LatLng = { latitude: 40.7577, longitude: -73.9857 };
const MOMA: LatLng = { latitude: 40.7614, longitude: -73.9776 };
const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 };
const GUGG: LatLng = { latitude: 40.783, longitude: -73.959 };
const WTC: LatLng = { latitude: 40.7115, longitude: -74.0134 };
const BATTERY: LatLng = { latitude: 40.7033, longitude: -74.017 };
const D1 = '2026-11-23';
const D2 = '2026-11-24';
const D3 = '2026-11-25';

const stop = (id: string, location: LatLng | null, extra: Partial<PlanStop> = {}): PlanStop => ({
  id,
  startTime: null,
  durationMinutes: 90,
  location,
  visited: false,
  ...extra,
});
const day = (id: string, stops: PlanStop[] = [], extra: Partial<TripPlanDay> = {}): TripPlanDay => ({
  day: id,
  start: HOTEL,
  stops,
  capacityMinutes: OVERLOADED_MIN,
  available: true,
  ...extra,
});
const at = (open: string, close: string): OpenWindow => ({ open: toMinutes(open), close: toMinutes(close) });
function input(days: TripPlanDay[], wishlist: PlanStop[], hours: Record<string, Record<string, OpenWindow[] | null>> = {}): TripPlanInput {
  return { days, wishlist, windowsOn: (id, onDay) => hours[id]?.[onDay] };
}
const run = (value: TripPlanInput, choice: Record<string, boolean> = {}) => completePlan(value, planTrip(value), choice);

describe('complete trip plan', () => {
  it('puts every wishlist place on a day, orders and times each day, with travel and an end time', () => {
    const value = input([day(D1), day(D2)], [stop('met', MET), stop('wtc', WTC), stop('gugg', GUGG), stop('battery', BATTERY)]);
    const plan = run(value);
    const planned = plan.days.flatMap((item) => item.visits.map((visit) => visit.id)).sort();
    expect(planned).toEqual(['battery', 'gugg', 'met', 'wtc']);
    for (const item of plan.days) {
      expect(item.visits.every((visit) => visit.time === 'suggested' && visit.arriving === 'new')).toBe(true);
      // Starts after the previous visit + travel; travel from the stay first.
      item.visits.forEach((visit, index) => {
        expect(visit.travel).not.toBeNull();
        const previous = item.visits[index - 1];
        if (previous) expect(visit.start).toBeGreaterThanOrEqual(previous.end + (visit.travel?.minutes ?? 0));
      });
      expect(item.check.endsAt).toBe(item.visits.at(-1)?.end);
    }
    // New visits are created with their time; nothing else to send for them.
    expect(plan.apply.adds).toHaveLength(4);
    expect(plan.apply.adds.every((add) => add.startTime !== null)).toBe(true);
    expect(plan.apply.times).toEqual([]);
  });

  it("keeps the user's own times, done, starred and happening-now visits as they are", () => {
    const value = input(
      [
        day(D1, [
          stop('done', GUGG, { visited: true, startTime: '09:00' }),
          stop('dinner', MOMA, { startTime: '19:00' }),
          stop('star', MET, { priority: true }),
          stop('now', MET, { pinned: true }),
        ]),
      ],
      [stop('wtc', WTC)],
    );
    const plan = run(value);
    const d1 = plan.days[0];
    expect(d1?.visits.find((visit) => visit.id === 'dinner')).toMatchObject({ time: 'yours', start: toMinutes('19:00') });
    expect(plan.apply.times.map((item) => item.stopId)).not.toContain('dinner');
    expect(plan.apply.times.map((item) => item.stopId)).not.toContain('done');
    expect(plan.apply.times.map((item) => item.stopId)).not.toContain('now');
    expect(plan.apply.moves).toEqual([]);
  });

  it('turning off a new place re-plans its day without it', () => {
    const value = input([day(D1)], [stop('met', MET), stop('gugg', GUGG)]);
    const plan = run(value, { 'add:gugg': false });
    expect(plan.days[0]?.visits.map((visit) => visit.id)).toEqual(['met']);
    expect(plan.apply.adds.map((add) => add.tripPlaceId)).toEqual(['met']);
  });

  it('times off for a day: shown as estimates and not saved', () => {
    const value = input([day(D1, [stop('a', MOMA), stop('b', MET)])], []);
    const plan = run(value, { [timesKey(D1)]: false });
    expect(plan.days[0]?.visits.every((visit) => visit.time === 'approx')).toBe(true);
    expect(plan.apply.times).toEqual([]);
    expect(run(value).apply.times).toHaveLength(2);
  });

  it('uses checked opening hours for times and says which hours are checked', () => {
    const value = input([day(D1)], [stop('met', MET), stop('gugg', GUGG)], {
      met: { [D1]: [at('11:00', '17:00')] },
      gugg: { [D1]: null },
    });
    const visits = run(value).days[0]?.visits ?? [];
    expect(visits.find((visit) => visit.id === 'met')?.start).toBeGreaterThanOrEqual(toMinutes('11:00'));
    expect(visits.find((visit) => visit.id === 'met')?.hours).toBe('checked');
    expect(visits.find((visit) => visit.id === 'gugg')?.hours).toBe('unknown');
  });

  it('today: suggested times start after now; days already over are shown but not planned', () => {
    const value = input(
      [day(D1, [stop('old', MET, { visited: true })], { available: false, capacityMinutes: 0 }), day(D2, [], { dayStart: toMinutes('15:00') })],
      [stop('moma', MOMA)],
    );
    const plan = run(value);
    expect(plan.days.map((item) => item.day)).toEqual([D1, D2]);
    expect(plan.days[0]).toMatchObject({ status: 'past', order: null, timesCount: 0 });
    expect(plan.days[1]?.visits[0]?.start).toBeGreaterThanOrEqual(toMinutes('15:00'));
  });

  it('a better order is on by default, can be turned off, and is sent with new visits under their saved-place id', () => {
    const value = input([day(D1, [stop('battery', BATTERY), stop('met', MET), stop('wtc', WTC)])], [stop('gugg', GUGG)]);
    const plan = run(value);
    expect(plan.days[0]?.order).not.toBeNull();
    const order = plan.apply.orders[0]?.ids ?? [];
    expect(Math.abs(order.indexOf('met') - order.indexOf('gugg'))).toBe(1);
    expect(Math.abs(order.indexOf('wtc') - order.indexOf('battery'))).toBe(1);
    expect(run(value, { [orderKey(D1)]: false }).apply.orders).toEqual([]);
  });

  it("a new time for the user's own time is only ever opt-in", () => {
    const value = input([day(D1, [stop('met', MET, { startTime: '08:00' })])], [], { met: { [D1]: [at('10:00', '17:00')] } });
    const plan = run(value);
    expect(plan.days[0]?.retimes).toEqual([{ stopId: 'met', from: '08:00', to: '10:00', reason: 'opensAt' }]);
    expect(plan.apply.times).toEqual([]);
    expect(run(value, { [retimeKey('met')]: true }).apply.times).toEqual([{ stopId: 'met', startTime: '10:00' }]);
  });

  it('a visit moved off an overloaded day arrives timed on its new day', () => {
    const value = input(
      [day(D1, [stop('star', MET, { priority: true, durationMinutes: 420 }), stop('flex', WTC, { durationMinutes: 300 })]), day(D2), day(D3)],
      [],
    );
    const plan = run(value);
    expect(plan.apply.moves).toHaveLength(1);
    const move = plan.apply.moves[0];
    const target = plan.days.find((item) => item.day === move?.day);
    expect(target?.visits.find((visit) => visit.id === 'flex')).toMatchObject({ arriving: 'moved', time: 'suggested' });
    expect(plan.apply.times.map((item) => item.stopId)).toContain('flex');
    expect(plan.days[0]?.status).not.toBe('overloaded');
  });
});
