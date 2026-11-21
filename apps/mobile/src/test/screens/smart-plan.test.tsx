import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TripScreen from '@/app/trips/[id]/index';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy, setRouteParams, storedOps } from '../render';

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T08:00:00Z') });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

// An overloaded first day: about 12 hours of visits and travel.
const places = () => [
  tripPlace(1, { myLabel: 'The Met', durationMinutes: 240, highlight: true }),
  tripPlace(2, { myLabel: 'MoMA', durationMinutes: 180 }),
  tripPlace(3, { myLabel: 'Zoo', durationMinutes: 180 }),
  tripPlace(4, { myLabel: 'Dinner', startTime: '20:00', durationMinutes: 90 }),
];

describe('Smart day plan (D1)', () => {
  it('suggests moving a flexible visit off an overloaded day, explains why, and applies only what is chosen', async () => {
    await seedSavedCopy([tripDetail(places())], Date.parse('2026-11-23T07:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('planning.planDay')));

    // A move with its reason; the starred visit and the timed dinner are never suggested.
    const move = await screen.findByText(/^Move (MoMA|Zoo) to /);
    expect(screen.getAllByText(/Starred visits and ones with a time are never moved/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Move The Met/)).toBeNull();
    expect(screen.queryByText(/^Move Dinner/)).toBeNull();
    const moved = move.props.children as string;
    const name = /^Move (\w+)/.exec(String(moved))?.[1];

    await fireEvent.press(screen.getByText(i18n.t('planning.apply')));
    await waitFor(async () => {
      const ops = await storedOps();
      const dayOps = ops.filter((op) => op.kind === 'stop' && op.field === 'day');
      expect(dayOps.length).toBeGreaterThan(0);
      // Moved, never removed: no visit is taken off the plan.
      expect(ops.some((op) => op.kind === 'stopRemove')).toBe(false);
      const ids = dayOps.map((op) => (op.kind === 'stop' ? op.stopId : ''));
      expect(ids).not.toContain(uuid(101));
      expect(ids).not.toContain(uuid(104));
    });
    expect(name === 'MoMA' || name === 'Zoo').toBe(true);
  });

  it('turning a suggestion off keeps that visit where it is', async () => {
    await seedSavedCopy([tripDetail(places())], Date.parse('2026-11-23T07:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('planning.planDay')));
    const label = String((await screen.findByText(/^Move (MoMA|Zoo) to /)).props.children);
    for (const toggle of screen.getAllByRole('switch')) {
      if (toggle.props.accessibilityLabel === label) await fireEvent(toggle, 'valueChange', false);
    }
    await fireEvent.press(screen.getByText(i18n.t('planning.apply')));
    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops.length).toBeGreaterThan(0);
    });
    const ops = await storedOps();
    const firstMoved = label.startsWith('Move MoMA') ? uuid(102) : uuid(103);
    expect(ops.some((op) => op.kind === 'stop' && op.field === 'day' && op.stopId === firstMoved)).toBe(false);
  });
});
