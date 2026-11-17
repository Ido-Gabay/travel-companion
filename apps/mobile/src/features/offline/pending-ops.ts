import type { Place, TripDetail, TripPlace } from '@travel-companion/shared';

/**
 * M12a pending changes: the user's itinerary edits, recorded on the phone first and
 * sent to the server by sync.ts. Every change is a "set this value" (never "add one"),
 * so sending it twice is harmless. Each keeps the value it replaced (`base`) so sync
 * can tell whether the server changed in the meantime (see sync.ts).
 * Shaped like a PowerSync upload queue (one CRUD-like entry per change).
 */
export type ScheduleField = 'day' | 'startTime' | 'durationMinutes';

interface OpBase {
  /** Unique per change (kept when later edits to the same thing are merged into it). */
  id: string;
  /** When the user made the change (ms). Sync replays in this order. */
  createdAt: number;
}

export interface VisitedOp extends OpBase {
  kind: 'visited';
  placeId: string;
  value: boolean;
  base: boolean;
}

export interface ScheduleOp extends OpBase {
  kind: 'schedule';
  tripId: string;
  placeId: string;
  field: ScheduleField;
  value: string | number | null;
  base: string | number | null;
}

export interface ReorderOp extends OpBase {
  kind: 'reorder';
  tripId: string;
  day: string;
  /** Place ids in the new order. */
  value: string[];
  /** The order the user saw before reordering. */
  base: string[];
}

export type PendingOp = VisitedOp | ScheduleOp | ReorderOp;

/** Two ops change the same thing (and so are merged). */
function sameTarget(a: PendingOp, b: PendingOp): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'visited' && b.kind === 'visited') return a.placeId === b.placeId;
  if (a.kind === 'schedule' && b.kind === 'schedule') {
    return a.tripId === b.tripId && a.placeId === b.placeId && a.field === b.field;
  }
  if (a.kind === 'reorder' && b.kind === 'reorder') return a.tripId === b.tripId && a.day === b.day;
  return false;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => item === b[i]);
  return a === b;
}

/**
 * Adds a change. A later change to the same thing replaces the earlier one's value
 * but keeps its original `base` (what the server had); a change back to that base
 * cancels out (e.g. Done then undo offline = nothing to send).
 */
export function enqueue(ops: readonly PendingOp[], op: PendingOp): PendingOp[] {
  const index = ops.findIndex((item) => sameTarget(item, op));
  if (index < 0) return sameValue(op.value, op.base) ? [...ops] : [...ops, op];
  const earlier = ops[index] as PendingOp;
  const merged = { ...earlier, value: op.value } as PendingOp;
  const rest = ops.filter((_, i) => i !== index);
  return sameValue(merged.value, merged.base) ? rest : [...rest.slice(0, index), merged, ...rest.slice(index)];
}

const sortPlaces = (places: TripPlace[]) =>
  places.sort((a, b) => {
    if (a.day !== b.day) return a.day === null ? 1 : b.day === null ? -1 : a.day.localeCompare(b.day);
    return a.position - b.position || a.addedAt.localeCompare(b.addedAt);
  });

/** Positions 0..n-1 within each day, keeping order (like the server's renumberDay). */
function renumber(places: TripPlace[], day: string): TripPlace[] {
  const ordered = places
    .filter((place) => place.day === day)
    .sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt));
  const position = new Map(ordered.map((place, index) => [place.id, index]));
  return places.map((place) => (place.day === day ? { ...place, position: position.get(place.id) ?? 0 } : place));
}

/** Applies one op to a trip the way the server would. */
function applyOne(detail: TripDetail, op: PendingOp): TripDetail {
  if (op.kind === 'visited') {
    return {
      ...detail,
      places: detail.places.map((place) =>
        place.id === op.placeId
          ? { ...place, visitedAt: op.value ? (place.visitedAt ?? new Date(op.createdAt).toISOString()) : null }
          : place,
      ),
    };
  }
  if (op.tripId !== detail.id) return detail;
  if (op.kind === 'reorder') {
    const order = new Map(op.value.map((id, index) => [id, index]));
    const places = detail.places.map((place) =>
      place.day === op.day && order.has(place.id) ? { ...place, position: order.get(place.id) ?? 0 } : place,
    );
    return { ...detail, places: sortPlaces(renumber(places, op.day)) };
  }
  const target = detail.places.find((place) => place.id === op.placeId);
  if (!target) return detail;
  let places = detail.places;
  if (op.field === 'day') {
    const day = op.value as string | null;
    if (day === target.day) return detail;
    const end = places.filter((place) => place.day === day).reduce((max, place) => Math.max(max, place.position + 1), 0);
    places = places.map((place) =>
      place.id === op.placeId
        ? day === null
          ? { ...place, day: null, startTime: null, position: 0 }
          : { ...place, day, position: end }
        : place,
    );
    if (target.day !== null) places = renumber(places, target.day);
  } else if (op.field === 'startTime') {
    places = places.map((place) =>
      place.id === op.placeId && place.day !== null ? { ...place, startTime: op.value as string | null } : place,
    );
  } else {
    places = places.map((place) =>
      place.id === op.placeId ? { ...place, durationMinutes: op.value as number | null } : place,
    );
  }
  return { ...detail, places: sortPlaces([...places]) };
}

/** What the user sees: the server copy with their pending changes on top, in order. */
export function applyOps(detail: TripDetail, ops: readonly PendingOp[]): TripDetail {
  if (ops.length === 0) return detail;
  return [...ops].sort((a, b) => a.createdAt - b.createdAt).reduce(applyOne, detail);
}

/** A saved place with a pending Done/undo applied. */
export function applyVisitedOps<P extends Pick<Place, 'id' | 'visitedAt'>>(place: P, ops: readonly PendingOp[]): P {
  const op = ops.find((item): item is VisitedOp => item.kind === 'visited' && item.placeId === place.id);
  if (!op) return place;
  return { ...place, visitedAt: op.value ? (place.visitedAt ?? new Date(op.createdAt).toISOString()) : null };
}

/** Places with a change waiting to sync (for a small marker on the stop). */
export function pendingPlaceIds(ops: readonly PendingOp[]): Set<string> {
  return new Set(ops.flatMap((op) => (op.kind === 'reorder' ? [] : [op.placeId])));
}

export function newOpId(nowMs: number): string {
  return `op_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
