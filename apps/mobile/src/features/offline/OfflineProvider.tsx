import type { GooglePlace, LatLng, Me, TripDetail, TripJournal, TripList } from '@travel-companion/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { upcomingTrips } from '@/features/trips/upcoming';
import { api, pingApi } from '@/lib/api';
import { toIsoDate } from '@/lib/dates';
import { colors } from '@/theme/tokens';
import { getConnection, subscribeConnection } from './connection';
import { coordLookup, pruneCoords, upsertCoord, type CachedCoord } from './coords';
import { getPendingState, loadPending, syncPending } from './ops-store';
import { deviceStore } from './storage';
import { clearOtherUsers, TripCache, tripGoogleIds } from './trip-cache';

/** Trip details fetched ahead (so they open offline even if not opened since launch). */
const PREFETCH_TRIPS = 3;
/** While offline, check every 30 s whether the server is back. */
const RECONNECT_CHECK_MS = 30_000;

interface OfflineContextValue {
  /** Valid (≤ 30 days old) cached coordinates for a Google place, or null. */
  coordsFor: (googlePlaceId: string | null) => LatLng | null;
}

const OfflineContext = createContext<OfflineContextValue>({ coordsFor: () => null });

export const useOfflineCoords = () => useContext(OfflineContext).coordsFor;

const isKey = (key: readonly unknown[], ...prefix: string[]) => prefix.every((part, index) => key[index] === part);

/**
 * M12a. For a signed-in user: restores the saved copy into the query cache before
 * screens render, keeps the copy up to date as fresh data arrives, and refreshes
 * everything when the server becomes reachable again.
 */
export function OfflineProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const cache = useMemo(() => new TripCache(deviceStore, userId), [userId]);
  const [hydrated, setHydrated] = useState(false);
  const [coords, setCoords] = useState<CachedCoord[]>([]);
  const coordsRef = useRef<CachedCoord[]>([]);
  const hydrating = useRef(true);

  // 1. Restore the saved copy (this user's only).
  useEffect(() => {
    let cancelled = false;
    hydrating.current = true;
    setHydrated(false);
    (async () => {
      try {
        await clearOtherUsers(deviceStore, userId);
        const snapshot = await cache.load(Date.now());
        if (cancelled) return;
        // `updatedAt` = when the copy came from the server, so it counts as stale and refreshes.
        if (snapshot.trips) {
          queryClient.setQueryData(['trips', 'list'], snapshot.trips.data, { updatedAt: snapshot.trips.savedAt });
        }
        for (const detail of snapshot.details) {
          queryClient.setQueryData(['trips', 'detail', detail.data.id], detail.data, { updatedAt: detail.savedAt });
        }
        if (snapshot.me) queryClient.setQueryData(['me'], snapshot.me.data, { updatedAt: snapshot.me.savedAt });
        for (const { tripId, journal } of snapshot.journals) {
          queryClient.setQueryData(['trips', 'journal', tripId], journal.data, { updatedAt: journal.savedAt });
        }
        coordsRef.current = snapshot.coords;
        setCoords(snapshot.coords);
        await loadPending(userId);
      } catch {
        // A broken copy must never block the app: start without it.
      } finally {
        hydrating.current = false;
        if (!cancelled) {
          setHydrated(true);
          // Changes saved in an earlier session: try to send them now.
          if (getPendingState().ops.length > 0) void syncPending(queryClient);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cache, queryClient, userId]);

  // 2. Keep the copy current: save server data as it arrives.
  useEffect(() => {
    const knownGoogleIds = () =>
      new Set(
        queryClient
          .getQueriesData<TripDetail>({ queryKey: ['trips', 'detail'] })
          .flatMap(([, detail]) => (detail ? tripGoogleIds(detail) : [])),
      );
    return queryClient.getQueryCache().subscribe((event) => {
      if (hydrating.current || event.type !== 'updated' || event.action.type !== 'success') return;
      const key = event.query.queryKey;
      const data = event.query.state.data;
      const now = Date.now();
      if (isKey(key, 'trips', 'list') && data) {
        void cache.saveTrips(data as TripList, now).catch(() => undefined);
        if (!event.action.manual) prefetchUpcoming(queryClient, data as TripList);
      } else if (isKey(key, 'trips', 'detail') && data) {
        void cache.saveTrip(data as TripDetail, now).catch(() => undefined);
      } else if (isKey(key, 'trips', 'journal') && data && typeof key[2] === 'string') {
        void cache.saveJournal(key[2], data as TripJournal, now).catch(() => undefined);
      } else if (isKey(key, 'me') && data) {
        void cache.saveMe(data as Me, now).catch(() => undefined);
      } else if (isKey(key, 'google-place') && data && !event.action.manual) {
        // Only coordinates, only for places in the user's trips, fresh from Google.
        const place = data as GooglePlace;
        const placeId = key[1];
        if (typeof placeId !== 'string' || !place.location || !knownGoogleIds().has(placeId)) return;
        const next = upsertCoord(pruneCoords(coordsRef.current, now), placeId, place.location, now);
        coordsRef.current = next;
        setCoords(next);
        void cache.saveCoords(next).catch(() => undefined);
      }
    });
  }, [cache, queryClient]);

  // 3. Expire coordinates and reconnect: on foreground, and every 30 s while offline.
  useEffect(() => {
    const refreshWhenBack = async () => {
      if (getConnection() === 'offline') {
        if (!(await pingApi())) return;
        void queryClient.refetchQueries({ type: 'active' });
      }
      // Changes waiting (offline before, or the server was asleep): send them now.
      if (getPendingState().ops.length > 0) void syncPending(queryClient);
    };
    const onForeground = () => {
      const pruned = pruneCoords(coordsRef.current, Date.now());
      if (pruned.length !== coordsRef.current.length) {
        coordsRef.current = pruned;
        setCoords(pruned);
        void cache.saveCoords(pruned).catch(() => undefined);
      }
      void refreshWhenBack();
    };
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') onForeground();
    });
    const timer = setInterval(() => void refreshWhenBack(), RECONNECT_CHECK_MS);
    let previous = getConnection();
    const unsubscribe = subscribeConnection(() => {
      const current = getConnection();
      if (previous === 'offline' && current === 'online') {
        void queryClient.refetchQueries({ type: 'active' });
        void syncPending(queryClient);
      }
      previous = current;
    });

    return () => {
      appState.remove();
      clearInterval(timer);
      unsubscribe();
    };
  }, [cache, queryClient]);

  const coordsFor = useCallback(
    (googlePlaceId: string | null) => {
      if (!googlePlaceId) return null;
      // Checked against the clock on every read: an expired value is never used.
      return coordLookup(coords, Date.now()).get(googlePlaceId) ?? null;
    },
    [coords],
  );
  const value = useMemo(() => ({ coordsFor }), [coordsFor]);

  if (!hydrated) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

function prefetchUpcoming(queryClient: QueryClient, list: TripList): void {
  for (const trip of upcomingTrips(list.items, toIsoDate(new Date())).slice(0, PREFETCH_TRIPS)) {
    void queryClient.prefetchQuery({ queryKey: ['trips', 'detail', trip.id], queryFn: () => api.getTrip(trip.id) });
  }
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
