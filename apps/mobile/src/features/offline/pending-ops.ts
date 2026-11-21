import type { JournalDay, Place, Stop, StopStatus, TripDetailV2, TripJournal } from '@travel-companion/shared';

/**
 * M12a pending changes: the user's itinerary edits, recorded on the phone first and
 * sent to the server by sync.ts. Every change is a "set this value" (never "add one"),
 * so sending it twice is harmless. Each keeps the value it replaced (`base`) so sync
 * can tell whether the server changed in the meantime (see sync.ts).
 * Shaped like a PowerSync upload queue (one CRUD-like entry per change).
 */
export type ScheduleField = 'day' | 'startTime' | 'durationMinutes' | 'highlight';
export type ScheduleValue = string | number | boolean | null;
export type JournalField = 'note' | 'rating';

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
  value: ScheduleValue;
  base: ScheduleValue;
}

/** M15: a trip day's journal note or rating. */
export interface JournalOp extends OpBase {
  kind: 'journal';
  tripId: string;
  day: string;
  field: JournalField;
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

/** D1: a field of one visit. status is its lifecycle (planned → in_progress → completed / skipped). */
export type StopField = 'day' | 'startTime' | 'durationMinutes' | 'highlight' | 'status';
export type StopValue = string | number | boolean | null;

export interface StopOp extends OpBase {
  kind: 'stop';
  tripId: string;
  stopId: string;
  field: StopField;
  value: StopValue;
  base: StopValue;
}

/** D1: a new visit, created on the phone with its own id (sending it twice is harmless). */
export interface StopAddOp extends OpBase {
  kind: 'stopAdd';
  tripId: string;
  stopId: string;
  tripPlaceId: string;
  day: string;
  startTime: string | null;
  durationMinutes: number | null;
  highlight: boolean;
  value: true;
  base: false;
}

/** D1: remove a visit (a done one only after the user confirmed). */
export interface StopRemoveOp extends OpBase {
  kind: 'stopRemove';
  tripId: string;
  stopId: string;
  confirm: boolean;
  value: true;
  base: false;
}

/** D1: the order of one day's visits. */
export interface ReorderStopsOp extends OpBase {
  kind: 'reorderStops';
  tripId: string;
  day: string;
  value: string[];
  base: string[];
}

/**
 * schedule and reorder are pre-D1 (v1, by place id): still sent if an older
 * build left them queued, but new changes use the visit ops.
 */
export type PendingOp = VisitedOp | ScheduleOp | ReorderOp | JournalOp | StopOp | StopAddOp | StopRemoveOp | ReorderStopsOp;

/** Two ops change the same thing (and so are merged). */
function sameTarget(a: PendingOp, b: PendingOp): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'visited' && b.kind === 'visited') return a.placeId === b.placeId;
  if (a.kind === 'schedule' && b.kind === 'schedule') {
    return a.tripId === b.tripId && a.placeId === b.placeId && a.field === b.field;
  }
  if (a.kind === 'reorder' && b.kind === 'reorder') return a.tripId === b.tripId && a.day === b.day;
  if (a.kind === 'journal' && b.kind === 'journal') return a.tripId === b.tripId && a.day === b.day && a.field === b.field;
  if (a.kind === 'stop' && b.kind === 'stop') return a.stopId === b.stopId && a.field === b.field;
  if ((a.kind === 'stopAdd' && b.kind === 'stopAdd') || (a.kind === 'stopRemove' && b.kind === 'stopRemove')) {
    return a.stopId === b.stopId;
  }
  if (a.kind === 'reorderStops' && b.kind === 'reorderStops') return a.tripId === b.tripId && a.day === b.day;
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

const sortStops = (stops: Stop[]) =>
  stops.sort((a, b) => a.day.localeCompare(b.day) || a.position - b.position || a.createdAt.localeCompare(b.createdAt));

/** Positions 0..n-1 within a day, keeping order (like the server's renumbering). */
function renumber(stops: Stop[], day: string): Stop[] {
  const ordered = stops
    .filter((stop) => stop.day === day)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  const position = new Map(ordered.map((stop, index) => [stop.id, index]));
  return stops.map((stop) => (stop.day === day ? { ...stop, position: position.get(stop.id) ?? 0 } : stop));
}

/** A visit with a new status, timestamps set the way the server does. */
export function withStatus(stop: Stop, status: StopStatus, at: string): Stop {
  switch (status) {
    case 'planned':
      return { ...stop, status, arrivedAt: null, completedAt: null, skippedAt: null, completionSource: null };
    case 'in_progress':
      return { ...stop, status, arrivedAt: stop.arrivedAt ?? at, completedAt: null, skippedAt: null, completionSource: null };
    case 'completed':
      return { ...stop, status, completedAt: at, skippedAt: null, completionSource: 'user' };
    case 'skipped':
      return { ...stop, status, skippedAt: at, completedAt: null, completionSource: null };
  }
}

