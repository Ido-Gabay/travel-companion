import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import PlaceScreen from '@/app/places/[id]';
import EditTripScreen from '@/app/trips/[id]/edit';
import TripScreen from '@/app/trips/[id]/index';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { ApiClientError } from '@/lib/api-error';
import { goOffline, mockApi, renderApp, resetAll, seedSavedCopy, serverHas, setRouteParams, storedOps } from '../render';

const stops = () => [
  tripPlace(1, { startTime: '10:00', category: 'coffee', myLabel: 'Morning coffee' }),
  tripPlace(2, { startTime: '12:00', myLabel: 'The Met', visitedAt: '2026-11-23T13:30:00.000Z' }),
  tripPlace(3, { category: 'food', myLabel: 'Katz' }),
];

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T14:00:00Z') });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const openMenuFor = async (index: number) => {
  const rows = await screen.findAllByHintText(i18n.t('itinerary.rowHint'));
  await fireEvent.press(rows[index]!);
};

describe('Visits (D1)', () => {
  it('skips a visit offline: saved as a status change, shown as Skipped', async () => {
    await seedSavedCopy([tripDetail(stops())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await openMenuFor(0);
    await fireEvent.press(await screen.findByText(i18n.t('visits.skip')));
    expect(await screen.findByText(i18n.t('visits.status.skipped'))).toBeTruthy();
    const ops = await storedOps();
    expect(ops[0]).toMatchObject({ kind: 'stop', stopId: uuid(101), field: 'status', value: 'skipped', base: 'planned' });
  });

  it('"Visit again" plans a second visit to the same place, a separate record (offline)', async () => {
    await seedSavedCopy([tripDetail(stops())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await openMenuFor(0);
    await fireEvent.press(await screen.findByText(i18n.t('visits.again')));
    await fireEvent.press(await screen.findByText(i18n.t('itinerary.dayNumber', { number: 3 })));
    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops[0]).toMatchObject({ kind: 'stopAdd', tripPlaceId: memberId(uuid(101)), day: '2026-11-25' });
      expect(ops[0]?.kind === 'stopAdd' && ops[0].stopId).not.toBe(uuid(101));
    });
  });

  it('removing a done visit asks first (it leaves the place history)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await seedSavedCopy([tripDetail(stops())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await openMenuFor(1);
    await fireEvent.press(await screen.findByText(i18n.t('visits.removeFromPlan')));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(i18n.t('visits.removeDoneTitle'), expect.any(String), expect.any(Array)));
    expect(await storedOps()).toEqual([]);
  });

  it('the Places tab lists each saved place once, with its visits', async () => {
    const trip = tripDetail(stops());
    trip.stops.push({ ...trip.stops[0]!, id: uuid(950), day: '2026-11-25', position: 0 });
    await seedSavedCopy([trip], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(new RegExp(`${i18n.t('itinerary.places')} · 3`)));
    expect(await screen.findByText(new RegExp(i18n.t('visits.count', { count: 2 })))).toBeTruthy();
    expect(screen.getAllByText('Morning coffee')).toHaveLength(1);
  });
});

