import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TodayRoute from '@/app/today';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, mockApi, renderApp, resetAll, seedSavedCopy, setRouteParams, storedOps } from '../render';

const t = i18n.t.bind(i18n);
// SoHo (approximate): the user is on Spring St; Prince St is ~5 min away.
const HERE = { latitude: 40.7233, longitude: -74.003 };
const PRINCE = { latitude: 40.7244, longitude: -73.9985 };
const MET = { latitude: 40.7794, longitude: -73.9632 };
const BRONX = { latitude: 40.8296, longitude: -73.9262 };
const COFFEE = { latitude: 40.7236, longitude: -74.0021 };

// 14:00 on the first day: coffee done; the Met at 17:00; two saved places not on any day.
const trip = () =>
  tripDetail([
    tripPlace(1, { startTime: '09:00', visitedAt: '2026-11-23T14:30:00.000Z', category: 'coffee', myLabel: 'Coffee' }),
    tripPlace(2, { startTime: '17:00', myLabel: 'The Met', durationMinutes: 120 }),
    tripPlace(3, { day: null, myLabel: 'Prince St Pizza', category: 'food', durationMinutes: 45 }),
    tripPlace(4, { day: null, myLabel: 'Bronx Zoo', category: 'outdoors' }),
  ]);
const coords = { ChIJplace0001: COFFEE, ChIJplace0002: MET, ChIJplace0003: PRINCE, ChIJplace0004: BRONX, ChIJhotel000001: HERE };

async function openToday() {
  await seedSavedCopy([trip()], Date.parse('2026-11-23T08:00:00Z'), { coords });
  goOffline();
  await renderApp(<TodayRoute />);
  await screen.findByTestId('today-travel');
  // The full sheet (the collapsed one hides its list from accessibility).
  await fireEvent.press(screen.getByTestId('today-day-chip'));
}

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 10, 23, 14, 0) });
  await resetAll();
  setRouteParams({ tripId: uuid(1) });
  // One foreground reading, allowed ("while using the app").
  const location = jest.requireMock('expo-location') as Record<string, jest.Mock<(...args: never[]) => Promise<unknown>>>;
  location.requestForegroundPermissionsAsync?.mockImplementation(() => Promise.resolve({ status: 'granted', granted: true, canAskAgain: true }));
  location.getLastKnownPositionAsync?.mockImplementation(() => Promise.resolve({ coords: HERE }));
});
afterEach(() => {
  jest.useRealTimers();
  const location = jest.requireMock('expo-location') as Record<string, jest.Mock<(...args: never[]) => Promise<unknown>>>;
  location.requestForegroundPermissionsAsync?.mockImplementation(() => Promise.resolve({ status: 'denied', granted: false, canAskAgain: false }));
  location.getLastKnownPositionAsync?.mockImplementation(() => Promise.resolve(null));
});

describe('Live trip adjustments on Today', () => {
  it('a saved place nearby: suggested with distance and why, added only through the preview and Apply', async () => {
    await openToday();
    expect(await screen.findByText(t('live.nearbyTitle'))).toBeTruthy();
    expect(await screen.findByText('Prince St Pizza')).toBeTruthy();
    expect(screen.queryByText('Bronx Zoo')).toBeNull();
    // A saved place has no planned length yet: the category's typical one (food: 1 h).
    expect(screen.getByText(/^You saved this for New York\. About 1 h there fits before The Met at /)).toBeTruthy();
    // Also visible without opening the sheet.
    expect(screen.getByText(/^You saved Prince St Pizza: ≈\d+ min walk from here$/)).toBeTruthy();
    expect(await storedOps()).toEqual([]);
    // One visible action per row; directions and details wait in its menu.
    expect(screen.getByLabelText(t('live.nearbyMore', { name: 'Prince St Pizza' }))).toBeTruthy();

    await fireEvent.press(screen.getByText(t('live.nearbyAdd')));
    await fireEvent.press(await screen.findByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      const add = ops.find((op) => op.kind === 'stopAdd');
      expect(add && add.kind === 'stopAdd' && [add.tripPlaceId, add.day]).toEqual([memberId(uuid(103)), '2026-11-23']);
    });
    const ops = await storedOps();
    // Nothing else changes: no other visit moved, re-timed, skipped or removed.
    expect(ops.some((op) => op.kind === 'stop' || op.kind === 'stopRemove')).toBe(false);
  });

  it('dismissing a nearby saved place hides it for today', async () => {
    await openToday();
    await fireEvent.press(await screen.findByLabelText(t('live.nearbyDismiss', { name: 'Prince St Pizza' })));
    await waitFor(() => expect(screen.queryByLabelText(t('live.nearbyDismiss', { name: 'Prince St Pizza' }))).toBeNull());
    expect(screen.getByText(t('live.nearbyNone', { min: 15 }))).toBeTruthy();
  });

  it('"It\'s closed": skip (or keep) it and look for an alternative nearby; nothing changes before Apply', async () => {
    await openToday();
    await fireEvent.press(screen.getByText(t('live.somethingChanged')));
    await fireEvent.press(await screen.findByText(t('live.menuClosed')));
    expect(await screen.findByText(t('live.closedRow', { name: 'The Met' }))).toBeTruthy();
    expect(screen.getByText(t('live.alternative'))).toBeTruthy();
    expect(screen.getByText(t('placeFind.search'))).toBeTruthy();
    expect(await storedOps()).toEqual([]);

    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops.some((op) => op.kind === 'stop' && op.field === 'status' && op.stopId === uuid(102) && op.value === 'skipped')).toBe(true);
    });
    expect((await storedOps()).some((op) => op.kind === 'stopRemove')).toBe(false);
  });

  it('"We\'re staying longer": a longer visit on its own switch, nothing removed', async () => {
    await openToday();
    await fireEvent.press(screen.getByText(t('live.somethingChanged')));
    await fireEvent.press(await screen.findByText(t('live.menuLonger')));
    expect(await screen.findByText(/^Staying 30 min longer at The Met/)).toBeTruthy();
    expect(screen.getByText(/^The Met: 2 h → 2 h 30/)).toBeTruthy();
    expect(await storedOps()).toEqual([]);
  });

  it('nearby has one entry: the "…" menu opens the finder near you; "Something changed?" is only about the plan', async () => {
    await openToday();
    await fireEvent.press(screen.getByText(t('live.somethingChanged')));
    expect(await screen.findByText(t('live.menuClosed'))).toBeTruthy();
    expect(screen.queryByText(t('live.menuNearby'))).toBeNull();
    await fireEvent.press(screen.getByText(t('common.cancel')));

    await fireEvent.press(screen.getByLabelText(t('today.more')));
    await fireEvent.press(await screen.findByText(t('live.menuNearby')));
    expect(await screen.findByText(t('placeFind.search'))).toBeTruthy();
    expect(mockApi.discoverSearch).not.toHaveBeenCalled();
    expect(await storedOps()).toEqual([]);
  });
});
