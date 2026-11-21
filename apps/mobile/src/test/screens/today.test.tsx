import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import TodayRoute from '@/app/today';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import i18n from '@/i18n/i18n';
import { ApiClientError } from '@/lib/api-error';
import { goOffline, mockApi, renderApp, resetAll, seedSavedCopy, serverHas, setRouteParams, storedOps } from '../render';

// Pretend this build has a Google Maps key, so the map (mocked) draws our pins.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual<{ default: { expoConfig?: { extra?: object } } }>('expo-constants').default;
  return {
    __esModule: true,
    default: { ...actual, expoConfig: { ...actual.expoConfig, extra: { ...actual.expoConfig?.extra, googleMapsEnabled: true } } },
  };
});

// Manhattan points (approximate).
const HOTEL = { latitude: 40.7577, longitude: -73.9857 };
const BRYANT = { latitude: 40.7536, longitude: -73.9832 };
const MET = { latitude: 40.7794, longitude: -73.9632 };
const MOMA = { latitude: 40.7614, longitude: -73.9776 };
const SAVED_AT = Date.parse('2026-11-23T08:00:00Z');

const day = () =>
  tripDetail([
    tripPlace(1, { startTime: '09:00', visitedAt: '2026-11-23T14:30:00.000Z', category: 'coffee' }),
    tripPlace(2, { startTime: '12:30', myLabel: 'The Met' }),
    tripPlace(3, { startTime: '16:00', category: 'food' }),
  ]);
const coords = {
  ChIJplace0001: BRYANT,
  ChIJplace0002: MET,
  ChIJplace0003: MOMA,
  ChIJhotel000001: HOTEL,
};

const t = i18n.t.bind(i18n);
const handle = () => screen.getByTestId('map-sheet-handle');
const sheetState = () => (handle().props.accessibilityValue as { text: string }).text;

async function openOffline(withCoords = true) {
  await seedSavedCopy([day()], SAVED_AT, withCoords ? { coords } : undefined);
  goOffline();
  await renderApp(<TodayRoute />);
  await screen.findByTestId('today-travel');
}

