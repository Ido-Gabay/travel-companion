import { beforeEach, describe, expect, it } from '@jest/globals';
import type { TripDetailV2 } from '@travel-companion/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import { tripKey, tripsWithPlace, useUseOwnPinInTrips } from '@/features/trips/queries';
import { mockApi, resetAll } from '../render';

const OWN = uuid(990);
const OWN_MEMBER = uuid(991);

beforeEach(async () => {
  await resetAll();
});

describe('"Use my own pin" in trips (D1 Q2)', () => {
  it('moves the visits still to come onto the user\'s own place; done visits stay with the Google place', async () => {
    const trip = tripDetail([
      tripPlace(1, { startTime: '10:00' }),
      tripPlace(2, { day: '2026-11-24', visitedAt: '2026-11-22T10:00:00.000Z' }),
    ]);
    // A second, done visit to place 1 and a second planned one.
    trip.stops.push({ ...trip.stops[0]!, id: uuid(951), day: '2026-11-25', status: 'completed', completedAt: '2026-11-22T12:00:00.000Z', completionSource: 'user' });
    trip.stops.push({ ...trip.stops[0]!, id: uuid(952), day: '2026-11-26' });
    const client = new QueryClient();
    client.setQueryData(tripKey(uuid(1)), trip);
    expect(tripsWithPlace(client, uuid(101))).toEqual([{ tripId: uuid(1), upcoming: 2 }]);

    const withOwn: TripDetailV2 = {
      ...trip,
      places: [...trip.places, { ...trip.places[0]!, id: OWN, tripPlaceId: OWN_MEMBER, source: 'custom', googlePlaceId: null }],
    };
    mockApi.addTripMember.mockImplementation(() => Promise.resolve(withOwn));
    mockApi.updateStop.mockImplementation(() => Promise.resolve({ stop: trip.stops[0], timeZoneSuggestion: null }));
    mockApi.getTripV2.mockImplementation(() => Promise.resolve(withOwn));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useUseOwnPinInTrips(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ googlePlaceId: uuid(101), ownPlaceId: OWN });
    });
    expect(outcome).toEqual({ trips: 1, moved: 2 });
    const moved = mockApi.updateStop.mock.calls.map((call) => (call as unknown as [string, string, unknown]).slice(1));
    expect(moved).toEqual([
      [uuid(101), { tripPlaceId: OWN_MEMBER }],
      [uuid(952), { tripPlaceId: OWN_MEMBER }],
    ]);
    expect(memberId(uuid(101))).not.toBe(OWN_MEMBER);
  });
});
