import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import TodayRoute from '@/app/today';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy, setRouteParams } from '../render';

beforeEach(async () => {
  // 11:00 in the phone's zone on the first trip day (Google's trip zone isn't available offline).
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 10, 23, 11, 0) });
  await resetAll();
  setRouteParams({ tripId: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Today', () => {
  it('opens offline on a trip day: next stop and the day from the saved copy', async () => {
    await seedSavedCopy(
      [
        tripDetail([
          tripPlace(1, { startTime: '09:00', visitedAt: '2026-11-23T14:30:00.000Z', category: 'coffee' }),
          tripPlace(2, { startTime: '12:30', myLabel: 'The Met' }),
          tripPlace(3, { startTime: '16:00', category: 'food' }),
        ]),
      ],
      Date.parse('2026-11-23T08:00:00Z'),
    );
    goOffline();
    await renderApp(<TodayRoute />);
    expect(await screen.findByText(i18n.t('today.next'))).toBeTruthy();
    expect((await screen.findAllByText('The Met')).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(i18n.t('offline.offline')))).toBeTruthy();
    expect(screen.queryByText(i18n.t('errors.NETWORK'))).toBeNull();
  });
});
