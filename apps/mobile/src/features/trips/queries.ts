import type {
  CreateStayInput,
  CreateTripInput,
  PlaceCategory,
  StopStatus,
  TripDetailV2,
  TripList,
  UpdateStayInput,
  UpdateTripInput,
  UpdateTripV2Input,
} from '@travel-companion/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { addOps, dropOps, getPendingState, syncPending, usePendingState } from '@/features/offline/ops-store';
import { applyOps, newOpId, type PendingOp, type StopField, type StopValue } from '@/features/offline/pending-ops';
import { placesKey } from '@/features/places/queries';
import { api } from '@/lib/api';
import { buildTripView, isUpcoming, newId, visitsForDay, type TripItem, type TripView } from './model';

export const tripsKey = ['trips'] as const;
export const tripKey = (id: string) => ['trips', 'detail', id] as const;
const tripListKey = ['trips', 'list'] as const;

export function useTrips() {
  const { session } = useAuth();
  return useQuery({ queryKey: tripListKey, queryFn: api.listTrips, enabled: session !== null });
}

/**
 * One trip (D1: from API v2). What screens get is the server copy with the
 * user's pending (not yet synced) changes on top, as a TripView; the cache and
 * the saved copy keep the server's.
 */
export function useTrip(id: string) {
  const { session } = useAuth();
  const { ops } = usePendingState();
  const select = useCallback((detail: TripDetailV2) => buildTripView(applyOps(detail, ops)), [ops]);
  return useQuery({
    queryKey: tripKey(id),
    queryFn: () => api.getTripV2(id),
    enabled: session !== null && id.length > 0,
    select,
  });
}

/** The trip as the user sees it right now (server copy + pending changes), outside React. */
function currentView(queryClient: QueryClient, tripId: string): TripView | null {
  const detail = queryClient.getQueryData<TripDetailV2>(tripKey(tripId));
  return detail ? buildTripView(applyOps(detail, getPendingState().ops)) : null;
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTripInput) => api.createTrip(body),
    onSuccess: (trip) => {
      queryClient.setQueryData<TripList>(tripListKey, (list) =>
        list ? { items: [...list.items, trip] } : list,
      );
      void queryClient.invalidateQueries({ queryKey: tripListKey });
    },
  });
}

/** v1 trip fields (used for "Staying at" on create). */
export function useUpdateTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTripInput) => api.updateTrip(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripListKey });
      void queryClient.invalidateQueries({ queryKey: tripKey(id) });
    },
  });
}

/**
 * Name, destination, dates, zone (v2). D1 Q5: dates that leave visits outside
 * fail with STOPS_OUTSIDE_DATES; the screen asks, then sends unscheduleOutside.
 */
export function useUpdateTripV2(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTripV2Input) => api.updateTripV2(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripListKey });
      void queryClient.invalidateQueries({ queryKey: tripKey(id) });
    },
  });
}

/** D1 Q4: done visits stay in place history unless deleteHistory. */
export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteHistory }: { id: string; deleteHistory: boolean }) => api.deleteTripV2(id, deleteHistory),
    onSuccess: (_result, { id }) => {
      queryClient.removeQueries({ queryKey: tripKey(id) });
      queryClient.setQueryData<TripList>(tripListKey, (list) =>
        list ? { items: list.items.filter((trip) => trip.id !== id) } : list,
      );
      void queryClient.invalidateQueries({ queryKey: tripListKey });
      void queryClient.invalidateQueries({ queryKey: placesKey });
    },
  });
}

/** After a place is saved or removed: store the fresh detail, refresh counts elsewhere. */
function applyTripDetail(queryClient: QueryClient, detail: TripDetailV2) {
  queryClient.setQueryData(tripKey(detail.trip.id), detail);
  void queryClient.invalidateQueries({ queryKey: tripListKey });
  void queryClient.invalidateQueries({ queryKey: placesKey });
}