describe('Stays (D1)', () => {
  it('shows the stay line, and a saved stay offers its zone for one-tap confirmation', async () => {
    const trip = tripDetail(stops(), { basePlaceId: null });
    serverHas([trip]);
    const stay = trip.stays[0]!;
    mockApi.addStay.mockImplementation(() =>
      Promise.resolve({
        stay: { ...stay, id: uuid(777), label: 'Brooklyn loft', checkIn: '2026-11-23', checkOut: '2026-11-25' },
        timeZoneSuggestion: { timeZone: 'America/New_York', alternatives: [], certain: true, dataset: '2026f' },
      }),
    );
    mockApi.updateStay.mockImplementation(() => Promise.resolve({ stay: { ...stay, timeZone: 'America/New_York', timeZoneSource: 'user' }, timeZoneSuggestion: null }));
    await renderApp(<TripScreen />);
    expect(await screen.findByText(new RegExp(`Pod Times Square · ${i18n.t('stays.wholeTrip')}`))).toBeTruthy();
    await fireEvent.press(screen.getByText(i18n.t('stays.addAnother')));
    await fireEvent.changeText(await screen.findByPlaceholderText(i18n.t('stays.labelPlaceholder')), 'Brooklyn loft');
    await fireEvent(screen.getByLabelText(i18n.t('stays.wholeTrip')), 'valueChange', false);
    await fireEvent.press(screen.getByText(i18n.t('common.save')));
    await waitFor(() => expect(mockApi.addStay).toHaveBeenCalled());
    expect((mockApi.addStay.mock.calls[0] as unknown as [string, { label: string; checkIn: string }])[1]).toMatchObject({
      label: 'Brooklyn loft',
      checkIn: '2026-11-23',
    });
    // Q3: nothing derived is stored until the user taps.
    expect(mockApi.updateStay).not.toHaveBeenCalled();
    const confirm = await screen.findByText(i18n.t('stays.useZone', { zone: 'New York' }));
    // The boundary data's attribution (ODbL) is shown with the zone.
    expect(screen.getAllByText(i18n.t('about.timeZoneData')).length).toBeGreaterThan(0);
    await fireEvent.press(confirm);
    await waitFor(() => expect(mockApi.updateStay).toHaveBeenCalled());
    expect(mockApi.updateStay.mock.calls[0] as unknown[]).toEqual([uuid(1), uuid(777), { timeZone: 'America/New_York' }]);
  });
});

describe('Trip dates (D1 Q5)', () => {
  it('asks before removing planned visits that fall outside new dates, then sends unscheduleOutside', async () => {
    const trip = tripDetail(stops());
    serverHas([trip]);
    const alert = jest.spyOn(Alert, 'alert');
    mockApi.updateTripV2.mockImplementation((...args: never[]) => {
      const body = args[1] as unknown as { unscheduleOutside?: boolean };
      return body.unscheduleOutside
        ? Promise.resolve({ ...trip.trip, endDate: '2026-11-22' })
        : Promise.reject(
            new ApiClientError('STOPS_OUTSIDE_DATES', 409, 'outside', [{ path: `stops.${uuid(103)}`, message: '2026-11-23 planned' }]),
          );
    });
    await renderApp(<EditTripScreen />);
    await fireEvent.changeText(await screen.findByLabelText(i18n.t('createTrip.name')), 'NYC');
    await fireEvent.press(screen.getByText(i18n.t('placeForm.saveChanges')));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(i18n.t('editTrip.outsideTitle'), expect.any(String), expect.any(Array)));
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === i18n.t('editTrip.removeAndSave'))!.onPress!();
    await waitFor(() => expect(mockApi.updateTripV2).toHaveBeenCalledTimes(2));
    expect((mockApi.updateTripV2.mock.calls[1] as unknown as [string, { unscheduleOutside: boolean }])[1].unscheduleOutside).toBe(true);
  });
});

describe('Place history (D1)', () => {
  it('lists done visits with their trip, and the older "visited" mark', async () => {
    const trip = tripDetail(stops());
    serverHas([trip]);
    setRouteParams({ id: uuid(102) });
    mockApi.getPlace.mockImplementation(() => Promise.resolve({ ...trip.places[1]!, tripPlaceId: undefined }));
    mockApi.getPlaceVisits.mockImplementation(() =>
      Promise.resolve({
        items: [
          { source: 'visit', tripId: uuid(1), tripTitle: 'New York', stopId: uuid(102), day: '2026-11-23', completedAt: '2026-11-23T13:30:00.000Z' },
          { source: 'legacy_mark', tripId: null, tripTitle: null, stopId: null, day: null, completedAt: '2025-05-01T10:00:00.000Z' },
        ],
      }),
    );
    mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: [] }));
    await renderApp(<PlaceScreen />);
    expect(await screen.findByText(i18n.t('visits.history'))).toBeTruthy();
    expect(await screen.findByText(/New York$/)).toBeTruthy();
    expect(screen.getByText(new RegExp(i18n.t('visits.markedVisited', { date: '' }).replace(' · ', '')))).toBeTruthy();
    // Label and category wait behind one link.
    expect(screen.queryByText(i18n.t('places.category'))).toBeNull();
    await fireEvent.press(screen.getByText(i18n.t('places.moreDetails')));
    expect(await screen.findByText(i18n.t('places.category'))).toBeTruthy();
  });
});
