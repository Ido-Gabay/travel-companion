import type { Place, TripDetail } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { applyOps, enqueue, type PendingOp } from './pending-ops';
import { dayOrder, keepMine, settleQueue, syncOps, type FailureKind, type SyncApi } from './sync';
import { tripDetail, tripPlace, uuid } from './test-fixtures';

const TRIP = uuid(1);
const A = uuid(101);
const B = uuid(102);
const C = uuid(103);
const D1 = '2026-11-23';
const NOW = Date.UTC(2026, 10, 23, 16);

class Unreachable extends Error {}
class ServerError extends Error {}
class NotFound extends Error {}
const classify = (error: unknown): FailureKind =>
  error instanceof Unreachable ? 'unreachable' : error instanceof NotFound ? 'gone' : error instanceof ServerError ? 'retryLater' : 'rejected';

/** A tiny stand-in for the API with the same rules as the real one. */
function fakeServer(initial: TripDetail) {
  let trip = initial;
  let online = true;
  let failWith: Error | null = null;
  const writes: string[] = [];
  const guard = () => {
    if (!online) throw new Unreachable('offline');
    if (failWith) throw failWith;
  };
  const api: SyncApi = {
    getTrip: async () => {
      guard();
      return structuredClone(trip);
    },
    getPlace: async (id) => {
      guard();
      const place = trip.places.find((item) => item.id === id);
      if (!place) throw new NotFound(id);
      return structuredClone(place) as Place;
    },
    setVisited: async (id, visited) => {
      guard();
      writes.push(`visited:${id}:${visited}`);
      trip = applyOps(trip, [{ id: 'x', kind: 'visited', placeId: id, value: visited, base: !visited, createdAt: NOW }]);
      return structuredClone(trip.places.find((item) => item.id === id)) as Place;
    },
    schedule: async (tripId, placeId, body) => {
      guard();
      writes.push(`schedule:${placeId}:${JSON.stringify(body)}`);
      const ops = Object.entries(body).map(([field, value], i) => ({
        id: `s${i}`, kind: 'schedule' as const, tripId, placeId, field: field as 'day', value: value ?? null, base: '__', createdAt: NOW + i,
      }));
      trip = applyOps(trip, ops);
      return structuredClone(trip);
    },
    reorder: async (tripId, day, ids) => {
      guard();
      const current = dayOrder(trip.places, day);
      if (current.length !== ids.length || current.some((id) => !ids.includes(id))) throw new Error('409 CONFLICT');
      writes.push(`reorder:${day}:${ids.length}`);
      trip = applyOps(trip, [{ id: 'r', kind: 'reorder', tripId, day, value: ids, base: current, createdAt: NOW }]);
      return structuredClone(trip);
    },
  };
  return {
    api,
    writes,
    get trip() {
      return trip;
    },
    set online(value: boolean) {
      online = value;
    },
    set failWith(error: Error | null) {
      failWith = error;
    },
    edit(change: (detail: TripDetail) => TripDetail) {
      trip = change(trip);
    },
  };
}

const start = () =>
  tripDetail([
    tripPlace(1, { startTime: '10:00' }),
    tripPlace(2, { startTime: '12:00', durationMinutes: 60 }),
    tripPlace(3, { startTime: '15:00' }),
  ]);
const place = (trip: TripDetail, id: string) => trip.places.find((item) => item.id === id);

