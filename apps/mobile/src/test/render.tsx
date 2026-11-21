import AsyncStorage from '@react-native-async-storage/async-storage';
import { jest } from '@jest/globals';
import type { Me, Trip, TripDetailV2, TripJournal } from '@travel-companion/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ActionMenuProvider } from '@/components/ui/ActionMenu';
import { reportReachable, reportUnreachable, resetConnectionForTests } from '@/features/offline/connection';
import { OfflineProvider } from '@/features/offline/OfflineProvider';
import { resetPending } from '@/features/offline/ops-store';
import type { PendingOp } from '@/features/offline/pending-ops';
import type { Conflict } from '@/features/offline/sync';
import { AppLocaleProvider } from '@/i18n/LocaleProvider';
import { api, pingApi } from '@/lib/api';
import { ApiClientError } from '@/lib/api-error';

/** Same id as the fake session in setup.ts. */
export const TEST_USER = '00000000-0000-4000-8000-000000000901';
const prefix = `tc.offline.v1.${TEST_USER}.`;

type Fn = jest.Mock<(...args: never[]) => Promise<unknown>>;
/** The fake API (every method is a jest mock). */
export const mockApi = api as unknown as Record<keyof typeof api, Fn>;

export const me: Me = {
  id: TEST_USER,
  email: 'ido@example.com',
  displayName: 'Ido',
  preferences: { locale: 'en', distanceUnit: 'km' },
  createdAt: '2026-11-01T00:00:00.000Z',
} as Me;

/** Fresh state for each test: storage, pending changes, connection, route params. */
export async function resetAll(): Promise<void> {
  await AsyncStorage.clear();
  resetPending();
  resetConnectionForTests();
  (globalThis as { __routeParams?: Record<string, string> }).__routeParams = {};
  (pingApi as unknown as Fn).mockImplementation(() => Promise.resolve(false));
}

export function setRouteParams(params: Record<string, string>): void {
  (globalThis as { __routeParams?: Record<string, string> }).__routeParams = params;
}

/** The trip as GET /v1/trips lists it. */
export function listItem(detail: TripDetailV2): Trip {
  const stay = detail.stays[0];
  const { timeZone: _zone, timeZoneSource: _source, ...trip } = detail.trip;
  return { ...trip, baseLocation: stay?.label ?? null, basePlaceId: stay?.place?.googlePlaceId ?? null };
}

/** The server answers with these trips (and Google details aren't available). */
export function serverHas(trips: TripDetailV2[]): void {
  reportReachable();
  mockApi.getMe.mockImplementation(() => Promise.resolve(me));
  mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: trips.map(listItem) }));
  mockApi.getTripV2.mockImplementation((...args: never[]) => {
    const id = args[0] as unknown as string;
    const trip = trips.find((item) => item.trip.id === id);
    return trip ? Promise.resolve(structuredClone(trip)) : Promise.reject(new ApiClientError('NOT_FOUND', 404, 'nope'));
  });
  mockApi.getJournal.mockImplementation(() => Promise.resolve({ days: [] }));
  for (const name of ['getGooglePlace', 'getGooglePlacePreview'] as const) {
    mockApi[name].mockImplementation(() => Promise.reject(new ApiClientError('NOT_FOUND', 404, 'no google in tests')));
  }
}

/** No connection: every request fails like a phone in airplane mode. */
export function goOffline(): void {
  for (const fn of Object.values(mockApi)) {
    fn.mockImplementation(() => Promise.reject(new ApiClientError('NETWORK', null, 'offline')));
  }
  reportUnreachable();
}

/** What a previous online session left on the phone (the M12a saved copy). */
export async function seedSavedCopy(
  trips: TripDetailV2[],
  savedAt: number,
  extra?: {
    ops?: PendingOp[];
    conflicts?: Conflict[];
    journals?: Record<string, TripJournal>;
    /** Cached Google coordinates (≤ 30 days): place id → point, cached at `savedAt`. */
    coords?: Record<string, { latitude: number; longitude: number }>;
  },
) {
  const pairs: [string, string][] = [
    [`${prefix}trips`, JSON.stringify({ savedAt, data: { items: trips.map(listItem) } })],
    [`${prefix}me`, JSON.stringify({ savedAt, data: me })],
    ...trips.map((trip): [string, string] => [`${prefix}trip.${trip.trip.id}`, JSON.stringify({ savedAt, data: trip })]),
  ];
  if (extra?.ops) pairs.push([`${prefix}ops`, JSON.stringify(extra.ops)]);
  if (extra?.conflicts) pairs.push([`${prefix}conflicts`, JSON.stringify(extra.conflicts)]);
  if (extra?.coords) {
    const entries = Object.entries(extra.coords).map(([placeId, point]) => ({
      placeId,
      ...point,
      source: 'google-places-api',
      cachedAt: savedAt,
    }));
    pairs.push([`${prefix}coords`, JSON.stringify(entries)]);
  }
  for (const [tripId, journal] of Object.entries(extra?.journals ?? {})) {
    pairs.push([`${prefix}journal.${tripId}`, JSON.stringify({ savedAt, data: journal })]);
  }
  await AsyncStorage.multiSet(pairs);
}

export async function storedOps(): Promise<PendingOp[]> {
  return JSON.parse((await AsyncStorage.getItem(`${prefix}ops`)) ?? '[]') as PendingOp[];
}

/** Renders a screen inside the app's providers, signed in as TEST_USER. */
export async function renderApp(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
  const utils = await render(
    <QueryClientProvider client={client}>
      <AppLocaleProvider>
        <ActionMenuProvider>
          <OfflineProvider userId={TEST_USER}>{ui}</OfflineProvider>
        </ActionMenuProvider>
      </AppLocaleProvider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}
