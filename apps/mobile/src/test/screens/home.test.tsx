import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
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

  it('opens offline from the saved copy and says so (cold launch, airplane mode)', async () => {
    await seedSavedCopy([trip], Date.parse('2026-11-23T08:30:00Z'));
    goOffline();
    await renderApp(<HomeScreen />);
    expect(await screen.findByText('New York')).toBeTruthy();
    expect(await screen.findByText(new RegExp(i18n.t('offline.offline')))).toBeTruthy();
    expect(screen.queryByText(i18n.t('errors.NETWORK'))).toBeNull();
  });
});
