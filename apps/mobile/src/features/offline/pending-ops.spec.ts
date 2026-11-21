import { describe, expect, it } from 'vitest';
import { placesForDay } from '../trips/itinerary';
import { buildTripView } from '../trips/model';
import { applyJournalOps, applyOps, applyVisitedOps, enqueue, pendingPlaceIds, type PendingOp, type StopField, type StopValue } from './pending-ops';
import { memberId, tripDetail, tripPlace, uuid } from './test-fixtures';

const TRIP = uuid(1);
const A = uuid(101);
const B = uuid(102);
const C = uuid(103);
const D1 = '2026-11-23';
const D2 = '2026-11-24';

const trip = () =>
  tripDetail([
    tripPlace(1, { startTime: '10:00' }),
    tripPlace(2, { startTime: '12:00', durationMinutes: 60 }),
    tripPlace(3, { startTime: '15:00' }),
    tripPlace(4, { day: D2, position: 0 }),
    tripPlace(5, { day: null, position: 0 }),
  ]);
const view = (ops: PendingOp[]) => buildTripView(applyOps(trip(), ops));
const visited = (id: string, value: boolean, base: boolean, at = 1): PendingOp => ({
  id: `v${at}`, kind: 'visited', placeId: id, value, base, createdAt: at,
});
const field = (stopId: string, name: StopField, value: StopValue, base: StopValue, at = 1): PendingOp => ({
  id: `${name}${at}`, kind: 'stop', tripId: TRIP, stopId, field: name, value, base, createdAt: at,
});

describe('pending changes queue', () => {
  it('merges repeated changes to the same thing and keeps the original starting value', () => {
    let ops = enqueue([], field(A, 'startTime', '11:00', '10:00', 1));
    ops = enqueue(ops, field(A, 'startTime', '11:30', '11:00', 2));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ id: 'startTime1', value: '11:30', base: '10:00' });
  });

  it('cancels out a change and its undo (Done then not done offline = nothing to send)', () => {
    let ops = enqueue([], field(A, 'status', 'completed', 'planned', 1));
    ops = enqueue(ops, field(A, 'status', 'planned', 'completed', 2));
    expect(ops).toEqual([]);
  });

  it('keeps different fields, visits and places apart', () => {
    let ops = enqueue([], field(A, 'startTime', '11:00', '10:00', 1));
    ops = enqueue(ops, field(A, 'durationMinutes', 90, null, 2));
    ops = enqueue(ops, visited(B, true, false, 3));
    expect(ops).toHaveLength(3);
    expect([...pendingPlaceIds(ops)].sort()).toEqual([A, B].sort());
  });
});

