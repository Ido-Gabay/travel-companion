import type {
  CreatePlaceInput,
  GooglePlace,
  GooglePlacePreview,
  Place,
  PlaceList,
  SaveGooglePlacesInput,
  SupportedLocale,
  TripDetailV2,
  UpdatePlaceInput,
} from '@travel-companion/shared';
import { categoryForGoogleType } from '@travel-companion/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { addOps, syncPending, usePendingState } from '@/features/offline/ops-store';
import { applyVisitedOps, newOpId } from '@/features/offline/pending-ops';
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
  const queryClient = useQueryClient();
  const { ops } = usePendingState();
  const select = useCallback((place: Place) => applyVisitedOps(place, ops), [ops]);
  return useQuery({
    select,
    queryKey: placeKey(id),
    queryFn: () => api.getPlace(id),
    enabled: session !== null && id.length > 0,
    // M12a: a stop opened from a saved trip starts from its own data in that trip (kept if
    // refreshing fails offline); updatedAt 0 = always refreshed from the server when possible.
    initialDataUpdatedAt: 0,
    initialData: () => {
      for (const [, detail] of queryClient.getQueriesData<TripDetailV2>({ queryKey: [...tripsPrefix, 'detail'] })) {
        const match = detail?.places.find((place) => place.id === id);
        if (match) return match;
      }
      return undefined;
    },
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

/**
 * Google details for many places at once (for maps). Keyed like useGooglePlace, so shared.
 * With `fetch` false, only what's already in memory (no lookups).
 */
export function useGooglePlaces(placeIds: readonly string[], fetch = true): Map<string, GooglePlace> {
  const { session } = useAuth();
  const { locale } = useLocale();
  const results = useQueries({
    queries: placeIds.map((placeId) => ({
      queryKey: googlePlaceKey(placeId, locale),
      queryFn: () => api.getGooglePlace(placeId, locale),
      enabled: session !== null && fetch,
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

/**
 * One of the user's own places → the Google place they picked (online; the server keeps trips and visits).
 * The result's Google type sets the category of an unclassified place (the server keeps a chosen one).
 */
export function useLinkGooglePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, googlePlaceId, primaryType }: { placeId: string; googlePlaceId: string; primaryType: string | null }) =>
      api.linkGooglePlace(placeId, { googlePlaceId, category: categoryForGoogleType(primaryType) }),
    onSuccess: (place, { placeId }) => {
      queryClient.setQueryData(placeKey(place.id), place);
      if (place.id !== placeId) queryClient.removeQueries({ queryKey: placeKey(placeId) });
      void queryClient.invalidateQueries({ queryKey: placesKey });
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

/**
 * Mark any place visited or not visited. M12a: recorded on the phone first (the
 * check shows at once in every trip, and works offline), then synced.
 */
export function useSetVisited() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visited }: { id: string; visited: boolean }) => {
      const now = Date.now();
      // A new change starts from what the screen showed (the opposite); merged changes keep the first base.
      await addOps([{ id: newOpId(now), kind: 'visited', placeId: id, value: visited, base: !visited, createdAt: now }]);
      void syncPending(queryClient);
    },
  });
}

/**
 * Puts Google results the app already has (e.g. from a search) into the
 * in-memory details cache, so opening or saving one doesn't need another
 * Google request. Memory only, like all Google content in the app.
 */
export function usePrimeGooglePlaces() {
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  return (places: readonly GooglePlace[]) => {
    for (const place of places) {
      const { placeId, name, address, location, primaryType, typeLabel, googleMapsUri, businessStatus, timeZone } = place;
      queryClient.setQueryData<GooglePlace>(googlePlaceKey(placeId, locale), {
        placeId,
        name,
        address,
        location,
        primaryType,
        typeLabel,
        googleMapsUri,
        businessStatus,
        timeZone,
      });
    }
  };
}

/**
 * Rating, hours and photo list for the place preview. Kept in memory for the
 * session only, so reopening a place costs nothing extra.
 */
export function useGooglePlacePreview(placeId: string | null) {
  const { session } = useAuth();
  const { locale } = useLocale();
  return useQuery<GooglePlacePreview>({
    ...previewQuery(placeId ?? '', locale),
    enabled: session !== null && placeId !== null,
  });
}

function previewQuery(placeId: string, locale: SupportedLocale) {
  return {
    queryKey: ['google-place-preview', placeId, locale],
    queryFn: () => api.getGooglePlacePreview(placeId, locale),
    staleTime: GOOGLE_DETAILS_STALE_MS,
    gcTime: GOOGLE_DETAILS_STALE_MS,
    retry: 1,
  };
}

/**
 * Previews (incl. opening hours) for several places, only while `enabled` (M13 day
 * planning: the user tapped "Check opening hours"). Same cache as the preview sheet,
 * in memory only. Each place is one Enterprise request, counted against the preview cap.
 */
export function useGooglePlacePreviews(
  placeIds: readonly string[],
  enabled: boolean,
): { byId: Map<string, GooglePlacePreview>; pending: boolean; failed: number } {
  const { session } = useAuth();
  const { locale } = useLocale();
  const results = useQueries({
    queries: placeIds.map((placeId) => ({
      ...previewQuery(placeId, locale),
      enabled: enabled && session !== null,
    })),
  });
  const byId = new Map<string, GooglePlacePreview>();
  results.forEach((result, index) => {
    const id = placeIds[index];
    if (result.data && id) byId.set(id, result.data);
  });
  return {
    byId,
    pending: enabled && results.some((result) => result.isPending),
    failed: enabled ? results.filter((result) => result.isError).length : 0,
  };
}

/** Google photo URLs expire; keep one for a short while within the session. */
const PHOTO_URL_STALE_MS = 30 * 60 * 1000;

/** Loads one photo's image URL (billed per photo, so only when it's actually shown). */
export function useGooglePhoto(name: string | null, maxWidth = 800) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['google-photo', name ?? '', maxWidth],
    queryFn: () => api.getGooglePhoto(name ?? '', maxWidth),
    enabled: session !== null && name !== null,
    staleTime: PHOTO_URL_STALE_MS,
    gcTime: PHOTO_URL_STALE_MS,
    retry: false,
  });
}

/** D1: a place's visit history (done visits, also of deleted trips, and the older "visited" mark). */
export function usePlaceVisits(placeId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...placesKey, 'visits', placeId],
    queryFn: () => api.getPlaceVisits(placeId),
    enabled: session !== null && placeId.length > 0,
  });
}