/** Save a place from the collection to the trip (no visit yet). */
export function useAddTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.addTripMember(tripId, { placeId }),
    onSuccess: (detail) => applyTripDetail(queryClient, detail),
  });
}

/**
 * The trip assistant's found place: saved to the collection (deduped by Google
 * place ID) and to this trip, online. Returns its trip membership id, so the
 * visit can then go through the change queue like any other.
 */
export function useSaveFoundPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ googlePlaceId, category }: { googlePlaceId: string; category: PlaceCategory }): Promise<string> => {
      await api.saveGooglePlaces({ items: [{ googlePlaceId, category }], tripId });
      const detail = await api.getTripV2(tripId);
      applyTripDetail(queryClient, detail);
      const member = detail.places.find((place) => place.googlePlaceId === googlePlaceId);
      if (!member) throw new Error('The saved place is not in the trip.');
      return member.tripPlaceId;
    },
  });
}

/** Remove a saved place (by its place id) from the trip: planned visits go with it, done ones stay in history. */
export function useRemoveTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (placeId: string) => {
      const detail = queryClient.getQueryData<TripDetailV2>(tripKey(tripId)) ?? (await api.getTripV2(tripId));
      const member = detail.places.find((place) => place.id === placeId);
      return member ? api.removeTripMember(tripId, member.tripPlaceId) : detail;
    },
    onSuccess: (detail) => applyTripDetail(queryClient, detail),
  });
}

type ScheduleBody = { day?: string | null; startTime?: string | null; durationMinutes?: number | null; highlight?: boolean };

const fieldOf = (item: TripItem, field: Exclude<StopField, 'status'>): StopValue =>
  field === 'day' ? item.day : field === 'startTime' ? item.startTime : field === 'highlight' ? item.highlight : item.durationMinutes;

/** Records a new visit on the phone (synced like every other change). Returns its id. */
async function planVisit(
  tripId: string,
  tripPlaceId: string,
  day: string,
  extra: { startTime?: string | null; durationMinutes?: number | null; highlight?: boolean } = {},
): Promise<string> {
  const stopId = newId();
  const now = Date.now();
  await addOps([
    {
      id: newOpId(now),
      kind: 'stopAdd',
      tripId,
      stopId,
      tripPlaceId,
      day,
      startTime: extra.startTime ?? null,
      durationMinutes: extra.durationMinutes ?? null,
      highlight: extra.highlight ?? false,
      value: true,
      base: false,
      createdAt: now,
    },
  ]);
  return stopId;
}

/** Removes a visit; one only created on this phone (not synced yet) just disappears. */
async function removeVisit(tripId: string, stopId: string, confirm: boolean): Promise<void> {
  const local = getPendingState().ops.some((op) => op.kind === 'stopAdd' && op.stopId === stopId);
  if (local) {
    await dropOps((op) => (op.kind === 'stopAdd' || op.kind === 'stop' || op.kind === 'stopRemove') && op.stopId === stopId);
    return;
  }
  const now = Date.now();
  await addOps([{ id: newOpId(now), kind: 'stopRemove', tripId, stopId, confirm, value: true, base: false, createdAt: now }]);
}

/**
 * Plan an item for a day, set its time, length or star, or take it off the
 * plan (day null). An item is a visit, or a saved place not planned yet
 * (planning it creates its first visit). Recorded on the phone first (shows at
 * once, works offline), then synced; each field is its own change so conflicts
 * are checked per field.
 */
export function useScheduleTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId: itemId, ...body }: ScheduleBody & { placeId: string }) => {
      const item = currentView(queryClient, tripId)?.places.find((entry) => entry.id === itemId);
      if (!item) return;
      if (item.stopId === null) {
        if (typeof body.day === 'string') await planVisit(tripId, item.tripPlaceId, body.day, body);
      } else if (body.day === null) {
        await removeVisit(tripId, item.stopId, false);
      } else {
        const stopId = item.stopId;
        const now = Date.now();
        const ops: PendingOp[] = (['day', 'startTime', 'durationMinutes', 'highlight'] as const)
          .filter((field) => body[field] !== undefined)
          .map((field, index) => ({
            id: newOpId(now + index),
            kind: 'stop',
            tripId,
            stopId,
            field,
            value: body[field] ?? null,
            base: fieldOf(item, field),
            createdAt: now + index,
          }));
        await addOps(ops);
      }
      void syncPending(queryClient);
    },
  });
}

