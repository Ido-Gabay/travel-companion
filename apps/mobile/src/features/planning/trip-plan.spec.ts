import type { LatLng } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { OVERLOADED_MIN, toMinutes, type PlanStop } from './day-planner';
import type { OpenWindow } from './opening-hours';
import { bestPosition, compareDays, dayCapacity, HOTEL_CHANGE_MIN, planTrip, tripAfter, type TripPlanDay, type TripPlanInput } from './trip-plan';

const HOTEL: LatLng = { latitude: 40.7577, longitude: -73.9857 }; // Times Square
const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 };
const GUGG: LatLng = { latitude: 40.783, longitude: -73.959 };
const FRICK: LatLng = { latitude: 40.7712, longitude: -73.9673 };
const WTC: LatLng = { latitude: 40.7115, longitude: -74.0134 };
const BATTERY: LatLng = { latitude: 40.7033, longitude: -74.017 };
const WALLST: LatLng = { latitude: 40.7069, longitude: -74.0113 };
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
const added = (plan: ReturnType<typeof planTrip>) =>
  Object.fromEntries(plan.changes.filter((change) => change.cause === 'wishlist').map((change) => [change.itemId, change.toDay]));

describe('trip plan: wishlist across days', () => {
  it('groups nearby places on the same day and keeps distant areas apart', () => {
    const plan = planTrip(
      input([day(D1), day(D2)], [stop('met', MET), stop('wtc', WTC), stop('gugg', GUGG), stop('battery', BATTERY)]),
    );
    const days = added(plan);
    expect(Object.keys(days)).toHaveLength(4);
    expect(days.met).toBe(days.gugg);
    expect(days.wtc).toBe(days.battery);
    expect(days.met).not.toBe(days.wtc);
    const gugg = plan.changes.find((change) => change.itemId === 'gugg' || change.itemId === 'met');
    expect(gugg?.why.some((why) => why.kind === 'near')).toBe(true);
  });

  it('adds to the day already in that area', () => {
    const plan = planTrip(input([day(D1, [stop('wtc', WTC)]), day(D2, [stop('met', MET)])], [stop('frick', FRICK), stop('wall', WALLST)]));
    expect(added(plan)).toEqual({ frick: D2, wall: D1 });
  });

  it('spreads the load and never fills a day past its available time', () => {
    const wishlist = Array.from({ length: 9 }, (_, index) =>
      stop(`p${index}`, { latitude: 40.758 + index * 0.001, longitude: -73.985 }, { durationMinutes: 120 }),
    );
    const plan = planTrip(input([day(D1), day(D2), day(D3)], wishlist));
    const after = tripAfter(plan && input([day(D1), day(D2), day(D3)], wishlist), plan.changes.filter((change) => change.defaultOn));
    for (const report of after.reports) expect(report.loadMinutes).toBeLessThanOrEqual(report.capacityMinutes);
    expect(after.reports.every((report) => report.visits >= 2)).toBe(true);
  });

  it("doesn't place what has no room; offers the least-overfilling day as an opt-in", () => {
    const plan = planTrip(input([day(D1, [], { capacityMinutes: 200 })], [stop('a', MET, { durationMinutes: 150 }), stop('b', GUGG, { durationMinutes: 150 })]));
    expect(plan.unplaced).toEqual([{ id: 'b', reason: 'noRoom' }]);
    const alternative = plan.changes.find((change) => change.cause === 'alternative');
    expect(alternative).toMatchObject({ itemId: 'b', toDay: D1, defaultOn: false });
    expect(alternative?.why[0]).toMatchObject({ kind: 'overBy' });
  });
});

