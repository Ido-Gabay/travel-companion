import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TripScreen from '@/app/trips/[id]/index';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
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
    expect(ops[0]).toMatchObject({ kind: 'stop', stopId: uuid(101), field: 'status', value: 'completed' });
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
      expect(ops[0]).toMatchObject({ kind: 'reorderStops', day: '2026-11-23', value: [uuid(102), uuid(101), uuid(103)] });
    });
  });

  it('online: "Plan this day" fills the time of the flexible stop and sends it', async () => {
    const trip = tripDetail(stops());
    serverHas([trip]);
    mockApi.updateStop.mockImplementation((...args: never[]) => {
      const [, stopId, body] = args as unknown as [string, string, { startTime: string }];
      const stop = trip.stops.find((item) => item.id === stopId)!;
      return Promise.resolve({ stop: { ...stop, startTime: body.startTime }, timeZoneSuggestion: null });
    });
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('planning.planDay')));
    expect(await screen.findByText(i18n.t('planning.fillTimes', { count: 1 }))).toBeTruthy();
    await fireEvent.press(screen.getByText(i18n.t('planning.apply')));
    await waitFor(() => expect(mockApi.updateStop).toHaveBeenCalled());
    const [tripId, stopId, body] = mockApi.updateStop.mock.calls[0] as unknown as [string, string, { startTime: string }];
    expect(tripId).toBe(uuid(1));
    expect(stopId).toBe(uuid(103));
    expect(body.startTime).toMatch(/^1[3-9]:\d{2}$/);
  });
});

describe('Adding to a day (repeat taps)', () => {
  const withWish = () => [...stops(), tripPlace(4, { day: null, position: 0, myLabel: 'Wish place' })];
  const adds = async () => (await storedOps()).filter((op) => op.kind === 'stopAdd');

  it('a place added from the sheet is marked; tapping it again adds nothing (offline queue too)', async () => {
    await seedSavedCopy([tripDetail(withWish())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('itinerary.add')));
    const sheetWish = await screen.findAllByText('Wish place');
    await fireEvent.press(sheetWish[sheetWish.length - 1]!);
    await waitFor(async () => expect(await adds()).toHaveLength(1));
    // It is now planned, so it shows under "Visit again", marked as added: more taps do nothing.
    const marked = await screen.findByText(i18n.t('visits.addedHere'));
    await fireEvent.press(marked);
    await fireEvent.press(marked);
    expect(await adds()).toHaveLength(1);
    const add = (await adds())[0]!;
    expect(add.kind === 'stopAdd' && [add.tripPlaceId, add.day]).toEqual([memberId(uuid(104)), '2026-11-23']);
  });

  it('a second visit to a place already on the day asks first, and is a separate visit when confirmed', async () => {
    await seedSavedCopy([tripDetail(withWish())], Date.parse('2026-11-23T08:00:00Z'));
    goOffline();
    const alert = jest.spyOn(Alert, 'alert');
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('itinerary.add')));
    const onDay = await screen.findAllByText(i18n.t('visits.onThisDay'));
    await fireEvent.press(onDay[0]!);
    expect(alert).toHaveBeenCalledWith(i18n.t('visits.sameDayTitle'), i18n.t('visits.sameDayBody'), expect.any(Array));
    expect(await adds()).toHaveLength(0);
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === i18n.t('visits.sameDayConfirm'))!.onPress!();
    await waitFor(async () => expect(await adds()).toHaveLength(1));
    const add = (await adds())[0]!;
    // A new visit id, never the existing visit's.
    expect(add.kind === 'stopAdd' && add.stopId).not.toBe(uuid(101));
  });
});