/**
 * D1 complete trip plan: everything the user accepted, through the change queue
 * (shows at once, works offline, synced with conflict checks). New visits first
 * (with their time), then day moves, then times, then each day's order. Only
 * days and times are set: nothing is removed, and no other field changes.
 */
export function useApplyTripPlan(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: {
      adds: readonly { tripPlaceId: string; day: string; startTime: string | null; durationMinutes?: number | null }[];
      moves: readonly { stopId: string; day: string }[];
      times: readonly { stopId: string; startTime: string }[];
      orders: readonly { day: string; ids: readonly string[] }[];
      /** Longer (or shorter) visits the user accepted (the trip assistant). */
      durations?: readonly { stopId: string; minutes: number }[];
      /** Visits the user chose to skip (live changes); they stay in the trip, marked skipped. */
      skips?: readonly string[];
    }) => {
      const newIds = new Map<string, string>();
      for (const add of plan.adds) {
        newIds.set(
          add.tripPlaceId,
          await planVisit(tripId, add.tripPlaceId, add.day, { startTime: add.startTime, durationMinutes: add.durationMinutes ?? null }),
        );
      }
      const view = currentView(queryClient, tripId);
      const itemOf = (stopId: string) => view?.places.find((entry) => entry.stopId === stopId);
      const now = Date.now();
      const ops: PendingOp[] = [];
      const field = (stopId: string, name: 'day' | 'startTime' | 'durationMinutes', value: string | number) => {
        const item = itemOf(stopId);
        if (!item) return;
        ops.push({ id: newOpId(now + ops.length), kind: 'stop', tripId, stopId, field: name, value, base: fieldOf(item, name), createdAt: now + ops.length });
      };
      for (const move of plan.moves) field(move.stopId, 'day', move.day);
      for (const time of plan.times) field(time.stopId, 'startTime', time.startTime);
      for (const duration of plan.durations ?? []) field(duration.stopId, 'durationMinutes', duration.minutes);
      for (const stopId of plan.skips ?? []) {
        const item = itemOf(stopId);
        if (!item?.status || item.status === 'skipped' || item.status === 'completed') continue;
        ops.push({ id: newOpId(now + ops.length), kind: 'stop', tripId, stopId, field: 'status', value: 'skipped', base: item.status, createdAt: now + ops.length });
      }
      if (ops.length > 0) await addOps(ops);
      for (const order of plan.orders) {
        // The day as it is now (with the visits just added and moved); anything not in the plan keeps its place after.
        const current = currentView(queryClient, tripId);
        const dayIds = current ? visitsForDay(current.places, order.day).map((item) => item.id) : [];
        const planned = order.ids.map((id) => newIds.get(id) ?? id).filter((id) => dayIds.includes(id));
        const value = [...planned, ...dayIds.filter((id) => !planned.includes(id))];
        const at = Date.now();
        await addOps([{ id: newOpId(at), kind: 'reorderStops', tripId, day: order.day, value, base: dayIds, createdAt: at }]);
      }
      void syncPending(queryClient);
    },
  });
}

/** Another visit to a place already saved to the trip (repeat visits are separate records). */
export function usePlanVisit(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripPlaceId, day }: { tripPlaceId: string; day: string }) => {
      await planVisit(tripId, tripPlaceId, day);
      void syncPending(queryClient);
    },
  });
}