describe('trip plan: opening hours and constraints', () => {
  it('puts a place on a day it is open, and says why', () => {
    const plan = planTrip(input([day(D1), day(D2)], [stop('met', MET)], { met: { [D1]: [], [D2]: [at('10:00', '17:00')] } }));
    const change = plan.changes.find((item) => item.itemId === 'met');
    expect(change?.toDay).toBe(D2);
    expect(change?.why[0]).toEqual({ kind: 'openThatDay', closedDays: 1 });
  });

  it('keeps a place closed on every trip day on the wishlist', () => {
    const plan = planTrip(input([day(D1), day(D2)], [stop('met', MET)], { met: { [D1]: [], [D2]: [] } }));
    expect(plan.changes).toEqual([]);
    expect(plan.unplaced).toEqual([{ id: 'met', reason: 'closedAllDays' }]);
  });

  it('unknown hours never block a place, and are counted', () => {
    const plan = planTrip(input([day(D1)], [stop('met', MET), stop('pin', null)], { met: { [D1]: null } }));
    expect(Object.keys(added(plan)).sort()).toEqual(['met', 'pin']);
    expect(plan.missing).toEqual({ hoursNotChecked: 1, hoursUnknown: 1, locationUnknown: 1 });
  });

  it('on an overloaded day moves only a flexible visit, never timed, done, starred or happening-now ones', () => {
    const stops = [
      stop('timed', MET, { startTime: '10:00', durationMinutes: 180 }),
      stop('done', GUGG, { visited: true, durationMinutes: 60 }),
      stop('starred', FRICK, { priority: true, durationMinutes: 180 }),
      stop('now', MET, { pinned: true, durationMinutes: 120 }),
      stop('flex', WTC, { durationMinutes: 240 }),
    ];
    const plan = planTrip(input([day(D1, stops), day(D2, [stop('battery', BATTERY)])], []));
    expect(plan.before[0]?.status).toBe('overloaded');
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ kind: 'move', itemId: 'flex', fromDay: D1, toDay: D2, cause: 'overloaded', defaultOn: true });
  });

  it('moves a flexible visit off a day it is closed', () => {
    const plan = planTrip(input([day(D1, [stop('met', MET)]), day(D2)], [], { met: { [D1]: [], [D2]: [at('10:00', '17:00')] } }));
    expect(plan.changes[0]).toMatchObject({ itemId: 'met', toDay: D2, cause: 'closed', why: [{ kind: 'closedOn', day: D1 }] });
  });

  it('never adds to a day that is over', () => {
    const past = dayCapacity({ day: D1, today: D2, nowMinutes: 9 * 60, hotelChange: false });
    expect(past).toEqual({ capacityMinutes: 0, available: false });
    const plan = planTrip(input([day(D1, [], past), day(D2)], [stop('met', MET)]));
    expect(added(plan)).toEqual({ met: D2 });
  });

  it('suggests (off by default) a visit placed far from the rest of its day for a day in that area', () => {
    const plan = planTrip(
      input([day(D1, [stop('met', MET), stop('wtc', WTC), stop('gugg', GUGG)]), day(D2, [stop('battery', BATTERY)])], []),
    );
    const area = plan.changes.find((change) => change.cause === 'area');
    expect(area).toMatchObject({ itemId: 'wtc', fromDay: D1, toDay: D2, defaultOn: false });
    expect(area?.why[0]?.kind).toBe('savesTravel');
  });
});

describe('available time and day reports', () => {
  it('a hotel change and the rest of today shorten the day', () => {
    expect(dayCapacity({ day: D2, today: D1, nowMinutes: null, hotelChange: true }).capacityMinutes).toBe(OVERLOADED_MIN - HOTEL_CHANGE_MIN);
    expect(dayCapacity({ day: D1, today: D1, nowMinutes: 18 * 60, hotelChange: false }).capacityMinutes).toBe(4 * 60);
  });

  it('reports overloaded, unused and past days, before and after the chosen changes', () => {
    const days = [
      day(D1, [], { available: false, capacityMinutes: 0 }),
      day(D2, [stop('a', MET, { durationMinutes: 400 }), stop('b', GUGG, { durationMinutes: 300 })]),
      day(D3),
    ];
    const plan = planTrip(input(days, []));
    expect(plan.before.map((report) => report.status)).toEqual(['past', 'overloaded', 'unused']);
    const after = tripAfter(input(days, []), plan.changes);
    expect(after.reports[1]?.status).not.toBe('overloaded');
    expect(after.reports[2]?.visits).toBe(1);
    // Rejecting the change leaves the trip as it is.
    expect(tripAfter(input(days, []), []).reports.map((report) => report.status)).toEqual(['past', 'overloaded', 'unused']);
  });
});

