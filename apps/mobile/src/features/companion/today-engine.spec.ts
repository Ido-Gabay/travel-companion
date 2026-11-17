import { describe, expect, it } from 'vitest';
import { computeToday, orderWithInserted, roundUpTo5, toClock, toMinutes, type Candidate, type EngineStop, type TodayInput } from './today-engine';
import { estimateTravel } from './travel';

// Midtown Manhattan points (approximate).
const HOTEL = { latitude: 40.7577, longitude: -73.9857 }; // Times Square
const MOMA = { latitude: 40.7614, longitude: -73.9776 }; // ~0.8 km from Times Square
const BRYANT = { latitude: 40.7536, longitude: -73.9832 }; // ~0.5 km
const CHELSEA = { latitude: 40.7424, longitude: -74.0061 }; // ~2.4 km
const BROOKLYN = { latitude: 40.6782, longitude: -73.9442 }; // ~9.5 km
const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818 };

function stop(id: string, extra: Partial<EngineStop> = {}): EngineStop {
  return { id, name: id, category: 'sights', startTime: null, durationMinutes: 60, visited: false, location: MOMA, ...extra };
}

function candidate(id: string, extra: Partial<Candidate> = {}): Candidate {
  return { id, name: id, category: 'coffee', durationMinutes: null, location: BRYANT, source: 'wishlist', ...extra };
}

function input(extra: Partial<TodayInput>): TodayInput {
  return {
    stops: [],
    nowMinutes: toMinutes('10:00'),
    here: null,
    hotel: HOTEL,
    candidates: [],
    dismissed: new Set(),
    hasTomorrow: true,
    ...extra,
  };
}

describe('travel estimate', () => {
  it('walks short distances and rides long ones', () => {
    const short = estimateTravel(HOTEL, MOMA);
    expect(short.mode).toBe('walk');
    expect(short.minutes).toBeGreaterThanOrEqual(10);
    expect(short.minutes).toBeLessThanOrEqual(16);
    const long = estimateTravel(HOTEL, BROOKLYN);
    expect(long.mode).toBe('transit');
    expect(long.minutes).toBeLessThan(Math.round(long.meters / 80));
  });
});

describe('clock helpers', () => {
  it('converts and rounds', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toClock(570)).toBe('09:30');
    expect(toClock(-5)).toBe('00:00');
    expect(roundUpTo5(571)).toBe(575);
    expect(roundUpTo5(575)).toBe(575);
  });
});

describe('accepting "add to today"', () => {
  it('puts the place right after the given stop, or first', () => {
    expect(orderWithInserted(['a', 'b', 'x'], 'x', 'a')).toEqual(['a', 'x', 'b']);
    expect(orderWithInserted(['a', 'b', 'x'], 'x', null)).toEqual(['x', 'a', 'b']);
    expect(orderWithInserted(['a', 'b', 'x'], 'x', 'b')).toEqual(['a', 'b', 'x']);
    expect(orderWithInserted(['a', 'x'], 'x', 'gone')).toEqual(['x', 'a']);
  });
});

describe('where am I in my day', () => {
  it('marks done, next and later stops and counts progress', () => {
    const result = computeToday(
      input({ stops: [stop('a', { visited: true }), stop('b'), stop('c', { location: BRYANT })] }),
    );
    expect(result.timeline.map((item) => item.status)).toEqual(['done', 'next', 'later']);
    expect(result.done).toBe(1);
    expect(result.total).toBe(3);
    expect(result.dayEndsAt).not.toBeNull();
  });

  it('knows the user is at a stop when standing next to it', () => {
    const result = computeToday(input({ stops: [stop('a'), stop('b', { location: BRYANT })], here: MOMA }));
    expect(result.current?.stop.id).toBe('a');
    expect(result.next?.stop.id).toBe('b');
    expect(result.next?.origin).toBe('current');
  });

  it('ignores a phone location far from the trip', () => {
    const result = computeToday(input({ stops: [stop('a')], here: TEL_AVIV }));
    expect(result.hereIgnored).toBe(true);
    expect(result.next?.origin).toBe('hotel');
  });
});

describe("what's next and when to leave", () => {
  it('computes the leave-by time from the start time, travel and a buffer', () => {
    const result = computeToday(input({ stops: [stop('moma', { startTime: '11:00' })], nowMinutes: toMinutes('10:00') }));
    const travel = estimateTravel(HOTEL, MOMA).minutes;
    expect(result.next?.leaveBy).toBe(toMinutes('11:00') - travel - 5);
    expect(result.next?.lateBy).toBe(0);
  });

  it('has no leave-by for a flexible stop, but still a travel estimate', () => {
    const result = computeToday(input({ stops: [stop('moma')] }));
    expect(result.next?.leaveBy).toBeNull();
    expect(result.next?.travel?.mode).toBe('walk');
  });

  it('measures from the last finished stop when location is off', () => {
    const result = computeToday(input({ stops: [stop('a', { visited: true, location: CHELSEA }), stop('b')], hotel: null }));
    expect(result.next?.origin).toBe('previous');
  });
});

