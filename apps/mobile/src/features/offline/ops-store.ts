import type { Place, ScheduleTripPlaceInput, TripDetail } from '@travel-companion/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { ApiClientError } from '@/lib/api-error';
import { enqueue, type PendingOp } from './pending-ops';
import { deviceStore, type KeyValueStore } from './storage';
import { keepMine, settleQueue, syncOps, type Conflict, type FailureKind, type SyncApi } from './sync';
import { userPrefix } from './trip-cache';

/**
 * The phone's pending changes and unresolved conflicts for the signed-in user
 * (M12a). Saved to the device before anything is sent, so closing the app or
 * losing the connection never loses an edit. Wiped only on sign-out (after the
 * user is warned) or when the user resolves a conflict.
 */
export interface PendingState {
  ops: PendingOp[];
  conflicts: Conflict[];
  syncing: boolean;
}

const EMPTY: PendingState = { ops: [], conflicts: [], syncing: false };
let state: PendingState = EMPTY;
let userId: string | null = null;
let store: KeyValueStore = deviceStore;
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();

const OPS = 'ops';
const CONFLICTS = 'conflicts';

function set(next: PendingState): void {
  state = next;
  for (const listener of listeners) listener();
}

async function persist(): Promise<void> {
  if (!userId) return;
  await store.setItem(`${userPrefix(userId)}${OPS}`, JSON.stringify(state.ops));
  await store.setItem(`${userPrefix(userId)}${CONFLICTS}`, JSON.stringify(state.conflicts));
}

function readArray<T>(raw: string | null): T[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export const getPendingState = (): PendingState => state;

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingState(): PendingState {
  return useSyncExternalStore(subscribePending, getPendingState, getPendingState);
}

/** Loads this user's pending changes (called when the user's saved copy is restored). */
export async function loadPending(forUser: string, kv: KeyValueStore = deviceStore): Promise<void> {
  userId = forUser;
  store = kv;
  const ops = readArray<PendingOp>(await kv.getItem(`${userPrefix(forUser)}${OPS}`));
  const conflicts = readArray<Conflict>(await kv.getItem(`${userPrefix(forUser)}${CONFLICTS}`));
  set({ ops, conflicts, syncing: false });
}

/** Sign-out: forget the in-memory state (the device copy is wiped with the rest). */
export function resetPending(): void {
  userId = null;
  set(EMPTY);
}

/** Records changes on the phone first; the caller then asks for a sync. */
export async function addOps(newOps: readonly PendingOp[]): Promise<void> {
  let ops = state.ops;
  for (const op of newOps) ops = enqueue(ops, op);
  set({ ...state, ops });
  await persist();
}

export function classifyError(error: unknown): FailureKind {
  if (!(error instanceof ApiClientError)) return 'retryLater';
  switch (error.code) {
    case 'NETWORK':
    case 'TIMEOUT':
      return 'unreachable';
    case 'NOT_FOUND':
      return 'gone';
    case 'VALIDATION_FAILED':
    case 'CONFLICT':
    case 'FORBIDDEN':
      return 'rejected';
    default:
      // Asleep server, rate limit, expired sign-in, 5xx: try again later, keep everything.
      return 'retryLater';
  }
}

const liveApi: SyncApi = {
  getTrip: (tripId) => api.getTrip(tripId),
  getPlace: (placeId) => api.getPlace(placeId),
  setVisited: (placeId, visited) => api.updatePlace(placeId, { visited }),
  // The queue stores each field with its own type (day/startTime: string, length: number).
  schedule: (tripId, placeId, body) => api.scheduleTripPlace(tripId, placeId, body as ScheduleTripPlaceInput),
  reorder: (tripId, day, placeIds) => api.reorderTripDay(tripId, day, { placeIds }),
};

/**
 * Sends pending changes (one run at a time; a second call waits for the first).
 * Only changes that are unchanged since this run started are removed afterwards,
 * so an edit made while syncing is never lost.
 */
export function syncPending(queryClient: QueryClient, syncApi: SyncApi = liveApi): Promise<void> {
  if (running) return running;
  if (state.ops.length === 0) return Promise.resolve();
  let again = false;
  running = (async () => {
    const sent = state.ops;
    set({ ...state, syncing: true });
    try {
      const result = await syncOps(sent, syncApi, classifyError, Date.now());
      const ops = settleQueue(state.ops, sent, result);
      // Edits made while this run was in flight go out right after it (if the server is reachable).
      // (When nothing from this run was left over, anything still queued is new or edited.)
      again = !result.stoppedOffline && result.remaining.length === 0 && ops.length > 0;
      set({ ops, conflicts: [...state.conflicts, ...result.conflicts], syncing: false });
      await persist();
      applyServerCopies(queryClient, result.trips, result.places);
    } catch {
      set({ ...state, syncing: false });
    } finally {
      running = null;
      if (again) setTimeout(() => void syncPending(queryClient, syncApi), 0);
    }
  })();
  return running;
}

function applyServerCopies(queryClient: QueryClient, trips: readonly TripDetail[], places: readonly Place[]): void {
  for (const trip of trips) queryClient.setQueryData(['trips', 'detail', trip.id], trip);
  for (const place of places) queryClient.setQueryData(['places', 'detail', place.id], place);
  if (places.length > 0) {
    // Done is per place: every trip showing it needs the server's copy.
    void queryClient.invalidateQueries({ queryKey: ['trips', 'detail'] });
    void queryClient.invalidateQueries({ queryKey: ['places', 'list'] });
  }
  if (trips.length > 0) void queryClient.invalidateQueries({ queryKey: ['trips', 'list'] });
}

/** The user decided a conflict: keep their change (re-sent next sync) or take the server's. */
export async function resolveConflict(
  queryClient: QueryClient,
  conflict: Conflict,
  choice: 'mine' | 'server',
): Promise<void> {
  const conflicts = state.conflicts.filter((item) => item !== conflict);
  const retry = choice === 'mine' ? keepMine(conflict) : null;
  set({ ...state, conflicts, ops: retry ? enqueue(state.ops, retry) : state.ops });
  await persist();
  if (retry) void syncPending(queryClient);
  else void queryClient.invalidateQueries({ queryKey: ['trips'] });
}