const endOfDay = (stops: readonly Stop[], day: string) =>
  stops.filter((stop) => stop.day === day).reduce((max, stop) => Math.max(max, stop.position + 1), 0);

/** Applies one op to a trip the way the server would. */
function applyOne(detail: TripDetailV2, op: PendingOp): TripDetailV2 {
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
  // Pre-D1 ops (by place id) are only sent, never drawn on the visits model.
  if (op.kind === 'journal' || op.kind === 'schedule' || op.kind === 'reorder' || op.tripId !== detail.trip.id) return detail;
  const at = new Date(op.createdAt).toISOString();

  if (op.kind === 'stopAdd') {
    if (detail.stops.some((stop) => stop.id === op.stopId)) return detail;
    const member = detail.places.find((place) => place.tripPlaceId === op.tripPlaceId);
    if (!member) return detail;
    const stop: Stop = {
      id: op.stopId,
      tripId: op.tripId,
      tripPlaceId: op.tripPlaceId,
      placeId: member.id,
      day: op.day,
      position: endOfDay(detail.stops, op.day),
      startTime: op.startTime,
      durationMinutes: op.durationMinutes,
      timeZone: null,
      status: 'planned',
      arrivedAt: null,
      completedAt: null,
      skippedAt: null,
      completionSource: null,
      highlight: op.highlight,
      createdAt: at,
      updatedAt: at,
      version: 1,
    };
    return { ...detail, stops: sortStops([...detail.stops, stop]) };
  }
  if (op.kind === 'stopRemove') {
    const target = detail.stops.find((stop) => stop.id === op.stopId);
    if (!target) return detail;
    return { ...detail, stops: sortStops(renumber(detail.stops.filter((stop) => stop.id !== op.stopId), target.day)) };
  }
  if (op.kind === 'reorderStops') {
    const order = new Map(op.value.map((id, index) => [id, index]));
    const stops = detail.stops.map((stop) =>
      stop.day === op.day && order.has(stop.id) ? { ...stop, position: order.get(stop.id) ?? 0 } : stop,
    );
    return { ...detail, stops: sortStops(renumber(stops, op.day)) };
  }

  const target = detail.stops.find((stop) => stop.id === op.stopId);
  if (!target) return detail;
  let stops = detail.stops;
  if (op.field === 'day') {
    const day = op.value as string;
    if (day === target.day) return detail;
    stops = renumber(
      stops.map((stop) => (stop.id === op.stopId ? { ...stop, day, position: endOfDay(stops, day) } : stop)),
      target.day,
    );
  } else if (op.field === 'status') {
    stops = stops.map((stop) => (stop.id === op.stopId ? withStatus(stop, op.value as StopStatus, at) : stop));
  } else {
    const key = op.field;
    stops = stops.map((stop) => (stop.id === op.stopId ? { ...stop, [key]: op.value } : stop));
  }
  return { ...detail, stops: sortStops([...stops]) };
}

/** What the user sees: the server copy with their pending changes on top, in order. */
export function applyOps(detail: TripDetailV2, ops: readonly PendingOp[]): TripDetailV2 {
  if (ops.length === 0) return detail;
  return [...ops].sort((a, b) => a.createdAt - b.createdAt).reduce(applyOne, detail);
}

/** A saved place with a pending Done/undo applied. */
export function applyVisitedOps<P extends Pick<Place, 'id' | 'visitedAt'>>(place: P, ops: readonly PendingOp[]): P {
  const op = ops.find((item): item is VisitedOp => item.kind === 'visited' && item.placeId === place.id);
  if (!op) return place;
  return { ...place, visitedAt: op.value ? (place.visitedAt ?? new Date(op.createdAt).toISOString()) : null };
}

/** Visits (and places) with a change waiting to sync (for a small marker on the stop). */
export function pendingPlaceIds(ops: readonly PendingOp[]): Set<string> {
  return new Set(
    ops.flatMap((op) =>
      op.kind === 'reorder' || op.kind === 'journal' || op.kind === 'reorderStops'
        ? []
        : op.kind === 'stop' || op.kind === 'stopAdd' || op.kind === 'stopRemove'
          ? [op.stopId]
          : [op.placeId],
    ),
  );
}

/** The journal the user sees: the server copy with pending notes/ratings on top. */
export function applyJournalOps(journal: TripJournal, tripId: string, ops: readonly PendingOp[]): TripJournal {
  const mine = ops
    .filter((op): op is JournalOp => op.kind === 'journal' && op.tripId === tripId)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (mine.length === 0) return journal;
  const days = new Map(journal.days.map((entry) => [entry.day, entry]));
  for (const op of mine) {
    const entry: JournalDay = days.get(op.day) ?? {
      day: op.day,
      note: null,
      rating: null,
      updatedAt: new Date(op.createdAt).toISOString(),
    };
    days.set(op.day, { ...entry, [op.field]: op.value });
  }
  return {
    days: [...days.values()]
      .filter((entry) => entry.note !== null || entry.rating !== null)
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function newOpId(nowMs: number): string {
  return `op_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
