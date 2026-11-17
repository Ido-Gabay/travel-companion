import type { CreateTripInput, TripDetail, TripList, UpdateTripInput } from '@travel-companion/shared';
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
