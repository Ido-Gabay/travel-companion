import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import HomeScreen from '@/app/(tabs)/index';
import { tripDetail, tripPlace } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy, serverHas } from '../render';

const trip = tripDetail([tripPlace(1, { startTime: '10:00' }), tripPlace(2, { startTime: '13:00' })]);

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T14:00:00Z') });
  await resetAll();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Home', () => {
  it('shows the trip in progress with one primary action', async () => {
    serverHas([trip]);
    await renderApp(<HomeScreen />);
    expect(await screen.findByText('New York')).toBeTruthy();
    expect(await screen.findByText(i18n.t('tripMode.openToday'))).toBeTruthy();
    expect(screen.queryByText(/Offline/)).toBeNull();
  });

  it('the trip card opens live Today during the trip', async () => {
    serverHas([trip]);
    await renderApp(<HomeScreen />);
    await fireEvent.press(await screen.findByText('New York'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/today', params: { tripId: trip.id } });
    expect(screen.getByText(i18n.t('tripMode.viewItinerary'))).toBeTruthy();
  });

  it('the trip card opens Today as a preview before the trip', async () => {
    jest.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    serverHas([trip]);
    await renderApp(<HomeScreen />);
    await fireEvent.press(await screen.findByText('New York'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/today', params: { tripId: trip.id, preview: '1' } });
  });

  it('opens offline from the saved copy and says so (cold launch, airplane mode)', async () => {
    await seedSavedCopy([trip], Date.parse('2026-11-23T08:30:00Z'));
    goOffline();
    await renderApp(<HomeScreen />);
    expect(await screen.findByText('New York')).toBeTruthy();
    expect(await screen.findByText(new RegExp(i18n.t('offline.offline')))).toBeTruthy();
    expect(screen.queryByText(i18n.t('errors.NETWORK'))).toBeNull();
  });
});
