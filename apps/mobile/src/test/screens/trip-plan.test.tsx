import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TripScreen from '@/app/trips/[id]/index';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import { dayShort, dayTitle } from '@/features/trips/itinerary';
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
    await seedSavedCopy([tripDetail(places())], Date.parse('2026-11-23T07:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    // The itinerary behind the sheet lists places too: each proposed place adds exactly one row in the sheet.
    const names = ['Zoo', 'High Line', 'Bakery', 'MoMA'];
    await screen.findByText(i18n.t('tripPlan.open'));
    const behind = new Map(names.map((name) => [name, screen.queryAllByText(name).length]));
    await fireEvent.press(screen.getByText(i18n.t('tripPlan.open')));
    await screen.findByText(i18n.t('tripPlan.sheetBody'));
    for (const name of ['Zoo', 'High Line', 'Bakery']) expect(await screen.findByLabelText(`Add ${name}`)).toBeTruthy();
    expect(screen.getByLabelText(/^Move MoMA here from /)).toBeTruthy();
    expect(screen.queryByLabelText(/^Move The Met/)).toBeNull();
    expect(screen.queryByLabelText(/^Move Dinner/)).toBeNull();
    // One row per stop: not a switch and again in a schedule.
    for (const name of names) expect(screen.getAllByText(name)).toHaveLength((behind.get(name) ?? 0) + 1);
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
    await screen.findByLabelText(label);
    // The whole row is the control: one tap leaves the change out, and the footer follows.
    await fireEvent.press(screen.getByLabelText(label));
    expect(await screen.findByText(i18n.t('tripPlan.outcomeAdded', { count: 2 }))).toBeTruthy();
    // Left out, it stays in its day's list (no time) so one tap brings it back.
    expect(screen.getByLabelText(label).props.accessibilityState).toEqual({ checked: false });
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

  it('day pills show one day at a time; "All days" shows them all again', async () => {
    await openPlan();
    // The itinerary behind the sheet names its days too: count the sheet's on top of it.
    const count = (day: string) => screen.queryAllByText(dayTitle(day, 'en')).length;
    const monday = count('2026-11-23');
    const thursday = count('2026-11-26');
    await fireEvent.press(screen.getByLabelText(i18n.t('tripPlan.dayFilterA11y', { day: dayTitle('2026-11-26', 'en') })));
    expect(count('2026-11-26')).toBe(thursday);
    expect(count('2026-11-23')).toBe(monday - 1);
    await fireEvent.press(screen.getByLabelText(i18n.t('tripPlan.allDays')));
    expect(count('2026-11-23')).toBe(monday);
  });

  it("\"Doesn't fit\" is folded to one line; open, it says why once and lists each place on one row", async () => {
    // One day, a dozen wishlist places: they can't all fit.
    const many = Array.from({ length: 12 }, (_, index) => tripPlace(index + 1, { myLabel: `Place ${index + 1}`, day: null }));
    await seedSavedCopy([tripDetail(many, { startDate: '2026-11-24', endDate: '2026-11-24' })], Date.parse('2026-11-23T07:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('tripPlan.open')));
    const header = await screen.findByText(/^Doesn't fit \(\d+\)$/);
    const total = Number(/\((\d+)\)/.exec(String(header.props.children))?.[1]);
    expect(total).toBeGreaterThan(0);
    expect(screen.queryByText(i18n.t('tripPlan.doesntFitHelp'))).toBeNull();
    await fireEvent.press(header);
    expect(screen.getAllByText(i18n.t('tripPlan.doesntFitHelp'))).toHaveLength(1);
    // Compact: one row per place with a short "Add to <day>", never the long paragraph per place.
    expect(screen.getAllByText(i18n.t('tripPlan.addToDay', { day: dayShort('2026-11-24', 'en') }))).toHaveLength(total);
    expect(screen.queryByText(/has no room on any day/)).toBeNull();
  });

  it('"Start day one at 16:00 and the rest at 8:00": day one starts at 4 PM, the other days at 8 AM', async () => {
    jest.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    const wishlist = ['Zoo', 'High Line', 'Bakery', 'Gallery', 'Park', 'Market'].map((label, index) =>
      tripPlace(index + 1, { myLabel: label, day: null, durationMinutes: 120 }),
    );
    await seedSavedCopy([tripDetail(wishlist, { startDate: '2026-11-23', endDate: '2026-11-25' })], Date.parse('2026-11-10T07:00:00Z'));
    goOffline();
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('tripPlan.open')));
    await fireEvent.changeText(await screen.findByLabelText(i18n.t('assistant.label')), 'Start day one at 16:00 and the rest at 8:00');
    await fireEvent.press(screen.getByText(i18n.t('assistant.send')));
    // Each day's first stop: day one in the afternoon, days two and three at 8.
    const firstTimes = async (day: string) => {
      await fireEvent.press(screen.getByLabelText(i18n.t('tripPlan.dayFilterA11y', { day: dayTitle(day, 'en') })));
      return screen.queryAllByText(/^\d{1,2}:\d{2}\s[AP]M$/).map((node) => String(node.props.children));
    };
    await screen.findByText(i18n.t('tripPlan.allDays'));
    expect((await firstTimes('2026-11-23'))[0]).toMatch(/^4:00\sPM$/);
    expect((await firstTimes('2026-11-24'))[0]).toMatch(/^8:00\sAM$/);
    expect((await firstTimes('2026-11-25'))[0]).toMatch(/^8:00\sAM$/);
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
