import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TodayRoute from '@/app/today';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy, setRouteParams, storedOps } from '../render';

const t = i18n.t.bind(i18n);

// 11:00 on the first trip day: coffee is done, the Met (10:00) is behind, lunch (13:00) is ahead.
const trip = () =>
  tripDetail([
    tripPlace(1, { startTime: '09:00', visitedAt: '2026-11-23T14:30:00.000Z', category: 'coffee', durationMinutes: 45 }),
    tripPlace(2, { startTime: '10:00', myLabel: 'The Met', durationMinutes: 120 }),
    tripPlace(3, { startTime: '13:00', myLabel: 'Lunch', category: 'food', durationMinutes: 60 }),
    tripPlace(4, { myLabel: 'High Line', category: 'outdoors', durationMinutes: 60 }),
  ]);

async function openReplan() {
  await seedSavedCopy([trip()], Date.parse('2026-11-23T08:00:00Z'));
  goOffline();
  await renderApp(<TodayRoute />);
  await fireEvent.press(await screen.findByText(t('replan.open')));
  await screen.findByText(t('replan.body'));
}

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 10, 23, 11, 0) });
  await resetAll();
  setRouteParams({ tripId: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Replan the rest of today', () => {
  it('behind schedule: starts with "running late", proposes a new time for the late visit only, and changes nothing before Apply', async () => {
    await openReplan();
    expect(screen.getByText(`“${t('replan.lateMessage')}”`)).toBeTruthy();
    expect(screen.getByText(t('assistant.noteCatchUp', { count: 1 }))).toBeTruthy();
    expect(screen.getByText(/^The Met: .+ → .+$/)).toBeTruthy();
    // Only today is planned here (no other day's cards).
    expect(screen.queryByText(/November 24/)).toBeNull();
    expect(await storedOps()).toEqual([]);

    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      const met = ops.find((op) => op.kind === 'stop' && op.field === 'startTime' && op.stopId === uuid(102));
      expect(met && met.kind === 'stop' && typeof met.value === 'string' && met.value >= '11:00').toBe(true);
      // Lunch keeps its time; the done coffee is untouched; nothing is removed or sent to another day.
      expect(ops.some((op) => op.kind === 'stop' && (op.stopId === uuid(103) || op.stopId === uuid(101)) && op.field === 'startTime')).toBe(false);
      expect(ops.some((op) => op.kind === 'stopRemove')).toBe(false);
      expect(ops.some((op) => op.kind === 'stop' && op.field === 'day' && op.stopId === uuid(102))).toBe(false);
    });
  });

  it('a late visit switched off keeps its time', async () => {
    await openReplan();
    const row = screen.getByText(/^The Met: .+ → .+$/);
    const label = row.props.children as string;
    // The whole row is the control: one tap leaves the change out.
    await fireEvent.press(screen.getByLabelText(label));
    expect(await screen.findByText(/^The Met: keep /)).toBeTruthy();
  });
});
