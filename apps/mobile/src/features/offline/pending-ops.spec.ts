import { describe, expect, it } from 'vitest';
import { placesForDay } from '../trips/itinerary';
import { applyJournalOps, applyOps, applyVisitedOps, enqueue, pendingPlaceIds, type PendingOp } from './pending-ops';
import { tripDetail, tripPlace, uuid } from './test-fixtures';

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
  ]);
const visited = (id: string, value: boolean, base: boolean, at = 1): PendingOp => ({
  id: `v${at}`, kind: 'visited', placeId: id, value, base, createdAt: at,
});
const time = (id: string, value: string | null, base: string | null, at = 1): PendingOp => ({
  id: `t${at}`, kind: 'schedule', tripId: TRIP, placeId: id, field: 'startTime', value, base, createdAt: at,
});

describe('pending changes queue', () => {
  it('merges repeated changes to the same thing and keeps the original starting value', () => {
    let ops = enqueue([], time(A, '11:00', '10:00', 1));
    ops = enqueue(ops, time(A, '11:30', '11:00', 2));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ id: 't1', value: '11:30', base: '10:00' });
  });

  it('cancels out a change and its undo (Done then not done offline = nothing to send)', () => {
    let ops = enqueue([], visited(A, true, false, 1));
    ops = enqueue(ops, visited(A, false, true, 2));
    expect(ops).toEqual([]);
  });

  it('keeps different fields and places apart', () => {
    let ops = enqueue([], time(A, '11:00', '10:00', 1));
    ops = enqueue(ops, { id: 'd2', kind: 'schedule', tripId: TRIP, placeId: A, field: 'durationMinutes', value: 90, base: null, createdAt: 2 });
    ops = enqueue(ops, visited(B, true, false, 3));
    expect(ops).toHaveLength(3);
    expect([...pendingPlaceIds(ops)].sort()).toEqual([A, B].sort());
  });
});

describe('applying pending changes to the saved copy (what the user sees offline)', () => {
  it('marks a stop Done', () => {
    const result = applyOps(trip(), [visited(A, true, false)]);
    expect(result.places.find((place) => place.id === A)?.visitedAt).not.toBeNull();
    expect(applyVisitedOps({ id: A, visitedAt: null }, [visited(A, true, false)]).visitedAt).not.toBeNull();
  });

  it('reorders a day', () => {
    const result = applyOps(trip(), [{ id: 'r', kind: 'reorder', tripId: TRIP, day: D1, value: [C, A, B], base: [A, B, C], createdAt: 1 }]);
    expect(placesForDay(result.places, D1).map((place) => place.id)).toEqual([C, A, B]);
  });

  it('changes time and visit length', () => {
    const result = applyOps(trip(), [
      time(B, '13:15', '12:00', 1),
      { id: 'd', kind: 'schedule', tripId: TRIP, placeId: B, field: 'durationMinutes', value: 45, base: 60, createdAt: 2 },
    ]);
    expect(result.places.find((place) => place.id === B)).toMatchObject({ startTime: '13:15', durationMinutes: 45 });
  });

  it('moves a stop to another day (end of that day) and closes the gap, like the server', () => {
    const result = applyOps(trip(), [
      { id: 'm', kind: 'schedule', tripId: TRIP, placeId: A, field: 'day', value: D2, base: D1, createdAt: 1 },
    ]);
    expect(placesForDay(result.places, D2).map((place) => place.id)).toEqual([uuid(104), A]);
    expect(placesForDay(result.places, D1).map((place) => place.position)).toEqual([0, 1]);
  });

  it('stars a stop as a highlight', () => {
    const result = applyOps(trip(), [
      { id: 'h', kind: 'schedule', tripId: TRIP, placeId: B, field: 'highlight', value: true, base: false, createdAt: 1 },
    ]);
    expect(result.places.find((place) => place.id === B)?.highlight).toBe(true);
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

  it('moving back to the wishlist clears the time, like the server', () => {
    const result = applyOps(trip(), [
      { id: 'w', kind: 'schedule', tripId: TRIP, placeId: A, field: 'day', value: null, base: D1, createdAt: 1 },
    ]);
    expect(result.places.find((place) => place.id === A)).toMatchObject({ day: null, startTime: null });
  });
});
