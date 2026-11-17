import type { LatLng } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import {
  checkDay,
  DEFAULT_DAY_START_MIN,
  optimizeOrder,
  projectDay,
  routeMinutes,
  suggestTimes,
  toMinutes,
  UNKNOWN_TRAVEL_MIN,
  type PlanStop,
} from './day-planner';

const HOTEL: LatLng = { latitude: 40.7577, longitude: -73.9857 }; // Times Square
const MOMA: LatLng = { latitude: 40.7614, longitude: -73.9776 };
const ZOO: LatLng = { latitude: 40.7678, longitude: -73.9718 };
const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 };
const CHELSEA: LatLng = { latitude: 40.7424, longitude: -74.006 };
const BRIDGE: LatLng = { latitude: 40.7061, longitude: -73.9969 };

const stop = (id: string, location: LatLng | null, extra: Partial<PlanStop> = {}): PlanStop => ({
  id,
  startTime: null,
  durationMinutes: 60,
  location,
  visited: false,
  ...extra,
});

describe('checkDay: summary and warnings', () => {
  it('sums visits and travel and projects start and end', () => {
    const result = checkDay([stop('moma', MOMA, { startTime: '10:00' }), stop('met', MET)], HOTEL);
    expect(result.stops).toBe(2);
    expect(result.visitMinutes).toBe(120);
    expect(result.travelMinutes).toBeGreaterThan(0);
    expect(result.startsAt).toBe(600);
    expect(result.endsAt).toBeGreaterThan(11 * 60);
    expect(result.warnings).toEqual([]);
  });

  it('warns when a timed stop starts before you can get there', () => {
    const result = checkDay(
      [stop('bridge', BRIDGE, { startTime: '10:00', durationMinutes: 90 }), stop('met', MET, { startTime: '11:30' })],
      HOTEL,
    );
    const tight = result.warnings.find((warning) => warning.kind === 'tight');
    expect(tight && 'stopId' in tight ? tight.stopId : null).toBe('met');
    expect(tight && 'lateBy' in tight ? tight.lateBy : 0).toBeGreaterThan(10);
  });

  it('warns about times out of order, long legs, a late end and an overloaded day', () => {
    const result = checkDay(
      [
        stop('met', MET, { startTime: '15:00', durationMinutes: 240 }),
        stop('moma', MOMA, { startTime: '11:00' }),
        stop('bridge', BRIDGE, { durationMinutes: 300 }),
        stop('chelsea', CHELSEA, { durationMinutes: 330 }),
      ],
      HOTEL,
    );
    const kinds = result.warnings.map((warning) => warning.kind);
    expect(kinds).toContain('outOfOrder');
    expect(kinds).toContain('lateEnd');
    expect(kinds).toContain('overloaded');
  });

  it('counts legs without a location and uses a default for them', () => {
    const result = checkDay([stop('a', MOMA), stop('mystery', null), stop('b', MET)], HOTEL);
    expect(result.unknownLegs).toBe(2);
    expect(projectDay([stop('a', MOMA), stop('mystery', null)], HOTEL)[1]?.travel?.minutes).toBe(UNKNOWN_TRAVEL_MIN);
  });
});

describe('optimizeOrder', () => {
  it('suggests a shorter order for a zig-zag day and says how much it saves', () => {
    const day = [stop('bridge', BRIDGE), stop('met', MET), stop('chelsea', CHELSEA), stop('moma', MOMA), stop('zoo', ZOO)];
    const proposal = optimizeOrder(day, HOTEL);
    expect(proposal).not.toBeNull();
    expect(proposal?.saved).toBeGreaterThanOrEqual(5);
    expect(proposal?.travelAfter).toBeLessThan(proposal?.travelBefore ?? 0);
    expect([...(proposal?.order ?? [])].sort()).toEqual(['bridge', 'chelsea', 'met', 'moma', 'zoo']);
    // Midtown/uptown stops end up together, not split by a trip downtown.
    const order = proposal?.order ?? [];
    expect(Math.abs(order.indexOf('moma') - order.indexOf('zoo'))).toBe(1);
  });

  it('keeps timed, done and unlocated stops in their order, moving only the rest', () => {
    const day = [
      stop('done', BRIDGE, { visited: true }),
      stop('met', MET),
      stop('lunch', CHELSEA, { startTime: '13:00' }),
      stop('unknown', null),
      stop('moma', MOMA),
    ];
    const proposal = optimizeOrder(day, HOTEL);
    const order = proposal?.order ?? day.map((item) => item.id);
    const fixed = order.filter((id) => ['done', 'lunch', 'unknown'].includes(id));
    expect(fixed).toEqual(['done', 'lunch', 'unknown']);
    expect(order).toHaveLength(5);
  });

  it('returns nothing when the order is already good', () => {
    expect(optimizeOrder([stop('moma', MOMA), stop('zoo', ZOO), stop('met', MET)], HOTEL)).toBeNull();
  });

  it('does not squeeze a visit into a gap between timed stops that is too short', () => {
    const day = [
      stop('moma', MOMA, { startTime: '10:00' }),
      stop('zoo', ZOO, { startTime: '11:10' }),
      stop('met', MET),
      stop('chelsea', CHELSEA),
      stop('bridge', BRIDGE),
    ];
    const proposal = optimizeOrder(day, HOTEL);
    const order = proposal?.order ?? day.map((item) => item.id);
    // Nothing (60 min visit + travel) fits between 11:00 (MoMA ends) and 11:10.
    expect(order.indexOf('zoo')).toBe(order.indexOf('moma') + 1);
  });

  it('measures routes from the hotel', () => {
    expect(routeMinutes([stop('moma', MOMA)], HOTEL)).toBeGreaterThan(0);
    expect(routeMinutes([stop('moma', MOMA)], null)).toBe(0);
  });
});

describe('suggestTimes', () => {
  it('fills only flexible stops that are not done, and never changes the user’s times', () => {
    const day = [
      stop('moma', MOMA, { startTime: '10:00', durationMinutes: 90 }),
      stop('zoo', ZOO),
      stop('met', MET, { visited: true }),
      stop('lunch', CHELSEA, { startTime: '15:00' }),
      stop('bridge', BRIDGE),
    ];
    const times = suggestTimes(day, HOTEL);
    expect([...times.keys()].sort()).toEqual(['bridge', 'zoo']);
    const zoo = toMinutes(times.get('zoo') ?? '00:00');
    expect(zoo).toBeGreaterThanOrEqual(11 * 60 + 30);
    expect(zoo % 5).toBe(0);
    expect(toMinutes(times.get('bridge') ?? '00:00')).toBeGreaterThan(16 * 60);
  });

  it('starts a day with nothing timed at the default start', () => {
    const times = suggestTimes([stop('moma', MOMA), stop('zoo', ZOO)], HOTEL);
    expect(times.get('moma')).toBe('09:30');
    expect(toMinutes(times.get('zoo') ?? '00:00')).toBeGreaterThan(DEFAULT_DAY_START_MIN + 60);
  });
});
