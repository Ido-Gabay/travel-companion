import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TripScreen from '@/app/trips/[id]/index';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
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

// Day 1 is too full (about 12 h); three wishlist places wait for a day.
const places = () => [
  tripPlace(1, { myLabel: 'The Met', durationMinutes: 300, highlight: true }),
  tripPlace(2, { myLabel: 'MoMA', durationMinutes: 240 }),
  tripPlace(3, { myLabel: 'Dinner', startTime: '20:00', durationMinutes: 120 }),
  tripPlace(4, { myLabel: 'Zoo', day: null }),
  tripPlace(5, { myLabel: 'High Line', day: null }),
  tripPlace(6, { myLabel: 'Bakery', day: null }),
];

async function openPlan() {
  await seedSavedCopy([tripDetail(places())], Date.parse('2026-11-23T07:00:00Z'));
  goOffline();
  await renderApp(<TripScreen />);
  await fireEvent.press(await screen.findByText(i18n.t('tripPlan.open')));
  await screen.findByText(i18n.t('tripPlan.sheetBody'));
}

describe('Trip-wide plan (D1)', () => {
  it('proposes a day for every wishlist place and a fix for the overloaded day, with reasons, and never touches starred or timed visits', async () => {
    await openPlan();
    for (const name of ['Zoo', 'High Line', 'Bakery']) expect(await screen.findByText(`Add ${name}`)).toBeTruthy();
    expect(screen.getByText(/^Move MoMA here from /)).toBeTruthy();
    expect(screen.queryByText(/^Move The Met/)).toBeNull();
    expect(screen.queryByText(/^Move Dinner/)).toBeNull();
    // Assumptions (no location offline) wait behind "How this plan works" instead of filling the sheet.
    expect(screen.queryByText(/places have no location: planned by free time only/)).toBeNull();
    await fireEvent.press(screen.getByText(i18n.t('tripPlan.showHow')));
    expect(screen.getByText(/places have no location: planned by free time only/)).toBeTruthy();
    // Each day's load is a bar (its numbers for VoiceOver), and the footer says what saving does.
    expect(screen.getAllByLabelText(/of 11 ?h planned$/).length).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t('tripPlan.outcomeAdded', { count: 3 }))).toBeTruthy();
    expect(screen.getByText(i18n.t('tripPlan.ctaSave'))).toBeTruthy();
    // No Google lookup counts in the flow.
    expect(screen.queryByText(/Google lookup/)).toBeNull();
    // The unified preview: the timed dinner keeps its time; new visits get suggested times.
    expect(screen.getAllByText(/· yours$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/≈\d+ min/).length).toBeGreaterThan(0);
  });

  it('applies only the chosen changes, through the offline queue, and never removes a visit', async () => {
    await openPlan();
    const label = 'Add Bakery';
    await screen.findByText(label);
    // The whole row is the control: one tap leaves the change out, and the footer follows.
    await fireEvent.press(screen.getByLabelText(label));
    expect(await screen.findByText(i18n.t('tripPlan.outcomeAdded', { count: 2 }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      const added = ops.flatMap((op) => (op.kind === 'stopAdd' ? [op.tripPlaceId] : []));
      expect(added.sort()).toEqual([memberId(uuid(104)), memberId(uuid(105))].sort());
    });
    // New visits are created with their time; the moved visit gets one too; each changed day gets its order.
    const queued = await storedOps();
    expect(queued.filter((op) => op.kind === 'stopAdd').every((op) => op.kind === 'stopAdd' && op.startTime !== null)).toBe(true);
    expect(queued.some((op) => op.kind === 'stop' && op.field === 'startTime' && op.stopId === uuid(102))).toBe(true);
    const ops = await storedOps();
    expect(ops.some((op) => op.kind === 'stopRemove')).toBe(false);
    expect(ops.some((op) => op.kind === 'stop' && op.field === 'day' && op.stopId === uuid(102))).toBe(true);
    // The starred visit stays on its day (it may get a time like any visit without one); the timed dinner is untouched.
    expect(ops.some((op) => op.kind === 'stop' && op.field === 'day' && op.stopId === uuid(101))).toBe(false);
    expect(ops.some((op) => op.kind === 'stop' && op.stopId === uuid(103))).toBe(false);
    expect(await screen.findByText(/changes applied/)).toBeTruthy();
  });

  it('"Start every day at 8 am" when every visit has a time: says so, and moves the day only when chosen', async () => {
    const timed = [
      tripPlace(1, { myLabel: 'Florentina', day: '2026-11-24', startTime: '09:30', durationMinutes: 60, position: 0 }),
      tripPlace(2, { myLabel: 'Gallery', day: '2026-11-24', startTime: '11:00', durationMinutes: 60, position: 1 }),
    ];
    await seedSavedCopy([tripDetail(timed)], Date.parse('2026-11-23T07:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('tripPlan.open')));
    await fireEvent.changeText(await screen.findByLabelText(i18n.t('assistant.label')), 'Start every day at 8 am');
    await fireEvent.press(screen.getByText(i18n.t('assistant.send')));
    expect(await screen.findByText(i18n.t('assistant.noteStartTimed', { count: 2 }))).toBeTruthy();
    const row = await screen.findByLabelText(/: start at 8:00\sAM instead of 9:30\sAM$/);
    expect(row.props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByTestId('plan-apply').props.accessibilityState).toMatchObject({ disabled: true });
    expect(await storedOps()).toEqual([]);

    await fireEvent.press(row);
    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const times = (await storedOps()).flatMap((op) => (op.kind === 'stop' && op.field === 'startTime' ? [[op.stopId, op.value]] : []));
      expect(times).toEqual(expect.arrayContaining([[uuid(101), '08:00'], [uuid(102), '09:30']]));
    });
  });
});
