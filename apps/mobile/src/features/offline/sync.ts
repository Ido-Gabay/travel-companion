import type { JournalDay, Place, TripDetail, TripJournal, TripPlace } from '@travel-companion/shared';
import { sameValue, type JournalField, type PendingOp, type ScheduleField, type ScheduleValue } from './pending-ops';

/**
 * M12a sync: replays pending changes against the server, safely.
 * For each change it first reads what the server has now and compares three values:
 *   server == what the user wants    → already done (e.g. sent before the app was closed): drop it
 *   server == what the user started from → nobody else changed it: send it
 *   anything else                     → conflict: NOT sent, kept for the user to decide
 * A change whose place is gone, or that the server rejects, also becomes a conflict.
 * Nothing is ever overwritten or dropped silently. Pure: the API is passed in.
 */
export type ConflictReason = 'changed' | 'gone' | 'rejected';

export interface Conflict {
  op: PendingOp;
  reason: ConflictReason;
  /** The server's value when the conflict was found (for the message and "Keep mine"). */
  serverValue: unknown;
  detectedAt: number;
}

export interface SyncApi {
  getTrip(tripId: string): Promise<TripDetail>;
  getPlace(placeId: string): Promise<Place>;
  setVisited(placeId: string, visited: boolean): Promise<Place>;
  schedule(tripId: string, placeId: string, body: Partial<Record<ScheduleField, ScheduleValue>>): Promise<TripDetail>;
  getJournal(tripId: string): Promise<TripJournal>;
  updateJournal(tripId: string, day: string, body: Partial<Record<JournalField, string | number | null>>): Promise<JournalDay>;
  reorder(tripId: string, day: string, placeIds: string[]): Promise<TripDetail>;
}

/** How a failed request is treated. */
export type FailureKind = 'unreachable' | 'gone' | 'rejected' | 'retryLater';

export interface SyncResult {
  /** Changes still waiting (not attempted because the server couldn't be reached, or retry later). */
  remaining: PendingOp[];
  /** New conflicts found in this run. */
  conflicts: Conflict[];
  /** Ids of changes that are now on the server (sent, or found already there). */
  done: string[];
  /** Latest server copies seen, to refresh the screens and the saved copy. */
  trips: TripDetail[];
  journals: { tripId: string; journal: TripJournal }[];
  places: Place[];
  /** The run stopped early because the server couldn't be reached. */
  stoppedOffline: boolean;
}

/** Server order of a day. */
export function dayOrder(places: readonly TripPlace[], day: string): string[] {
  return places
    .filter((place) => place.day === day)
    .sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt))
    .map((place) => place.id);
}

/**
 * Restricts a saved order to the places the server has on that day now (our own
 * earlier day changes may have moved some away), appending any the list didn't know.
 */
export function alignOrder(order: readonly string[], serverIds: readonly string[]): string[] {
  const server = new Set(serverIds);
  const kept = order.filter((id) => server.has(id));
  return [...kept, ...serverIds.filter((id) => !kept.includes(id))];
}

const fieldValue = (place: TripPlace, field: ScheduleField): ScheduleValue =>
  field === 'day'
    ? place.day
    : field === 'startTime'
      ? place.startTime
      : field === 'highlight'
        ? place.highlight
        : place.durationMinutes;