describe('sync after offline changes', () => {
  it('Done offline: kept while offline, sent once the connection is back', async () => {
    const server = fakeServer(start());
    const ops = enqueue([], { id: 'v', kind: 'visited', placeId: A, value: true, base: false, createdAt: 1 });
    server.online = false;
    const offline = await syncOps(ops, server.api, classify, NOW);
    expect(offline).toMatchObject({ stoppedOffline: true, done: [], conflicts: [] });
    expect(offline.remaining).toEqual(ops);
    server.online = true;
    const online = await syncOps(offline.remaining, server.api, classify, NOW);
    expect(online.done).toEqual(['v']);
    expect(online.remaining).toEqual([]);
    expect(place(server.trip, A)?.visitedAt).not.toBeNull();
  });

  it('reorder, time and visit length made offline all reach the server in order', async () => {
    const server = fakeServer(start());
    let ops: PendingOp[] = [];
    ops = enqueue(ops, { id: 'r', kind: 'reorder', tripId: TRIP, day: D1, value: [C, A, B], base: [A, B, C], createdAt: 1 });
    ops = enqueue(ops, { id: 't', kind: 'schedule', tripId: TRIP, placeId: B, field: 'startTime', value: '13:30', base: '12:00', createdAt: 2 });
    ops = enqueue(ops, { id: 'd', kind: 'schedule', tripId: TRIP, placeId: B, field: 'durationMinutes', value: 90, base: 60, createdAt: 3 });
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.done).toEqual(['r', 't', 'd']);
    expect(dayOrder(server.trip.places, D1)).toEqual([C, A, B]);
    expect(place(server.trip, B)).toMatchObject({ startTime: '13:30', durationMinutes: 90 });
  });

  it('never sends a change twice (already on the server, e.g. sent just before the app closed)', async () => {
    const server = fakeServer(start());
    const ops: PendingOp[] = [
      { id: 't', kind: 'schedule', tripId: TRIP, placeId: A, field: 'startTime', value: '11:00', base: '10:00', createdAt: 1 },
    ];
    const first = await syncOps(ops, server.api, classify, NOW);
    expect(first.done).toEqual(['t']);
    // The same queue replayed (the result was never saved): nothing is written again.
    const again = await syncOps(ops, server.api, classify, NOW);
    expect(again.done).toEqual(['t']);
    expect(server.writes).toEqual([`schedule:${A}:{"startTime":"11:00"}`]);
  });

  it('conflict: the server changed the same thing meanwhile → not sent, kept for the user', async () => {
    const server = fakeServer(start());
    server.edit((trip) => ({ ...trip, places: trip.places.map((p) => (p.id === A ? { ...p, startTime: '09:00' } : p)) }));
    const op: PendingOp = { id: 't', kind: 'schedule', tripId: TRIP, placeId: A, field: 'startTime', value: '11:00', base: '10:00', createdAt: 1 };
    const result = await syncOps([op], server.api, classify, NOW);
    expect(result.done).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.conflicts).toEqual([{ op, reason: 'changed', serverValue: '09:00', detectedAt: NOW }]);
    expect(place(server.trip, A)?.startTime).toBe('09:00');
    expect(server.writes).toEqual([]);
    // "Keep mine": re-queued against the server's value, then sent.
    const retry = keepMine(result.conflicts[0]!);
    expect(retry).toMatchObject({ value: '11:00', base: '09:00' });
    await syncOps([retry!], server.api, classify, NOW);
    expect(place(server.trip, A)?.startTime).toBe('11:00');
  });

  it('conflict: the stop was removed on the server → kept as "gone", nothing sent', async () => {
    const server = fakeServer(start());
    server.edit((trip) => ({ ...trip, places: trip.places.filter((p) => p.id !== C) }));
    const result = await syncOps(
      [{ id: 't', kind: 'schedule', tripId: TRIP, placeId: C, field: 'startTime', value: '16:00', base: '15:00', createdAt: 1 }],
      server.api,
      classify,
      NOW,
    );
    expect(result.conflicts[0]?.reason).toBe('gone');
    expect(keepMine(result.conflicts[0]!)).toBeNull();
  });

  it('a saved day order that still lists a stop moved to another day syncs (order aligned to the day)', async () => {
    const server = fakeServer(start());
    const ops: PendingOp[] = [
      // Replayed in time order: the move goes first, then the day's order without the moved stop.
      { id: 'm', kind: 'schedule', tripId: TRIP, placeId: A, field: 'day', value: '2026-11-24', base: D1, createdAt: 1 },
      { id: 'r', kind: 'reorder', tripId: TRIP, day: D1, value: [C, B, A], base: [A, B, C], createdAt: 2 },
    ];
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.conflicts).toEqual([]);
    expect(dayOrder(server.trip.places, D1)).toEqual([C, B]);
    expect(place(server.trip, A)?.day).toBe('2026-11-24');
  });

  it('server errors (asleep, 5xx) keep every change for later, in order', async () => {
    const server = fakeServer(start());
    server.failWith = new ServerError('503');
    const ops: PendingOp[] = [
      { id: 'v', kind: 'visited', placeId: A, value: true, base: false, createdAt: 1 },
      { id: 't', kind: 'schedule', tripId: TRIP, placeId: B, field: 'startTime', value: '13:00', base: '12:00', createdAt: 2 },
    ];
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.remaining).toEqual(ops);
    expect(result.stoppedOffline).toBe(false);
    expect(result.conflicts).toEqual([]);
  });
});

describe('settling the queue after a sync run', () => {
  it('removes what was sent, but keeps an edit made to the same stop while the sync was running', async () => {
    const sent: PendingOp[] = [
      { id: 't', kind: 'schedule', tripId: TRIP, placeId: A, field: 'startTime', value: '11:00', base: '10:00', createdAt: 1 },
      { id: 'v', kind: 'visited', placeId: B, value: true, base: false, createdAt: 2 },
    ];
    // While in flight, the user changed A's time again (merged into the same entry).
    const current = enqueue(sent, { id: 'later', kind: 'schedule', tripId: TRIP, placeId: A, field: 'startTime', value: '11:45', base: '11:00', createdAt: 3 });
    const settled = settleQueue(current, sent, { done: ['t', 'v'], conflicts: [] });
    expect(settled).toEqual([{ ...sent[0], value: '11:45' }]);
  });
});
