import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import RecapScreen from '@/app/trips/[id]/recap';
import TripScreen from '@/app/trips/[id]/index';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy, setRouteParams, storedOps } from '../render';

const DAY = '2026-11-23';
const stops = () => [
  tripPlace(1, { startTime: '10:00', myLabel: 'Bagels', visitedAt: '2026-11-23T15:10:00.000Z' }),
  tripPlace(2, { startTime: '13:00', myLabel: 'The Met' }),
];

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 10, 23, 18, 0) });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Trip journal (offline)', () => {
  it('rates the day, writes a note and stars a highlight, all saved as pending changes', async () => {
    await seedSavedCopy([tripDetail(stops())], Date.now());
    goOffline();
    await renderApp(<TripScreen />);

    expect(await screen.findByText(i18n.t('journal.whatYouDid'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(i18n.t('journal.rate', { value: 4 })));

    await fireEvent.press(screen.getByText(i18n.t('journal.addNote')));
    await fireEvent.changeText(await screen.findByPlaceholderText(i18n.t('journal.notePlaceholder')), 'Best bagel of my life');
    await fireEvent.press(screen.getByText(i18n.t('common.save')));

    const rows = await screen.findAllByHintText(i18n.t('itinerary.rowHint'));
    await fireEvent.press(rows[1]!);
    await fireEvent.press(await screen.findByText(i18n.t('journal.markHighlight')));

    await waitFor(async () => {
      const ops = await storedOps();
      expect(ops).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'journal', day: DAY, field: 'rating', value: 4 }),
          expect.objectContaining({ kind: 'journal', day: DAY, field: 'note', value: 'Best bagel of my life' }),
          expect.objectContaining({ kind: 'stop', stopId: uuid(102), field: 'highlight', value: true }),
        ]),
      );
    });
    expect(await screen.findByText('Best bagel of my life')).toBeTruthy();
    expect(await screen.findByLabelText(i18n.t('journal.highlight'))).toBeTruthy();
  });
});

describe('Trip recap', () => {
  it('shows the numbers, highlights and the day, and shares it as text', async () => {
    const share = jest.spyOn(Share, 'share').mockImplementation(() => Promise.resolve({ action: 'sharedAction', activityType: undefined }));
    const places = [
      tripPlace(1, { myLabel: 'Bagels', visitedAt: '2026-11-23T15:10:00.000Z' }),
      tripPlace(2, { myLabel: 'The Met', visitedAt: '2026-11-23T18:00:00.000Z', highlight: true }),
      tripPlace(3, { myLabel: 'Bridge', day: '2026-11-24' }),
    ];
    await seedSavedCopy([tripDetail(places)], Date.now(), {
      journals: { [uuid(1)]: { days: [{ day: DAY, note: 'Rain, then sun', rating: 5, updatedAt: '2026-11-23T23:00:00.000Z' }] } },
    });
    goOffline();
    await renderApp(<RecapScreen />);
    expect(await screen.findByText(new RegExp(i18n.t('journal.statPlaces', { visited: 2, planned: 3 })))).toBeTruthy();
    expect(screen.getByText(i18n.t('journal.highlights'))).toBeTruthy();
    expect(screen.getByText('Rain, then sun')).toBeTruthy();
    expect(screen.getByText('Bagels → The Met')).toBeTruthy();
    await fireEvent.press(screen.getByText(i18n.t('journal.share')));
    const message = (share.mock.calls[0]?.[0] as { message: string }).message;
    expect(message).toContain('New York');
    expect(message).toContain('Rain, then sun');
    expect(message).toContain('★★★★★');
  });
});