/** A visit's lifecycle: planned, in progress (arrived), done, skipped. Offline-safe. */
export function useSetVisitStatus(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stopId, status }: { stopId: string; status: StopStatus }) => {
      const item = currentView(queryClient, tripId)?.places.find((entry) => entry.stopId === stopId);
      if (!item?.status || item.status === status) return;
      const now = Date.now();
      await addOps([
        { id: newOpId(now), kind: 'stop', tripId, stopId, field: 'status', value: status, base: item.status, createdAt: now },
      ]);
      void syncPending(queryClient);
    },
  });
}

/** Remove a visit. A done visit leaves the place's history, so the screen confirms first. */
export function useRemoveVisit(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stopId, confirm }: { stopId: string; confirm: boolean }) => {
      await removeVisit(tripId, stopId, confirm);
      void syncPending(queryClient);
    },
  });
}

/** Reorder one day's visits (ids are visit ids). Recorded on the phone first, then synced. */
export function useReorderTripDay(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ day, placeIds: stopIds }: { day: string; placeIds: string[] }) => {
      const view = currentView(queryClient, tripId);
      const now = Date.now();
      await addOps([
        {
          id: newOpId(now),
          kind: 'reorderStops',
          tripId,
          day,
          value: stopIds,
          base: view ? visitsForDay(view.places, day).map((item) => item.id) : stopIds,
          createdAt: now,
        },
      ]);
      void syncPending(queryClient);
    },
  });
}

/** Stays (online: a stay is set up while planning, not on the move). Each returns a zone to confirm when one could be suggested. */
export function useSaveStay(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stayId, body }: { stayId: string | null; body: CreateStayInput | UpdateStayInput }) =>
      stayId ? api.updateStay(tripId, stayId, body as UpdateStayInput) : api.addStay(tripId, { id: newId(), ...(body as CreateStayInput) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripKey(tripId) });
      void queryClient.invalidateQueries({ queryKey: tripListKey });
    },
  });
}

export function useRemoveStay(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stayId: string) => api.removeStay(tripId, stayId),
    onSuccess: (detail) => applyTripDetail(queryClient, detail),
  });
}

/**
 * D1 Q2 "Use my own pin": in every trip where the Google place is saved, save
 * the user's own place too and move the visits still to come onto it. Visits
 * already done stay with the Google place (that's where they happened). The
 * Google place stays saved; the user can remove it.
 */
export function useUseOwnPinInTrips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ googlePlaceId, ownPlaceId }: { googlePlaceId: string; ownPlaceId: string }) => {
      const trips = queryClient
        .getQueriesData<TripDetailV2>({ queryKey: ['trips', 'detail'] })
        .flatMap(([, detail]) => (detail && detail.places.some((place) => place.id === googlePlaceId) ? [detail] : []));
      let moved = 0;
      for (const trip of trips) {
        const tripId = trip.trip.id;
        const google = trip.places.find((place) => place.id === googlePlaceId)!;
        const saved = await api.addTripMember(tripId, { placeId: ownPlaceId });
        const own = saved.places.find((place) => place.id === ownPlaceId);
        if (!own) continue;
        for (const stop of saved.stops.filter((item) => item.tripPlaceId === google.tripPlaceId && isUpcoming(item.status))) {
          await api.updateStop(tripId, stop.id, { tripPlaceId: own.tripPlaceId });
          moved += 1;
        }
        queryClient.setQueryData(tripKey(tripId), await api.getTripV2(tripId));
      }
      void queryClient.invalidateQueries({ queryKey: placesKey });
      return { trips: trips.length, moved };
    },
  });
}

/** Trips (in the saved copies) where this place is saved, with how many visits are still to come. */
export function tripsWithPlace(queryClient: QueryClient, placeId: string): { tripId: string; upcoming: number }[] {
  return queryClient.getQueriesData<TripDetailV2>({ queryKey: ['trips', 'detail'] }).flatMap(([, detail]) => {
    const member = detail?.places.find((place) => place.id === placeId);
    if (!detail || !member) return [];
    return [{ tripId: detail.trip.id, upcoming: detail.stops.filter((stop) => stop.tripPlaceId === member.tripPlaceId && isUpcoming(stop.status)).length }];
  });
}
