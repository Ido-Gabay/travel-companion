import type { Place, StopStatus, StopTransition, TripDetail, TripDetailV2, TripJournal } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { applyOps, enqueue, withStatus, type PendingOp, type StopField, type StopValue } from './pending-ops';
import { keepMine, settleQueue, stopOrder, syncOps, transitionsTo, type FailureKind, type SyncApi } from './sync';
import { memberId, tripDetail, tripDetailV1, tripPlace, uuid } from './test-fixtures';

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

const TO: Record<StopTransition, StopStatus> = { arrive: 'in_progress', complete: 'completed', skip: 'skipped', reset: 'planned' };

/** A tiny stand-in for the API (v2 visits, plus the v1 calls an older queue may still need), with the same rules. */
function fakeServer(initial: TripDetailV2) {
  let trip = initial;
  let journal: TripJournal = { days: [] };
  let online = true;
  let failWith: Error | null = null;
  const writes: string[] = [];
  const guard = () => {
    if (!online) throw new Unreachable('offline');
    if (failWith) throw failWith;
  };
  const stopOf = (id: string) => {
    const stop = trip.stops.find((item) => item.id === id);
    if (!stop) throw new NotFound(id);
    return structuredClone(stop);
  };
  const api: SyncApi = {
    getTrip: async () => {
      guard();
      return tripDetailV1([]) as TripDetail;
    },
    schedule: async (_tripId, placeId, body) => {
      guard();
      writes.push(`v1-schedule:${placeId}:${JSON.stringify(body)}`);
      return tripDetailV1([]) as TripDetail;
    },
    reorder: async () => {
      guard();
      return tripDetailV1([]) as TripDetail;
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
    getJournal: async () => {
      guard();
      return structuredClone(journal);
    },
    updateJournal: async (_tripId, day, body) => {
      guard();
      writes.push(`journal:${day}:${JSON.stringify(body)}`);
      const entry = journal.days.find((item) => item.day === day) ?? { day, note: null, rating: null, updatedAt: '2026-11-23T00:00:00.000Z' };
      const next = { ...entry, ...body } as TripJournal['days'][number];
      journal = { days: [...journal.days.filter((item) => item.day !== day), next] };
      return structuredClone(next);
    },
    getTripV2: async () => {
      guard();
      return structuredClone(trip);
    },
    addStop: async (tripId, body) => {
      guard();
      writes.push(`add:${body.id}:${body.day}`);
      trip = applyOps(trip, [
        {
          id: 'a', kind: 'stopAdd', tripId, stopId: body.id!, tripPlaceId: body.tripPlaceId, day: body.day,
          startTime: body.startTime ?? null, durationMinutes: body.durationMinutes ?? null, highlight: body.highlight ?? false,
          value: true, base: false, createdAt: NOW,
        },
      ]);
      return { stop: stopOf(body.id!), timeZoneSuggestion: null };
    },
    updateStop: async (tripId, stopId, body) => {
      guard();
      stopOf(stopId);
      writes.push(`update:${stopId}:${JSON.stringify(body)}`);
      const ops = Object.entries(body).map(([name, value], i) => ({
        id: `u${i}`, kind: 'stop' as const, tripId, stopId, field: name as StopField, value: (value ?? null) as StopValue, base: '__', createdAt: NOW + i,
      }));
      trip = applyOps(trip, ops);
      return { stop: stopOf(stopId), timeZoneSuggestion: null };
    },
    transitionStop: async (_tripId, stopId, action, at) => {
      guard();
      const stop = stopOf(stopId);
      if ((action === 'skip' && stop.status === 'completed') || (action === 'complete' && stop.status === 'skipped')) {
        throw new Error('409 INVALID_TRANSITION');
      }
      writes.push(`${action}:${stopId}${at ? `@${at}` : ''}`);
      trip = { ...trip, stops: trip.stops.map((item) => (item.id === stopId ? withStatus(item, TO[action], at ?? new Date(NOW).toISOString()) : item)) };
      return { stop: stopOf(stopId), timeZoneSuggestion: null };
    },
    removeStop: async (tripId, stopId, confirm) => {
      guard();
      writes.push(`remove:${stopId}:${confirm}`);
      trip = applyOps(trip, [{ id: 'rm', kind: 'stopRemove', tripId, stopId, confirm, value: true, base: false, createdAt: NOW }]);
      return structuredClone(trip);
    },
    reorderStops: async (tripId, day, ids) => {
      guard();
      const current = stopOrder(trip.stops, day);
      if (current.length !== ids.length || current.some((id) => !ids.includes(id))) throw new Error('409 CONFLICT');
      writes.push(`reorder:${day}:${ids.length}`);
      trip = applyOps(trip, [{ id: 'r', kind: 'reorderStops', tripId, day, value: ids, base: current, createdAt: NOW }]);
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
    edit(change: (detail: TripDetailV2) => TripDetailV2) {
      trip = change(trip);
    },
    get journal() {
      return journal;
    },
    setJournal(next: TripJournal) {
      journal = next;
    },
  };
}

const start = () =>
  tripDetail([
    tripPlace(1, { startTime: '10:00' }),
    tripPlace(2, { startTime: '12:00', durationMinutes: 60 }),
    tripPlace(3, { startTime: '15:00' }),
  ]);
const stop = (trip: TripDetailV2, id: string) => trip.stops.find((item) => item.id === id);
const field = (id: string, stopId: string, name: StopField, value: StopValue, base: StopValue, at: number): PendingOp => ({
  id, kind: 'stop', tripId: TRIP, stopId, field: name, value, base, createdAt: at,
});

describe('sync after offline changes', () => {
  it('Done offline: kept while offline, sent once the connection is back, with the time it happened', async () => {
    const server = fakeServer(start());
    const ops = enqueue([], field('v', A, 'status', 'completed', 'planned', NOW - 3600_000));
    server.online = false;
    const offline = await syncOps(ops, server.api, classify, NOW);
    expect(offline).toMatchObject({ stoppedOffline: true, done: [], conflicts: [] });
    expect(offline.remaining).toEqual(ops);
    server.online = true;
    const online = await syncOps(offline.remaining, server.api, classify, NOW);
    expect(online.done).toEqual(['v']);
    expect(stop(server.trip, A)).toMatchObject({ status: 'completed', completedAt: new Date(NOW - 3600_000).toISOString() });
    expect(online.trips[0]?.stops.find((item) => item.id === A)?.status).toBe('completed');
  });

  it('a visit added offline (its own id) and then timed reaches the server, once', async () => {
    const server = fakeServer(start());
    const id = uuid(950);
    const ops: PendingOp[] = [
      {
        id: 'add', kind: 'stopAdd', tripId: TRIP, stopId: id, tripPlaceId: memberId(A), day: '2026-11-24',
        startTime: null, durationMinutes: null, highlight: false, value: true, base: false, createdAt: 1,
      },
      field('t', id, 'startTime', '18:00', null, 2),
    ];
    expect((await syncOps(ops, server.api, classify, NOW)).done).toEqual(['add', 't']);
    expect(stop(server.trip, id)).toMatchObject({ day: '2026-11-24', startTime: '18:00', tripPlaceId: memberId(A) });
    // Replayed (the result was never saved): nothing is written again.
    await syncOps(ops, server.api, classify, NOW);
    expect(server.writes.filter((write) => write.startsWith('add:'))).toHaveLength(1);
  });

  it('reorder, time and visit length made offline all reach the server in order', async () => {
    const server = fakeServer(start());
    let ops: PendingOp[] = [];
    ops = enqueue(ops, { id: 'r', kind: 'reorderStops', tripId: TRIP, day: D1, value: [C, A, B], base: [A, B, C], createdAt: 1 });
    ops = enqueue(ops, field('t', B, 'startTime', '13:30', '12:00', 2));
    ops = enqueue(ops, field('d', B, 'durationMinutes', 90, 60, 3));
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.done).toEqual(['r', 't', 'd']);
    expect(stopOrder(server.trip.stops, D1)).toEqual([C, A, B]);
    expect(stop(server.trip, B)).toMatchObject({ startTime: '13:30', durationMinutes: 90 });
  });

  it('never sends a change twice (already on the server, e.g. sent just before the app closed)', async () => {
    const server = fakeServer(start());
    const ops: PendingOp[] = [field('t', A, 'startTime', '11:00', '10:00', 1)];
    expect((await syncOps(ops, server.api, classify, NOW)).done).toEqual(['t']);
    expect((await syncOps(ops, server.api, classify, NOW)).done).toEqual(['t']);
    expect(server.writes).toEqual([`update:${A}:{"startTime":"11:00"}`]);
  });

  it('conflict: the server changed the same thing meanwhile → not sent, kept for the user', async () => {
    const server = fakeServer(start());
    server.edit((trip) => ({ ...trip, stops: trip.stops.map((s) => (s.id === A ? { ...s, startTime: '09:00' } : s)) }));
    const op = field('t', A, 'startTime', '11:00', '10:00', 1);
    const result = await syncOps([op], server.api, classify, NOW);
    expect(result.done).toEqual([]);
    expect(result.conflicts).toEqual([{ op, reason: 'changed', serverValue: '09:00', detectedAt: NOW }]);
    expect(server.writes).toEqual([]);
    const retry = keepMine(result.conflicts[0]!);
    expect(retry).toMatchObject({ value: '11:00', base: '09:00' });
    await syncOps([retry!], server.api, classify, NOW);
    expect(stop(server.trip, A)?.startTime).toBe('11:00');
  });

  it('conflict: the visit was removed on the server → kept as "gone", nothing sent', async () => {
    const server = fakeServer(start());
    server.edit((trip) => ({ ...trip, stops: trip.stops.filter((s) => s.id !== C) }));
    const result = await syncOps([field('t', C, 'startTime', '16:00', '15:00', 1)], server.api, classify, NOW);
    expect(result.conflicts[0]?.reason).toBe('gone');
    expect(keepMine(result.conflicts[0]!)).toBeNull();
  });

  it('a visit done elsewhere and skipped here is a conflict, never overwritten', async () => {
    const server = fakeServer(start());
    server.edit((trip) => ({ ...trip, stops: trip.stops.map((s) => (s.id === A ? withStatus(s, 'completed', '2026-11-23T11:00:00.000Z') : s)) }));
    const result = await syncOps([field('s', A, 'status', 'skipped', 'planned', 1)], server.api, classify, NOW);
    expect(result.conflicts[0]).toMatchObject({ reason: 'changed', serverValue: 'completed' });
    expect(stop(server.trip, A)?.status).toBe('completed');
  });

  it('a saved day order that still lists a visit moved to another day syncs (order aligned to the day)', async () => {
    const server = fakeServer(start());
    const ops: PendingOp[] = [
      field('m', A, 'day', '2026-11-24', D1, 1),
      { id: 'r', kind: 'reorderStops', tripId: TRIP, day: D1, value: [C, B, A], base: [A, B, C], createdAt: 2 },
    ];
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.conflicts).toEqual([]);
    expect(stopOrder(server.trip.stops, D1)).toEqual([C, B]);
    expect(stop(server.trip, A)?.day).toBe('2026-11-24');
  });

  it('removing a visit is sent once; an already removed one is simply done', async () => {
    const server = fakeServer(start());
    const op: PendingOp = { id: 'rm', kind: 'stopRemove', tripId: TRIP, stopId: B, confirm: false, value: true, base: false, createdAt: 1 };
    expect((await syncOps([op], server.api, classify, NOW)).done).toEqual(['rm']);
    expect((await syncOps([op], server.api, classify, NOW)).done).toEqual(['rm']);
    expect(server.writes).toEqual([`remove:${B}:false`]);
  });

  it('server errors (asleep, 5xx) keep every change for later, in order', async () => {
    const server = fakeServer(start());
    server.failWith = new ServerError('503');
    const ops: PendingOp[] = [
      { id: 'v', kind: 'visited', placeId: A, value: true, base: false, createdAt: 1 },
      field('t', B, 'startTime', '13:00', '12:00', 2),
    ];
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.remaining).toEqual(ops);
    expect(result.stoppedOffline).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  it('a change an older build left queued (v1, by place) is still sent through v1, and the trip refreshed', async () => {
    const server = fakeServer(start());
    const legacy: PendingOp = { id: 'old', kind: 'schedule', tripId: TRIP, placeId: A, field: 'startTime', value: '10:00', base: '10:00', createdAt: 1 };
    const result = await syncOps([legacy], server.api, classify, NOW);
    expect(result.legacyTrips).toEqual([TRIP]);
    expect(result.trips).toEqual([]);
  });
});

describe('visit lifecycle calls', () => {
  it('takes a visit from any status to any other with the fewest safe calls', () => {
    expect(transitionsTo('planned', 'completed')).toEqual(['complete']);
    expect(transitionsTo('in_progress', 'completed')).toEqual(['complete']);
    expect(transitionsTo('skipped', 'completed')).toEqual(['reset', 'complete']);
    expect(transitionsTo('completed', 'planned')).toEqual(['reset']);
    expect(transitionsTo('completed', 'in_progress')).toEqual(['reset', 'arrive']);
    expect(transitionsTo('planned', 'planned')).toEqual([]);
  });
});

describe('sync: highlights and the journal (M15)', () => {
  it('sends a highlight star, a note and a rating written offline', async () => {
    const server = fakeServer(start());
    const ops: PendingOp[] = [
      field('h', B, 'highlight', true, false, 1),
      { id: 'n', kind: 'journal', tripId: TRIP, day: D1, field: 'note', value: 'Best bagel ever', base: null, createdAt: 2 },
      { id: 'r', kind: 'journal', tripId: TRIP, day: D1, field: 'rating', value: 5, base: null, createdAt: 3 },
    ];
    const result = await syncOps(ops, server.api, classify, NOW);
    expect(result.done).toEqual(['h', 'n', 'r']);
    expect(stop(server.trip, B)?.highlight).toBe(true);
    expect(server.journal.days[0]).toMatchObject({ day: D1, note: 'Best bagel ever', rating: 5 });
  });

  it('a note changed elsewhere meanwhile is a conflict, never overwritten', async () => {
    const server = fakeServer(start());
    server.setJournal({ days: [{ day: D1, note: 'Written on the laptop', rating: null, updatedAt: '2026-11-23T20:00:00.000Z' }] });
    const op: PendingOp = { id: 'n', kind: 'journal', tripId: TRIP, day: D1, field: 'note', value: 'Written on the phone', base: null, createdAt: 1 };
    const result = await syncOps([op], server.api, classify, NOW);
    expect(result.conflicts).toEqual([{ op, reason: 'changed', serverValue: 'Written on the laptop', detectedAt: NOW }]);
  });
});

describe('settling the queue after a sync run', () => {
  it('removes what was sent, but keeps an edit made to the same visit while the sync was running', () => {
    const sent: PendingOp[] = [field('t', A, 'startTime', '11:00', '10:00', 1), { id: 'v', kind: 'visited', placeId: B, value: true, base: false, createdAt: 2 }];
    const current = enqueue(sent, field('later', A, 'startTime', '11:45', '11:00', 3));
    const settled = settleQueue(current, sent, { done: ['t', 'v'], conflicts: [] });
    expect(settled).toEqual([{ ...sent[0], value: '11:45' }]);
  });
});
