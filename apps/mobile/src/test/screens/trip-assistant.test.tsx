import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { TripAssistantRequest } from '@travel-companion/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TripScreen from '@/app/trips/[id]/index';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, mockApi, renderApp, resetAll, seedSavedCopy, serverHas, setRouteParams, storedOps } from '../render';

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T08:00:00Z') });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

// Tuesday Nov 24 is a full day; the Met is starred, dinner has a time.
const places = () => [
  tripPlace(1, { myLabel: 'The Met', day: '2026-11-24', durationMinutes: 180, highlight: true }),
  tripPlace(2, { myLabel: 'MoMA', day: '2026-11-24', durationMinutes: 180 }),
  tripPlace(3, { myLabel: 'SoHo shops', day: '2026-11-24', durationMinutes: 120, category: 'shopping' }),
  tripPlace(4, { myLabel: 'Dinner', day: '2026-11-24', startTime: '20:00', durationMinutes: 90, category: 'food' }),
];

async function ask(message: string) {
  await seedSavedCopy([tripDetail(places())], Date.parse('2026-11-23T07:00:00Z'));
  goOffline();
  await renderApp(<TripScreen />);
  await fireEvent.press(await screen.findByText(i18n.t('tripPlan.open')));
  await fireEvent.changeText(await screen.findByLabelText(i18n.t('assistant.label')), message);
  await fireEvent.press(screen.getByText(i18n.t('assistant.send')));
}

describe('Trip assistant (D1)', () => {
  it('"Make Tuesday less busy": read on the phone, explained, and only a proposal until applied', async () => {
    await ask('Make Tuesday less busy');
    expect(await screen.findByText(i18n.t('assistant.readOnPhone'))).toBeTruthy();
    expect(screen.getByText(/^Tuesday, November 24: up to about [\d.]+ h\. \d+ visits? suggested for (another day|other days)\.$/)).toBeTruthy();
    // The move carries "You asked"; the starred Met and timed dinner are never suggested.
    expect(screen.getAllByText(i18n.t('tripPlan.tagYouAsked')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Move The Met/)).toBeNull();
    expect(screen.queryByText(/^Move Dinner/)).toBeNull();
    // Before → after on the day.
    expect(screen.getAllByText(/^Before: 4 visits/).length).toBeGreaterThan(0);
    expect(await storedOps()).toEqual([]);

    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      const moved = ops.filter((op) => op.kind === 'stop' && op.field === 'day').map((op) => (op.kind === 'stop' ? op.stopId : ''));
      expect(moved.length).toBeGreaterThan(0);
      expect(moved).not.toContain(uuid(101));
      expect(moved).not.toContain(uuid(104));
      expect(ops.some((op) => op.kind === 'stopRemove')).toBe(false);
    });
  });

  it('"More time for shopping": a longer visit you can accept, sent through the queue', async () => {
    await ask('Give me more time for shopping');
    const row = await screen.findByText('SoHo shops: 2 h → 3 h');
    expect(row).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops.some((op) => op.kind === 'stop' && op.field === 'durationMinutes' && op.stopId === uuid(103) && op.value === 180)).toBe(true);
    });
  });

  it("offline, a request the phone can't read keeps manual planning and changes nothing", async () => {
    await ask('Can we see more of Brooklyn?');
    expect(await screen.findByText(i18n.t('assistant.offline'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('assistant.readOnPhone'))).toBeNull();
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    expect(await storedOps()).toEqual([]);
  });
});

describe('Trip assistant (D1) with AI', () => {
  // Same day, plus a Google place without a label (its Google name/id must never reach the AI).
  const online = async (message: string) => {
    serverHas([tripDetail([...places(), tripPlace(5, { day: '2026-11-24', durationMinutes: 60, category: 'coffee' })])]);
    await renderApp(<TripScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('tripPlan.open')));
    await fireEvent.changeText(await screen.findByLabelText(i18n.t('assistant.label')), message);
    await fireEvent.press(screen.getByText(i18n.t('assistant.send')));
  };

  it("sends only the user's own words, asks one question, and shows the AI's plan as a proposal", async () => {
    mockApi.tripAssistant
      .mockImplementationOnce(() => Promise.resolve({ action: 'clarify', question: 'Which day?', options: ['Tuesday', 'Wednesday'] }))
      .mockImplementationOnce(() =>
        Promise.resolve({ action: 'plan', summary: 'Lighter Tuesday', instructions: [{ kind: 'lighten', day: '2026-11-24', maxHours: null }] }),
      );
    await online('I want a calmer pace overall');

    await fireEvent.press(await screen.findByText('Tuesday'));
    expect(await screen.findByText(`${i18n.t('assistant.readByAi')} · Lighter Tuesday`)).toBeTruthy();
    expect(screen.getAllByText(i18n.t('tripPlan.tagYouAsked')).length).toBeGreaterThan(0);

    expect(mockApi.tripAssistant).toHaveBeenCalledTimes(2);
    const [first, second] = mockApi.tripAssistant.mock.calls.map((call) => call[0] as unknown as TripAssistantRequest);
    const sent = JSON.stringify(first);
    expect(sent).not.toMatch(/ChIJ/);
    const labels = first?.context.days.flatMap((day) => day.visits.map((visit) => visit.label));
    expect(labels).toEqual(expect.arrayContaining(['The Met', 'MoMA', 'SoHo shops', 'Dinner', null]));
    expect(second?.clarifications).toEqual([{ question: 'Which day?', answer: 'Tuesday' }]);
    // Nothing changes until Apply.
    expect(await storedOps()).toEqual([]);
  });

  it('"unavailable" (no key, over the cap, an error) keeps manual planning and changes nothing', async () => {
    mockApi.tripAssistant.mockImplementation(() => Promise.resolve({ action: 'unavailable' }));
    await online('Can we see more of Brooklyn?');
    expect(await screen.findByText(i18n.t('assistant.unavailable'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('assistant.readByAi'))).toBeNull();
    expect(await storedOps()).toEqual([]);
  });

  it('reads common requests on the phone without calling the AI', async () => {
    mockApi.tripAssistant.mockImplementation(() => Promise.resolve({ action: 'unavailable' }));
    await online('Start every day at 10:00');
    expect(await screen.findByText(i18n.t('assistant.readOnPhone'))).toBeTruthy();
    expect(mockApi.tripAssistant).not.toHaveBeenCalled();
  });
});