describe('trip plan: one place the user asked for', () => {
  // D1 is busy uptown, D2 has room downtown, D3 is in the past.
  const days = () => [
    day(D1, [stop('met', MET, { durationMinutes: 240 }), stop('gugg', GUGG, { durationMinutes: 240 }), stop('frick', FRICK, { startTime: '17:30' })]),
    day(D2, [stop('wtc', WTC), stop('wall', WALLST)]),
    day(D3, [], { available: false, capacityMinutes: 0 }),
  ];
  const battery = stop('battery', BATTERY, { durationMinutes: 120 });
  const near = stop('neue', FRICK, { durationMinutes: 300 });

  it('compares every day: fits or too full, travel added, the nearest visit, the best one', () => {
    const options = compareDays(input(days(), []), battery);
    const byDay = Object.fromEntries(options.map((option) => [option.day, option]));
    expect(byDay[D2]).toMatchObject({ fit: 'fits', best: true });
    expect(byDay[D2]?.nearest?.id).toBe('wall');
    expect(byDay[D3]?.fit).toBe('past');
    expect(byDay[D2]?.extraTravel).toBeLessThan(byDay[D1]?.extraTravel ?? 0);
    expect(options.filter((option) => option.best)).toHaveLength(1);
    // Near uptown visits, but uptown is full: D1 is "too full", not suggested.
    const uptown = compareDays(input(days(), []), near);
    expect(uptown.find((option) => option.day === D1)?.fit).toBe('full');
    expect(uptown.find((option) => option.best)?.day).toBe(D2);
  });

  it('closed days are never best', () => {
    const options = compareDays(input(days(), [], { battery: { [D2]: [] } }), battery);
    expect(options.find((option) => option.day === D2)?.fit).toBe('closed');
    expect(options.find((option) => option.best)?.day).not.toBe(D2);
  });

  it('adds it to the best day with room, at the spot that adds the least travel, and moves nothing else', () => {
    const plan = planTrip({ ...input(days(), [battery]), addRequests: [{ stopId: 'battery', toDay: null }] });
    const change = plan.changes.find((item) => item.itemId === 'battery');
    expect(change).toMatchObject({ kind: 'add', toDay: D2, cause: 'request', defaultOn: true });
    expect(plan.changes.filter((item) => item.cause === 'wishlist')).toEqual([]);
    const after = tripAfter({ ...input(days(), [battery]), addRequests: [{ stopId: 'battery', toDay: null }] }, change ? [change] : []);
    expect(after.days.get(D2)?.map((item) => item.id)).toEqual(['wtc', 'wall', 'battery']);
    expect(after.days.get(D1)?.map((item) => item.id)).toEqual(['met', 'gugg', 'frick']);
  });

  it('a named day: used when it has room; when full, not forced (unless the user picks it anyway)', () => {
    const named = planTrip({ ...input(days(), [battery]), addRequests: [{ stopId: 'battery', toDay: D2 }] });
    expect(named.changes.find((item) => item.itemId === 'battery')?.why[0]).toEqual({ kind: 'youAsked' });
    const full = planTrip({ ...input(days(), [near]), addRequests: [{ stopId: 'neue', toDay: D1 }] });
    expect(full.changes.some((item) => item.itemId === 'neue')).toBe(false);
    expect(full.requestsUnmet).toEqual(['neue']);
    const anyway = planTrip({ ...input(days(), [near]), addRequests: [{ stopId: 'neue', toDay: D1, allowOver: true }] });
    const forced = anyway.changes.find((item) => item.itemId === 'neue');
    expect(forced).toMatchObject({ toDay: D1 });
    expect(forced?.why.some((why) => why.kind === 'overBy')).toBe(true);
    // Never into a day in the past.
    expect(planTrip({ ...input(days(), [battery]), addRequests: [{ stopId: 'battery', toDay: D3, allowOver: true }] }).requestsUnmet).toEqual(['battery']);
  });

  it('best position never goes before visits already done', () => {
    const stops = [stop('done', BATTERY, { visited: true }), stop('wtc', WTC)];
    expect(bestPosition(stops, HOTEL, stop('wall', WALLST))).toBeGreaterThanOrEqual(1);
  });
});
