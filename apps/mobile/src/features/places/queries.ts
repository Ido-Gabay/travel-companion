import type { CreatePlaceInput, PlaceList, UpdatePlaceInput } from '@travel-companion/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';

export const placesKey = ['places'] as const;
const placeListKey = ['places', 'list'] as const;
export const placeKey = (id: string) => ['places', 'detail', id] as const;
/** Trip details embed place names and notes, so place edits refresh them too. */
const tripsPrefix = ['trips'] as const;

export function usePlaces() {
  const { session } = useAuth();
  return useQuery({ queryKey: placeListKey, queryFn: api.listPlaces, enabled: session !== null });
}

export function usePlace(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: placeKey(id),
    queryFn: () => api.getPlace(id),
    enabled: session !== null && id.length > 0,
  });
}

export function useCreatePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePlaceInput) => api.createPlace(body),
    onSuccess: (place) => {
      queryClient.setQueryData<PlaceList>(placeListKey, (list) =>
        list ? { items: [place, ...list.items] } : list,
      );
      void queryClient.invalidateQueries({ queryKey: placeListKey });
    },
  });
}

export function useUpdatePlace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlaceInput) => api.updatePlace(id, body),
    onSuccess: (place) => {
      queryClient.setQueryData(placeKey(id), place);
      void queryClient.invalidateQueries({ queryKey: placeListKey });
      void queryClient.invalidateQueries({ queryKey: tripsPrefix });
    },
  });
}

export function useDeletePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePlace(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: placeKey(id) });
      queryClient.setQueryData<PlaceList>(placeListKey, (list) =>
        list ? { items: list.items.filter((place) => place.id !== id) } : list,
      );
      void queryClient.invalidateQueries({ queryKey: placeListKey });
      void queryClient.invalidateQueries({ queryKey: tripsPrefix });
    },
  });
}
