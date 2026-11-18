import { describe, expect, it } from 'vitest';
import { computeToday, toMinutes, type EngineStop, type TodayInput } from './today-engine';
import { buildTodayMap, locationAge, originPoint, LOCATION_STALE_MS } from './today-map';
import { MAX_ESTIMATE_METERS, isUsableLatLng, reliableTravel } from './travel';

const HOTEL = { latitude: 40.7577, longitude: -73.9857 };
const MOMA = { latitude: 40.7614, longitude: -73.9776 };
const BRYANT = { latitude: 40.7536, longitude: -73.9832 };
const MET = { latitude: 40.7794, longitude: -73.9632 };
const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818 };

function stop(id: string, extra: Partial<EngineStop> = {}): EngineStop {
  return { id, name: id, category: 'sights', startTime: null, durationMinutes: 60, visited: false, location: MOMA, ...extra };
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

describe('reliable travel', () => {
  it('rejects invalid coordinates', () => {
    expect(isUsableLatLng({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isUsableLatLng({ latitude: Number.NaN, longitude: 1 })).toBe(false);
    expect(isUsableLatLng({ latitude: 91, longitude: 1 })).toBe(false);
    expect(isUsableLatLng(null)).toBe(false);
    expect(isUsableLatLng(MOMA)).toBe(true);
    expect(reliableTravel({ latitude: 0, longitude: 0 }, MOMA)).toBeNull();
    expect(reliableTravel(null, MOMA)).toBeNull();
  });

  it('rejects distances no day hop could have', () => {
    expect(reliableTravel(HOTEL, TEL_AVIV)).toBeNull();
    const ok = reliableTravel(HOTEL, MET);
    expect(ok).not.toBeNull();
    expect(ok!.meters).toBeLessThan(MAX_ESTIMATE_METERS);
  });

  it('the engine shows no travel (unavailable) instead of a wrong one', () => {
    const result = computeToday(
      input({ stops: [stop('a', { startTime: '12:00', location: { latitude: 0, longitude: 0 } })] }),
    );
    expect(result.next?.stop.id).toBe('a');
    expect(result.next?.travel).toBeNull();
    expect(result.next?.origin).toBeNull();
    // No made-up leave time, and so no free-time window built on it.
    expect(result.next?.leaveBy).toBeNull();
    expect(result.free).toBeNull();
  });
});

describe('today map model', () => {
  it('marks done, next and later pins in day order', () => {
    const result = computeToday(
      input({ stops: [stop('a', { visited: true, location: BRYANT }), stop('b', { location: MOMA }), stop('c', { location: MET })] }),
    );
    const model = buildTodayMap(result, null, HOTEL);
    expect(model.pins.map((pin) => [pin.id, pin.number, pin.kind])).toEqual([
      ['a', 1, 'done'],
      ['b', 2, 'next'],
      ['c', 3, 'later'],
    ]);
    // Next leg starts at the last done stop.
    expect(model.nextLeg).toEqual([BRYANT, MOMA]);
    expect(model.laterPath).toEqual([MOMA, MET]);
    expect(model.unmapped).toBe(0);
  });

  it('leaves stops without a usable location off the map and draws no next leg to them', () => {
    const result = computeToday(input({ stops: [stop('a', { location: null }), stop('b', { location: MET })] }));
    const model = buildTodayMap(result, null, HOTEL);
    expect(model.pins.map((pin) => pin.id)).toEqual(['b']);
    expect(model.unmapped).toBe(1);
    expect(model.nextLeg).toBeNull();
    expect(model.laterPath).toEqual([]);
  });

  it('measures the next leg from the user when the location is used', () => {
    const result = computeToday(input({ stops: [stop('a', { location: MET })], here: BRYANT }));
    expect(originPoint(result, BRYANT, HOTEL)).toEqual(BRYANT);
    expect(buildTodayMap(result, BRYANT, HOTEL).nextLeg).toEqual([BRYANT, MET]);
  });

  it('frames the hotel when no stop can be drawn', () => {
    const result = computeToday(input({ stops: [] }));
    expect(buildTodayMap(result, null, HOTEL).frame).toEqual([HOTEL]);
  });
});

describe('location age', () => {
  it('turns stale after two minutes', () => {
    expect(locationAge(1_000, 1_000 + LOCATION_STALE_MS).stale).toBe(false);
    expect(locationAge(1_000, 1_000 + LOCATION_STALE_MS + 1).stale).toBe(true);
    expect(locationAge(0, 12 * 60_000).minutes).toBe(12);
  });
});