export async function syncOps(
  ops: readonly PendingOp[],
  api: SyncApi,
  classify: (error: unknown) => FailureKind,
  nowMs: number,
): Promise<SyncResult> {
  const queue = [...ops].sort((a, b) => a.createdAt - b.createdAt);
  const result: SyncResult = { remaining: [], conflicts: [], done: [], trips: [], journals: [], places: [], stoppedOffline: false };
  const trips = new Map<string, TripDetail>();
  const journals = new Map<string, TripJournal>();
  const conflict = (op: PendingOp, reason: ConflictReason, serverValue: unknown) =>
    result.conflicts.push({ op, reason, serverValue, detectedAt: nowMs });

  for (let i = 0; i < queue.length; i += 1) {
    const op = queue[i] as PendingOp;
    try {
      if (op.kind === 'visited') {
        const place = await api.getPlace(op.placeId);
        const server = place.visitedAt !== null;
        if (server === op.value) {
          result.done.push(op.id);
        } else if (server === op.base) {
          result.places.push(await api.setVisited(op.placeId, op.value));
          result.done.push(op.id);
        } else {
          conflict(op, 'changed', server);
        }
        continue;
      }

      if (op.kind === 'journal') {
        let journal = journals.get(op.tripId);
        if (!journal) {
          journal = await api.getJournal(op.tripId);
          journals.set(op.tripId, journal);
        }
        const entry = journal.days.find((item) => item.day === op.day);
        const server = entry ? entry[op.field] : null;
        if (sameValue(server, op.value)) {
          result.done.push(op.id);
        } else if (sameValue(server, op.base)) {
          const saved = await api.updateJournal(op.tripId, op.day, { [op.field]: op.value });
          journals.set(op.tripId, {
            days: [...journal.days.filter((item) => item.day !== op.day), saved].sort((a, b) => a.day.localeCompare(b.day)),
          });
          result.done.push(op.id);
        } else {
          conflict(op, 'changed', server);
        }
        continue;
      }

      let trip = trips.get(op.tripId);
      if (!trip) {
        trip = await api.getTrip(op.tripId);
        trips.set(op.tripId, trip);
      }

      if (op.kind === 'reorder') {
        const server = dayOrder(trip.places, op.day);
        const wanted = alignOrder(op.value, server);
        const base = alignOrder(op.base, server);
        if (sameValue(server, wanted)) {
          result.done.push(op.id);
        } else if (sameValue(server, base)) {
          trips.set(op.tripId, await api.reorder(op.tripId, op.day, wanted));
          result.done.push(op.id);
        } else {
          conflict(op, 'changed', server);
        }
        continue;
      }

      const place = trip.places.find((item) => item.id === op.placeId);
      if (!place) {
        conflict(op, 'gone', null);
        continue;
      }
      const server = fieldValue(place, op.field);
      if (sameValue(server, op.value)) {
        result.done.push(op.id);
      } else if (sameValue(server, op.base)) {
        trips.set(op.tripId, await api.schedule(op.tripId, op.placeId, { [op.field]: op.value }));
        result.done.push(op.id);
      } else {
        conflict(op, 'changed', server);
      }
    } catch (error) {
      const kind = classify(error);
      if (kind === 'gone') {
        conflict(op, 'gone', null);
      } else if (kind === 'rejected') {
        conflict(op, 'rejected', null);
      } else {
        // Can't reach the server (or it asked us to wait): keep this and everything after it, in order.
        result.remaining.push(...queue.slice(i));
        result.stoppedOffline = kind === 'unreachable';
        break;
      }
    }
  }
  result.trips = [...trips.values()];
  result.journals = [...journals.entries()].map(([tripId, journal]) => ({ tripId, journal }));
  return result;
}

/**
 * "Keep mine": the user saw the server's value and still wants theirs. The change
 * goes back in the queue with the server value as its new starting point, so the
 * next sync sends it (unless the server changes yet again).
 */
export function keepMine(item: Conflict): PendingOp | null {
  // A place that's gone or a change the server refused can't be re-sent as is.
  if (item.reason !== 'changed') return null;
  if (item.op.kind === 'reorder') {
    const server = Array.isArray(item.serverValue) ? (item.serverValue as string[]) : item.op.base;
    return { ...item.op, base: server, value: alignOrder(item.op.value, server) };
  }
  if (item.op.kind === 'visited') return { ...item.op, base: item.serverValue as boolean };
  if (item.op.kind === 'journal') return { ...item.op, base: item.serverValue as string | number | null };
  return { ...item.op, base: item.serverValue as ScheduleValue };
}

/**
 * After a sync run: removes the changes that run finished (sent, already there, or
 * now a conflict) from the CURRENT queue. A change edited again while the run was
 * in flight differs from what was sent, so it stays and goes out next time.
 */
export function settleQueue(
  current: readonly PendingOp[],
  sent: readonly PendingOp[],
  result: Pick<SyncResult, 'done' | 'conflicts'>,
): PendingOp[] {
  const sentById = new Map(sent.map((op) => [op.id, op]));
  const finished = new Set([...result.done, ...result.conflicts.map((item) => item.op.id)]);
  return current.filter((op) => {
    if (!finished.has(op.id)) return true;
    const before = sentById.get(op.id);
    return !(before && sameValue(before.value, op.value) && sameValue(before.base, op.base));
  });
}
