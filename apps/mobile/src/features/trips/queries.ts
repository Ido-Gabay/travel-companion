import type {
  CreateTripInput,
  ScheduleTripPlaceInput,
  TripDetail,
  TripList,
  UpdateTripInput,
} from '@travel-companion/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { placesKey } from '@/features/places/queries';
import { api } from '@/lib/api';

export const tripsKey = ['trips'] as const;
export const tripKey = (id: string) => ['trips', 'detail', id] as const;
const tripListKey = ['trips', 'list'] as const;

export function useTrips() {
  const { session } = useAuth();
  return useQuery({ queryKey: tripListKey, queryFn: api.listTrips, enabled: session !== null });
}

export function useTrip(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: tripKey(id),
    queryFn: () => api.getTrip(id),
    enabled: session !== null && id.length > 0,
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

/** Plan a trip place for a day, set its time, or move it back to the wishlist. */
export function useScheduleTripPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, ...body }: ScheduleTripPlaceInput & { placeId: string }) =>
      api.scheduleTripPlace(tripId, placeId, body),
    onSuccess: (detail) => queryClient.setQueryData(tripKey(detail.id), detail),
    onError: () => void queryClient.invalidateQueries({ queryKey: tripKey(tripId) }),
  });
}

/** Reorder one day. The new order shows at once and is rolled back if saving fails. */
export function useReorderTripDay(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ day, placeIds }: { day: string; placeIds: string[] }) =>
      api.reorderTripDay(tripId, day, { placeIds }),
    onMutate: async ({ day, placeIds }) => {
      await queryClient.cancelQueries({ queryKey: tripKey(tripId) });
      const previous = queryClient.getQueryData<TripDetail>(tripKey(tripId));
      if (previous) {
        const order = new Map(placeIds.map((id, index) => [id, index]));
        queryClient.setQueryData<TripDetail>(tripKey(tripId), {
          ...previous,
          places: previous.places.map((place) =>
            place.day === day && order.has(place.id) ? { ...place, position: order.get(place.id) ?? 0 } : place,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(tripKey(tripId), context.previous);
      void queryClient.invalidateQueries({ queryKey: tripKey(tripId) });
    },
    onSuccess: (detail) => queryClient.setQueryData(tripKey(detail.id), detail),
  });
}
