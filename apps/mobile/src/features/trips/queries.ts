import type {
  CreateTripInput,
  ScheduleTripPlaceInput,
  TripDetail,
  TripList,
  UpdateTripInput,
} from '@travel-companion/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { addOps, syncPending, usePendingState } from '@/features/offline/ops-store';
import { applyOps, newOpId, type PendingOp, type ScheduleField } from '@/features/offline/pending-ops';
import { dayOrder } from '@/features/offline/sync';
import { placesKey } from '@/features/places/queries';
import { api } from '@/lib/api';

export const tripsKey = ['trips'] as const;
export const tripKey = (id: string) => ['trips', 'detail', id] as const;
const tripListKey = ['trips', 'list'] as const;

export function useTrips() {
  const { session } = useAuth();
  return useQuery({ queryKey: tripListKey, queryFn: api.listTrips, enabled: session !== null });
}

/**
 * One trip. M12a: what screens get is the server copy with the user's pending
 * (not yet synced) changes on top; the cache and the saved copy keep the server's.
 */
export function useTrip(id: string) {
  const { session } = useAuth();
  const { ops } = usePendingState();
  const select = useCallback((detail: TripDetail) => applyOps(detail, ops), [ops]);
  return useQuery({
    queryKey: tripKey(id),
    queryFn: () => api.getTrip(id),
    enabled: session !== null && id.length > 0,
    select,
  });
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

export function useUpdateTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTripInput) => api.updateTrip(id, body),
    onSuccess: (trip) => {
      queryClient.setQueryData<TripDetail>(tripKey(id), (detail) => (detail ? { ...detail, ...trip } : detail));
      void queryClient.invalidateQueries({ queryKey: tripListKey });
      void queryClient.invalidateQueries({ queryKey: tripKey(id) });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTrip(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: tripKey(id) });
      queryClient.setQueryData<TripList>(tripListKey, (list) =>
        list ? { items: list.items.filter((trip) => trip.id !== id) } : list,
      );
      void queryClient.invalidateQueries({ queryKey: tripListKey });
      void queryClient.invalidateQueries({ queryKey: placesKey });
    },
  });
}

/** After a place is added or removed: store the fresh detail, refresh counts elsewhere. */
function applyTripDetail(queryClient: QueryClient, detail: TripDetail) {
  queryClient.setQueryData(tripKey(detail.id), detail);
  void queryClient.invalidateQueries({ queryKey: tripListKey });
  void queryClient.invalidateQueries({ queryKey: placesKey });
}

export function useAddTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.addTripPlace(tripId, placeId),
    onSuccess: (detail) => applyTripDetail(queryClient, detail),
  });
}

export function useRemoveTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.removeTripPlace(tripId, placeId),
    onSuccess: (detail) => applyTripDetail(queryClient, detail),
  });
}

/**
 * Plan a trip place for a day, set its time or visit length, or move it back to the
 * wishlist. M12a: recorded on the phone first (shows at once, works offline), then
 * synced; each field is its own change so conflicts are checked per field.
 */
export function useScheduleTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, ...body }: ScheduleTripPlaceInput & { placeId: string }) => {
      // The server's copy (not the screen's) is each change's starting point.
      const server = queryClient.getQueryData<TripDetail>(tripKey(tripId))?.places.find((place) => place.id === placeId);
      const now = Date.now();
      const ops: PendingOp[] = (['day', 'startTime', 'durationMinutes', 'highlight'] as const)
        .filter((field): field is ScheduleField => body[field] !== undefined)
        .map((field, index) => ({
          id: newOpId(now + index),
          kind: 'schedule',
          tripId,
          placeId,
          field,
          value: body[field] ?? null,
          base: server
            ? field === 'day'
              ? server.day
              : field === 'startTime'
                ? server.startTime
                : field === 'highlight'
                  ? server.highlight
                  : server.durationMinutes
            : field === 'highlight'
              ? false
              : null,
          createdAt: now + index,
        }));
      await addOps(ops);
      void syncPending(queryClient);
    },
  });
}

/** Reorder one day. M12a: recorded on the phone first (shows at once, works offline), then synced. */
export function useReorderTripDay(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ day, placeIds }: { day: string; placeIds: string[] }) => {
      const server = queryClient.getQueryData<TripDetail>(tripKey(tripId));
      const now = Date.now();
      await addOps([
        {
          id: newOpId(now),
          kind: 'reorder',
          tripId,
          day,
          value: placeIds,
          base: server ? dayOrder(server.places, day) : placeIds,
          createdAt: now,
        },
      ]);
      void syncPending(queryClient);
    },
  });
}
