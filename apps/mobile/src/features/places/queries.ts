import type {
  CreatePlaceInput,
  GooglePlace,
  Place,
  PlaceList,
  SaveGooglePlacesInput,
  UpdatePlaceInput,
} from '@travel-companion/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLocale } from '@/i18n/LocaleProvider';
import { api } from '@/lib/api';

export const placesKey = ['places'] as const;
const placeListKey = ['places', 'list'] as const;
export const placeKey = (id: string) => ['places', 'detail', id] as const;
const googlePlaceKey = (placeId: string, lang: string) => ['google-place', placeId, lang] as const;
/** Trip details embed places, so place changes refresh them too. */
const tripsPrefix = ['trips'] as const;

/**
 * Google details are kept in memory for this app session only (never written
 * to disk), so each saved place costs at most one lookup per session.
 */
const GOOGLE_DETAILS_STALE_MS = 6 * 60 * 60 * 1000;

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

/** Fresh Google content for one place (name, address, location, type). */
export function useGooglePlace(placeId: string | null) {
  const { session } = useAuth();
  const { locale } = useLocale();
  return useQuery({
    queryKey: googlePlaceKey(placeId ?? '', locale),
    queryFn: () => api.getGooglePlace(placeId ?? '', locale),
    enabled: session !== null && placeId !== null,
    staleTime: GOOGLE_DETAILS_STALE_MS,
    gcTime: GOOGLE_DETAILS_STALE_MS,
  });
}

/** Google details for many places at once (for maps). Keyed like useGooglePlace, so shared. */
export function useGooglePlaces(placeIds: readonly string[]): Map<string, GooglePlace> {
  const { session } = useAuth();
  const { locale } = useLocale();
  const results = useQueries({
    queries: placeIds.map((placeId) => ({
      queryKey: googlePlaceKey(placeId, locale),
      queryFn: () => api.getGooglePlace(placeId, locale),
      enabled: session !== null,
      staleTime: GOOGLE_DETAILS_STALE_MS,
      gcTime: GOOGLE_DETAILS_STALE_MS,
    })),
  });
  const map = new Map<string, GooglePlace>();
  results.forEach((result, index) => {
    const id = placeIds[index];
    if (id && result.data) map.set(id, result.data);
  });
  return map;
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

export function useSaveGooglePlaces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveGooglePlacesInput) => api.saveGooglePlaces(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: placeListKey });
      void queryClient.invalidateQueries({ queryKey: tripsPrefix });
    },
  });
}

export function useUpdatePlace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlaceInput) => api.updatePlace(id, body),
    onSuccess: (place: Place) => {
      queryClient.setQueryData(placeKey(id), place);
      queryClient.setQueryData<PlaceList>(placeListKey, (list) =>
        list ? { items: list.items.map((item) => (item.id === id ? place : item)) } : list,
      );
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
