import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '@/app/(tabs)/index';
import type { PendingOp } from '@/features/offline/pending-ops';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy, storedOps } from '../render';

const op: PendingOp = {
  id: 'op1', kind: 'schedule', tripId: uuid(1), placeId: uuid(101), field: 'startTime', value: '11:00', base: '10:00', createdAt: 1,
};

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-20T12:00:00Z') });
  await resetAll();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Sync conflicts', () => {
  it('shows a conflict and "Keep mine" puts the change back in the queue against the server value', async () => {
    await seedSavedCopy([tripDetail([tripPlace(1, { startTime: '09:00', myLabel: 'Breakfast' })])], Date.now(), {
      conflicts: [{ op, reason: 'changed', serverValue: '09:00', detectedAt: 2 }],
    });
    goOffline();
    await renderApp(<HomeScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('offline.review')));
    expect(await screen.findByText(/Breakfast/)).toBeTruthy();
    expect(await screen.findByText(new RegExp(i18n.t('offline.keepMine')))).toBeTruthy();
    await fireEvent.press(screen.getByText(i18n.t('offline.keepMine')));
    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ value: '11:00', base: '09:00' });
    });
  });
});
