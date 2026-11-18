import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TripScreen from '@/app/trips/[id]/index';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, mockApi, renderApp, resetAll, seedSavedCopy, serverHas, setRouteParams, storedOps } from '../render';

const stops = () => [
  tripPlace(1, { startTime: '10:00', category: 'coffee', myLabel: 'Morning coffee' }),
  tripPlace(2, { startTime: '12:00', durationMinutes: 60, notes: 'Members free' }),
  tripPlace(3, { category: 'food' }),
];

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T14:00:00Z') });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Trip itinerary', () => {
  it('opens offline: stops with times, your label instead of a Google name, saved-copy line', async () => {
    await seedSavedCopy([tripDetail(stops())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    expect(await screen.findByText('Morning coffee')).toBeTruthy();
    expect(screen.getAllByText(i18n.t('categories.sights')).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(i18n.t('offline.offline')))).toBeTruthy();
  });

  it('marks a stop Done offline: shown at once, saved as a pending change, nothing lost', async () => {
    await seedSavedCopy([tripDetail(stops())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    const done = await screen.findByLabelText(i18n.t('tripMode.markDone', { name: 'Morning coffee' }));
    await fireEvent.press(done);
    expect(await screen.findByText(i18n.t('offline.pending', { count: 1 }))).toBeTruthy();
    expect(await screen.findByLabelText(i18n.t('offline.waiting'))).toBeTruthy();
    const ops = await storedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'visited', placeId: uuid(101), value: true });
  });

  it('a stop row opens one menu with every action; "Move later" reorders offline', async () => {
    await seedSavedCopy([tripDetail(stops())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    const rows = await screen.findAllByHintText(i18n.t('itinerary.rowHint'));
    await fireEvent.press(rows[0]!);
    for (const key of ['itinerary.openPlace', 'itinerary.changeTime', 'places.directions', 'itinerary.moveDown', 'itinerary.changeDay']) {
      expect(await screen.findByText(i18n.t(key as 'itinerary.openPlace'))).toBeTruthy();
    }
    await fireEvent.press(screen.getByText(i18n.t('itinerary.moveDown')));
    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops[0]).toMatchObject({ kind: 'reorder', day: '2026-11-23', value: [uuid(102), uuid(101), uuid(103)] });
    });
  });

  it('online: "Plan this day" fills the time of the flexible stop and sends it', async () => {
    const trip = tripDetail(stops());
    serverHas([trip]);
    mockApi.scheduleTripPlace.mockImplementation((...args: never[]) => {
      const [, placeId, body] = args as unknown as [string, string, { startTime: string }];
      return Promise.resolve({
        ...trip,
        places: trip.places.map((place) => (place.id === placeId ? { ...place, startTime: body.startTime } : place)),
      });
    });
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('planning.planDay')));
    expect(await screen.findByText(i18n.t('planning.fillTimes', { count: 1 }))).toBeTruthy();
    await fireEvent.press(screen.getByText(i18n.t('planning.apply')));
    await waitFor(() => expect(mockApi.scheduleTripPlace).toHaveBeenCalled());
    const [tripId, placeId, body] = mockApi.scheduleTripPlace.mock.calls[0] as unknown as [string, string, { startTime: string }];
    expect(tripId).toBe(uuid(1));
    expect(placeId).toBe(uuid(103));
    expect(body.startTime).toMatch(/^1[3-9]:\d{2}$/);
  });
});