beforeEach(async () => {
  // 11:00 in the phone's zone on the first trip day (Google's trip zone isn't available offline).
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 10, 23, 11, 0) });
  await resetAll();
  setRouteParams({ tripId: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Today (map first)', () => {
  it('opens offline on a trip day: next stop and the day from the saved copy', async () => {
    await openOffline();
    expect((await screen.findAllByText('The Met')).length).toBeGreaterThan(0);
    // Offline is visible in the collapsed sheet.
    expect(screen.getByText(t('today.alertOffline'))).toBeTruthy();
    expect(screen.queryByText(t('errors.NETWORK'))).toBeNull();
  });

  it('collapsed: the next action, leave-by, travel, progress and alerts, with the day on the map', async () => {
    await openOffline();
    expect(sheetState()).toBe(t('today.sheetCollapsed'));
    // Leave-by: 12:30 minus ≈23 min transit from the last stop minus the 5-minute buffer.
    expect(screen.getByTestId('today-leave')).toBeTruthy();
    expect(screen.getAllByText(/12:02/).length).toBeGreaterThan(0);
    const travel = screen.getByTestId('today-travel');
    expect(String(travel.props.children)).toContain('≈');
    expect(String(travel.props.children)).toContain(t('today.fromPrevious'));
    expect(screen.getAllByText(t('tripMode.doneOf', { done: 1, total: 3 })).length).toBeGreaterThan(0);
    // Free time before leaving is visible without opening the sheet.
    expect(screen.getByText(t('today.alertFree', { duration: formatDurationShort(62, t) }))).toBeTruthy();
    // Pins: done, next and later are distinct.
    expect(screen.getByLabelText(/^1\. .*, done$/)).toBeTruthy();
    expect(screen.getByLabelText(t('today.pinNext', { number: 2, name: 'The Met' }))).toBeTruthy();
    expect(screen.getByLabelText(/^3\. [^,]+$/)).toBeTruthy();
    expect(screen.getByText(t('today.mapLines'))).toBeTruthy();
  });

  it('resizes through all three sheet states by tap and by VoiceOver', async () => {
    await openOffline();
    expect(screen.getByLabelText(t('today.fitDay'))).toBeTruthy();
    await fireEvent.press(handle());
    expect(sheetState()).toBe(t('today.sheetHalf'));
    expect(screen.getByLabelText(t('today.locateMe'))).toBeTruthy();
    await fireEvent.press(handle());
    expect(sheetState()).toBe(t('today.sheetFull'));
    // Fully open: map controls step aside instead of overlapping the sheet.
    expect(screen.queryByLabelText(t('today.fitDay'))).toBeNull();
    await fireEvent(handle(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(sheetState()).toBe(t('today.sheetHalf'));
    await fireEvent(handle(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(sheetState()).toBe(t('today.sheetCollapsed'));
    await fireEvent(handle(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(sheetState()).toBe(t('today.sheetHalf'));
  });

  it('shows running late in the collapsed sheet; tapping it opens the full sheet with the choices', async () => {
    jest.setSystemTime(new Date(2026, 10, 23, 12, 40));
    await openOffline();
    expect(sheetState()).toBe(t('today.sheetCollapsed'));
    const late = screen.getAllByText(/Running about \d+ min late for The Met/);
    expect(late.length).toBeGreaterThan(0);
    await fireEvent.press(late[0]!);
    expect(sheetState()).toBe(t('today.sheetFull'));
    // The proposal is still only a proposal: nothing was queued.
    expect(screen.getAllByText(t('today.actionTomorrow')).length).toBeGreaterThan(0);
    expect(await storedOps()).toEqual([]);
  });

  it('says travel is unavailable instead of guessing when stops have no reliable location', async () => {
    await openOffline(false);
    expect(screen.getByTestId('today-travel').props.children).toBe(t('today.noTravel'));
    // No leave-by time without a travel estimate: "be there by" the planned time instead.
    expect(screen.queryByTestId('today-leave')).toBeNull();
    expect(screen.getByTestId('today-be-there')).toBeTruthy();
    expect(screen.queryByText(t('today.alertFree', { duration: formatDurationShort(85, t) }))).toBeNull();
    expect(screen.queryByLabelText(t('today.pinNext', { number: 2, name: 'The Met' }))).toBeNull();
    // Nothing to draw: the sheet opens on the day instead of an empty map.
    expect(sheetState()).toBe(t('today.sheetHalf'));
  });

  it('marks Done from the collapsed sheet offline and shows the waiting change without expanding', async () => {
    await openOffline();
    await fireEvent.press(screen.getByText(t('tripMode.done')));
    expect(await screen.findByText(t('today.alertOfflinePending', { count: 1 }))).toBeTruthy();
    const ops = await storedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'stop', stopId: uuid(102), field: 'status', value: 'completed' });
    // Never changes the itinerary itself: only the Done the user asked for.
    expect(ops.some((op) => op.kind === 'schedule' || op.kind === 'reorder' || op.kind === 'reorderStops')).toBe(false);
  });

  it('a stop in the list selects it on the map; a second tap opens it', async () => {
    await openOffline();
    // Collapsed, the list is out of view (and hidden from VoiceOver); open the day first.
    expect(screen.queryByTestId(`today-row-${uuid(103)}`)).toBeNull();
    await fireEvent.press(handle());
    await fireEvent.press(screen.getByTestId(`today-row-${uuid(103)}`));
    expect(screen.getByTestId(`pin-${uuid(103)}`).props.accessibilityState).toEqual({ selected: true });
    expect(router.push).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId(`today-row-${uuid(103)}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/places/[id]', params: { id: uuid(103) } });
  });

  it('a pin opens the half sheet and highlights its row', async () => {
    await openOffline();
    await fireEvent.press(screen.getByTestId(`marker-${uuid(102)}`));
    expect(sheetState()).toBe(t('today.sheetHalf'));
    expect(screen.getByTestId(`today-row-${uuid(102)}`).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId(`pin-${uuid(102)}`).props.accessibilityState).toEqual({ selected: true });
  });

  it('before the trip opens as a labeled preview with the day picker in the sheet', async () => {
    jest.setSystemTime(new Date(2026, 10, 10, 9, 0));
    setRouteParams({ tripId: uuid(1), preview: '1' });
    await seedSavedCopy([day()], SAVED_AT, { coords });
    goOffline();
    await renderApp(<TodayRoute />);
    expect(await screen.findByText(new RegExp(`^${t('today.previewLabel')} · 10:00`))).toBeTruthy();
    expect(sheetState()).toBe(t('today.sheetHalf'));
    expect(screen.getAllByRole('tab').length).toBe(7);
    expect(screen.getByText(t('today.previewBody'))).toBeTruthy();
    // A preview never changes the plan: no Done.
    expect(screen.queryByText(t('tripMode.done'))).toBeNull();
  });

  it('before the trip, the preview is the plan only: no running late, leave now, progress or free time', async () => {
    jest.setSystemTime(new Date(2026, 10, 10, 9, 0));
    setRouteParams({ tripId: uuid(1), preview: '1' });
    // At the preview's 10:00 the 09:00 coffee isn't done yet: live, that would be "about 65 min behind".
    const plan = tripDetail([
      tripPlace(1, { startTime: '09:00', category: 'coffee' }),
      tripPlace(2, { startTime: '12:30', myLabel: 'The Met' }),
    ]);
    await seedSavedCopy([plan], SAVED_AT, { coords });
    goOffline();
    await renderApp(<TodayRoute />);
    expect(await screen.findByText(new RegExp(`^${t('today.previewLabel')} · 10:00`))).toBeTruthy();
    // The next stop and its planned time, never a live instruction.
    expect(screen.getByTestId('today-be-there')).toBeTruthy();
    expect(screen.queryByTestId('today-leave')).toBeNull();
    expect(screen.queryByText(/min behind/)).toBeNull();
    expect(screen.queryByText(/^Running about \d+ min late/)).toBeNull();
    expect(screen.queryByText(t('tripMode.doneOf', { done: 0, total: 2 }))).toBeNull();
    expect(screen.queryByText(t('today.timeAvailable'))).toBeNull();
    expect(screen.queryByText(t('today.statusNow'))).toBeNull();
    // Still the whole plan for that day.
    expect(screen.getByTestId(`today-row-${uuid(101)}`)).toBeTruthy();
    expect(screen.getByTestId(`today-row-${uuid(102)}`)).toBeTruthy();
    // Offline is still said (it isn't a live alert).
    expect(screen.getByText(t('today.alertOffline'))).toBeTruthy();
  });

  describe('real travel times (M16)', () => {
    it('online: uses the Google route for the next leg (no ≈) and the leave-by follows it', async () => {
      await seedSavedCopy([day()], SAVED_AT, { coords });
      serverHas([day()]);
      mockApi.computeRoutes.mockImplementation(((body: { legs: { mode: 'walk' | 'transit' }[] }) =>
        Promise.resolve({
          legs: body.legs.map((leg) => ({ minutes: 31, meters: 3900, mode: leg.mode, polyline: null })),
          limited: false,
        })) as never);
      await renderApp(<TodayRoute />);
      const travel = await screen.findByText(new RegExp(`^${t('today.transitRoute', { min: 31, dist: '3.9 km' })}`));
      expect(String(travel.props.children)).not.toContain('≈');
      // 12:30 − 31 min − 5 min buffer.
      expect(screen.getAllByText(/11:54/).length).toBeGreaterThan(0);
      expect(mockApi.computeRoutes).toHaveBeenCalled();
      const [body] = mockApi.computeRoutes.mock.calls[0] as unknown as [{ legs: unknown[] }];
      expect(body.legs.length).toBeLessThanOrEqual(10);
    });

    it('past the daily limit (or any error): quietly keeps the on-device estimate', async () => {
      await seedSavedCopy([day()], SAVED_AT, { coords });
      serverHas([day()]);
      mockApi.computeRoutes.mockImplementation(() =>
        Promise.reject(new ApiClientError('DAILY_LIMIT_REACHED', 429, 'limit')),
      );
      await renderApp(<TodayRoute />);
      await screen.findByTestId('today-travel');
      expect(String(screen.getByTestId('today-travel').props.children)).toContain('≈');
      expect(screen.getAllByText(/12:02/).length).toBeGreaterThan(0);
      expect(screen.queryByText(t('errors.DAILY_LIMIT_REACHED'))).toBeNull();
    });

    it('offline: never asks for routes', async () => {
      await openOffline();
      expect(mockApi.computeRoutes).not.toHaveBeenCalled();
    });
  });
});