describe('applying pending changes to the saved copy (what the user sees offline)', () => {
  it('marks a visit Done (and the place mark still works for places)', () => {
    const item = view([field(A, 'status', 'completed', 'planned')]).places.find((entry) => entry.id === A);
    expect([item?.status, item?.visitedAt !== null]).toEqual(['completed', true]);
    expect(applyVisitedOps({ id: A, visitedAt: null }, [visited(A, true, false)]).visitedAt).not.toBeNull();
  });

  it('skips a visit and resets it', () => {
    expect(view([field(A, 'status', 'skipped', 'planned')]).places.find((entry) => entry.id === A)?.status).toBe('skipped');
    const back = view([field(A, 'status', 'skipped', 'planned', 1), field(A, 'status', 'planned', 'skipped', 2)]);
    expect(back.places.find((entry) => entry.id === A)).toMatchObject({ status: 'planned', skippedAt: null, visitedAt: null });
  });

  it('reorders a day', () => {
    const result = view([{ id: 'r', kind: 'reorderStops', tripId: TRIP, day: D1, value: [C, A, B], base: [A, B, C], createdAt: 1 }]);
    expect(placesForDay(result.places, D1).map((place) => place.id)).toEqual([C, A, B]);
  });

  it('changes time and visit length', () => {
    const result = view([field(B, 'startTime', '13:15', '12:00', 1), field(B, 'durationMinutes', 45, 60, 2)]);
    expect(result.places.find((place) => place.id === B)).toMatchObject({ startTime: '13:15', durationMinutes: 45 });
  });

  it('moves a visit to another day (end of that day) and closes the gap, like the server', () => {
    const result = view([field(A, 'day', D2, D1)]);
    expect(placesForDay(result.places, D2).map((place) => place.id)).toEqual([uuid(104), A]);
    expect(placesForDay(result.places, D1).map((place) => place.position)).toEqual([0, 1]);
  });

  it('stars a visit as a highlight', () => {
    expect(view([field(B, 'highlight', true, false)]).places.find((place) => place.id === B)?.highlight).toBe(true);
  });

  it('a second visit to the same place is its own item; the saved place stays once', () => {
    const result = view([
      {
        id: 'add', kind: 'stopAdd', tripId: TRIP, stopId: uuid(901), tripPlaceId: memberId(A), day: D2,
        startTime: '18:00', durationMinutes: null, highlight: false, value: true, base: false, createdAt: 1,
      },
    ]);
    const visits = result.places.filter((item) => item.placeId === A);
    expect(visits.map((item) => [item.id, item.day, item.startTime])).toEqual([
      [A, D1, '10:00'],
      [uuid(901), D2, '18:00'],
    ]);
    expect(result.saved.filter((place) => place.id === A)).toHaveLength(1);
    expect(result.saved.find((place) => place.id === A)?.visits).toHaveLength(2);
  });

  it('planning a not-yet-planned place takes it off "not planned"; removing the visit puts it back', () => {
    const E = uuid(105);
    expect(view([]).places.find((item) => item.placeId === E)?.stopId).toBeNull();
    const add: PendingOp = {
      id: 'add', kind: 'stopAdd', tripId: TRIP, stopId: uuid(902), tripPlaceId: memberId(E), day: D1,
      startTime: null, durationMinutes: null, highlight: false, value: true, base: false, createdAt: 1,
    };
    expect(view([add]).places.filter((item) => item.placeId === E).map((item) => item.stopId)).toEqual([uuid(902)]);
    const removed = view([add, { id: 'rm', kind: 'stopRemove', tripId: TRIP, stopId: uuid(902), confirm: false, value: true, base: false, createdAt: 2 }]);
    expect(removed.places.filter((item) => item.placeId === E).map((item) => item.stopId)).toEqual([null]);
  });

  it('shows journal notes and ratings written offline, and merges repeated edits', () => {
    let ops = enqueue([], { id: 'n1', kind: 'journal', tripId: TRIP, day: D1, field: 'note', value: 'Rain', base: null, createdAt: 1 });
    ops = enqueue(ops, { id: 'n2', kind: 'journal', tripId: TRIP, day: D1, field: 'note', value: 'Rain, then sun', base: 'Rain', createdAt: 2 });
    ops = enqueue(ops, { id: 'r1', kind: 'journal', tripId: TRIP, day: D2, field: 'rating', value: 5, base: null, createdAt: 3 });
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ value: 'Rain, then sun', base: null });
    const journal = applyJournalOps({ days: [{ day: D2, note: 'Museums', rating: null, updatedAt: '2026-11-24T20:00:00.000Z' }] }, TRIP, ops);
    expect(journal.days.map((entry) => [entry.day, entry.note, entry.rating])).toEqual([
      [D1, 'Rain, then sun', null],
      [D2, 'Museums', 5],
    ]);
    expect(pendingPlaceIds(ops).size).toBe(0);
  });

  it('older (v1) changes left in the queue are not drawn on the visits model', () => {
    const legacy: PendingOp = { id: 's', kind: 'schedule', tripId: TRIP, placeId: A, field: 'startTime', value: '23:00', base: '10:00', createdAt: 1 };
    expect(applyOps(trip(), [legacy])).toEqual(trip());
  });
});
