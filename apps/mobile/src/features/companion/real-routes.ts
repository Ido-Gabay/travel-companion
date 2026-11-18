import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useConnection } from '@/features/offline/connection';
import { useLocale } from '@/i18n/LocaleProvider';
import { api } from '@/lib/api';
import { buildLookup, legKey, ROUTES_STALE_MS, routeRequests, type PlannedLeg, type RouteLookup } from './route-legs';

export type { PlannedLeg, RouteLookup } from './route-legs';

/** Real routes for these legs while online; undefined until (and unless) they arrive. */
export function useRealRoutes(legs: readonly PlannedLeg[], day: string | null, timeZone: string | null): RouteLookup | undefined {
  const { session } = useAuth();
  const { locale } = useLocale();
  const online = useConnection() !== 'offline';
  const requests = useMemo(() => routeRequests(legs, day, timeZone), [legs, day, timeZone]);
  // Departure times are bucketed to 15 minutes so the key doesn't change every minute.
  const key = requests.map((r) => `${r.mode}:${legKey(r.from, r.to)}@${r.departAt ? Math.floor(Date.parse(r.departAt) / 900_000) : 'now'}`);
  const query = useQuery({
    queryKey: ['google-routes', locale, ...key],
    queryFn: () => api.computeRoutes({ legs: requests }, locale),
    enabled: session !== null && online && requests.length > 0,
    staleTime: ROUTES_STALE_MS,
    gcTime: ROUTES_STALE_MS,
    retry: false,
    // Not on every focus: these calls count against a daily cap.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return useMemo(() => buildLookup(requests, query.data), [requests, query.data]);
}