describe('free time and suggestions', () => {
  it('finds the gap before the next timed stop and suggests wishlist places that fit', () => {
    const result = computeToday(
      input({
        stops: [stop('moma', { startTime: '13:00' })],
        nowMinutes: toMinutes('10:00'),
        candidates: [
          candidate('far-collection', { source: 'collection', location: BRYANT }),
          candidate('near-wishlist', { location: BRYANT }),
          candidate('brooklyn', { location: BROOKLYN, durationMinutes: 120 }),
          candidate('no-location', { location: null }),
        ],
      }),
    );
    expect(result.free?.minutes).toBeGreaterThan(150);
    expect(result.free?.untilStopId).toBe('moma');
    expect(result.suggestions.map((s) => s.candidate.id)).toEqual(['near-wishlist', 'far-collection']);
    expect(result.suggestions.every((s) => s.fits)).toBe(true);
    expect(result.suggestions[0]?.action).toEqual({
      type: 'addToday',
      placeId: 'near-wishlist',
      source: 'wishlist',
      afterStopId: null,
    });
  });

  it('suggests nothing that does not fit a short gap', () => {
    const result = computeToday(
      input({
        stops: [stop('moma', { startTime: '10:45' })],
        nowMinutes: toMinutes('10:00'),
        candidates: [candidate('cafe', { durationMinutes: 45 })],
      }),
    );
    expect(result.free).not.toBeNull();
    expect(result.suggestions).toEqual([]);
  });

  it('offers nearby ideas for the rest of the day once the plan is done', () => {
    const result = computeToday(
      input({
        stops: [stop('a', { visited: true, location: HOTEL })],
        nowMinutes: toMinutes('17:00'),
        candidates: [candidate('cafe'), candidate('brooklyn', { location: BROOKLYN })],
      }),
    );
    expect(result.free?.untilStopId).toBeNull();
    expect(result.suggestions.map((s) => s.candidate.id)).toEqual(['cafe']);
    expect(result.suggestions[0]?.action).toMatchObject({ type: 'addToday', afterStopId: 'a' });
  });

  it('never suggests places already in the plan or dismissed', () => {
    const result = computeToday(
      input({
        stops: [stop('moma', { startTime: '15:00' })],
        candidates: [candidate('moma'), candidate('cafe'), candidate('dismissed')],
        dismissed: new Set(['sug:dismissed']),
      }),
    );
    expect(result.suggestions.map((s) => s.candidate.id)).toEqual(['cafe']);
  });
});

describe('should I change my plan', () => {
  it('flags running late and proposes a later start or moving it to tomorrow', () => {
    const result = computeToday(
      input({ stops: [stop('moma', { startTime: '10:00' })], nowMinutes: toMinutes('10:20'), here: CHELSEA }),
    );
    const hint = result.hints[0];
    expect(hint?.kind).toBe('late');
    expect(hint?.kind === 'late' && hint.lateBy).toBeGreaterThanOrEqual(10);
    expect(hint?.actions[0]?.type).toBe('shiftStart');
    const shift = hint?.actions[0];
    expect(shift?.type === 'shiftStart' && toMinutes(shift.startTime) % 5).toBe(0);
    expect(hint?.actions[1]).toEqual({ type: 'moveToTomorrow', stopId: 'moma' });
  });

  it('on the last day, offers removing from the day instead of tomorrow', () => {
    const result = computeToday(
      input({ stops: [stop('moma', { startTime: '10:00' })], nowMinutes: toMinutes('10:30'), hasTomorrow: false }),
    );
    expect(result.hints[0]?.actions[1]).toEqual({ type: 'removeFromDay', stopId: 'moma' });
  });

  it('is quiet when on time, and respects dismissals', () => {
    expect(computeToday(input({ stops: [stop('moma', { startTime: '12:00' })] })).hints).toEqual([]);
    const late = input({ stops: [stop('moma', { startTime: '10:00' })], nowMinutes: toMinutes('10:30') });
    expect(computeToday(late).hints).toHaveLength(1);
    expect(computeToday({ ...late, dismissed: new Set(['late:moma']) }).hints).toEqual([]);
  });

  it('warns when the plan runs past 23:00', () => {
    const result = computeToday(
      input({
        stops: [stop('a', { startTime: '21:00', durationMinutes: 120 }), stop('b', { durationMinutes: 90 })],
        nowMinutes: toMinutes('20:00'),
      }),
    );
    const over = result.hints.find((hint) => hint.kind === 'overbooked');
    expect(over?.stopId).toBe('b');
    expect(over?.actions[0]).toEqual({ type: 'moveToTomorrow', stopId: 'b' });
  });

  it('never changes the input', () => {
    const stops = [stop('moma', { startTime: '10:00' })];
    const frozen = JSON.stringify(stops);
    computeToday(input({ stops, nowMinutes: toMinutes('11:00') }));
    expect(JSON.stringify(stops)).toBe(frozen);
  });
});
