import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Place } from '@travel-companion/shared';
import ImportScreen from '@/app/trips/[id]/import';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, mockApi, renderApp, resetAll, seedSavedCopy, serverHas, setRouteParams } from '../render';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
const pickMock = getDocumentAsync as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const fileMock = File as unknown as jest.Mock<(...args: unknown[]) => unknown>;

/** The picker returns this file, and reading it gives this text (or fails). */
function fileHas(text: string | Error, name = 'New York.csv') {
  pickMock.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/list.csv', name, size: 120 }] });
  fileMock.mockImplementation(() => ({ text: () => (text instanceof Error ? Promise.reject(text) : Promise.resolve(text)) }));
}

const t = i18n.t.bind(i18n);
const custom = (n: number, name: string, extra: Partial<ReturnType<typeof tripPlace>> = {}) =>
  tripPlace(n, { source: 'custom', googlePlaceId: null, name, day: null, ...extra });
// MoMA is already in the trip; Katz is only in the collection.
const trip = tripDetail([custom(1, 'MoMA')]);
const katz = custom(50, 'Katz') as unknown as Place;

function online() {
  serverHas([trip]);
  mockApi.listPlaces.mockImplementation(() => Promise.resolve({ items: [...trip.places, katz] }));
  let next = 60;
  mockApi.createPlace.mockImplementation((...args: never[]) => {
    const body = args[0] as unknown as { name: string };
    next += 1;
    return Promise.resolve(custom(next, body.name));
  });
  mockApi.addTripMember.mockImplementation(() => Promise.resolve(structuredClone(trip)));
}

async function open() {
  await renderApp(<ImportScreen />);
  await screen.findByText(t('importPlaces.pasteBody'));
}

async function paste(text: string) {
  await fireEvent.changeText(screen.getByLabelText(t('importPlaces.pasteLabel')), text);
  await fireEvent.press(screen.getByTestId('import-extract'));
}

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-20T10:00:00Z') });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Import places', () => {
  it('a pasted list is read on the phone; duplicates are marked and nothing is looked up on Google', async () => {
    online();
    await open();
    await paste('- MoMA\n- Katz - pastrami\n- High Line (Chelsea)\n- high line');
    expect(await screen.findByText(t('importPlaces.foundTitle', { count: 3 }))).toBeTruthy();
    // Already in the trip: shown, not chosen, can't be chosen.
    expect(screen.getByText(t('importPlaces.inTrip'))).toBeTruthy();
    expect(screen.getByLabelText('MoMA').props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    // Already saved: reused, not copied.
    expect(screen.getByText(t('importPlaces.saved'))).toBeTruthy();
    expect(screen.getByText('Chelsea')).toBeTruthy();
    expect(screen.getByText(t('importPlaces.addCount', { count: 2 }))).toBeTruthy();

    await fireEvent.press(screen.getByTestId('import-add'));
    expect(await screen.findByText(t('importPlaces.addedTitle', { count: 2 }))).toBeTruthy();
    expect(mockApi.createPlace).toHaveBeenCalledTimes(1);
    expect(mockApi.createPlace.mock.calls[0]?.[0]).toEqual({ name: 'High Line', address: 'Chelsea' });
    const joined = mockApi.addTripMember.mock.calls.map((call) => (call[1] as unknown as { placeId: string }).placeId);
    expect(joined).toEqual([uuid(150), uuid(161)]);
    expect(mockApi.extractPlaces).not.toHaveBeenCalled();
    expect(mockApi.getGooglePlace).not.toHaveBeenCalled();
    expect(mockApi.saveGooglePlaces).not.toHaveBeenCalled();
  });

  it('a message goes to the AI once, on tap; select all and clear', async () => {
    online();
    mockApi.extractPlaces.mockImplementation(() =>
      Promise.resolve({ action: 'places', places: [{ name: 'Russ & Daughters', note: 'bagels', area: 'Lower East Side' }, { name: 'Katz', note: null, area: null }] }),
    );
    await open();
    const message = 'You have to get bagels at Russ & Daughters on the Lower East Side. And Katz is a must!';
    await paste(message);
    expect(await screen.findByText('Russ & Daughters')).toBeTruthy();
    expect(screen.getByText('Lower East Side · bagels')).toBeTruthy();
    expect(mockApi.extractPlaces).toHaveBeenCalledTimes(1);
    expect(mockApi.extractPlaces.mock.calls[0]?.[0]).toEqual({ text: message, locale: 'en' });

    await fireEvent.press(screen.getByText(t('importPlaces.clear')));
    expect(screen.getByText(t('importPlaces.chooseSome'))).toBeTruthy();
    expect(screen.getByTestId('import-add').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByText(t('importPlaces.selectAll')));
    expect(screen.getByText(t('importPlaces.addCount', { count: 2 }))).toBeTruthy();
  });

  it('AI unavailable or offline: says so, keeps the text, and lists still work', async () => {
    await seedSavedCopy([trip], Date.parse('2026-11-20T09:00:00Z'));
    goOffline();
    await open();
    const message = 'When you are in NYC go to MoMA and the Met. Have fun out there!';
    await paste(message);
    expect(await screen.findByText(t('importPlaces.needsConnection'))).toBeTruthy();
    expect(mockApi.extractPlaces).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t('importPlaces.pasteLabel')).props.value).toBe(message);
    // One place per line works offline.
    await paste('MoMA\nThe Met');
    expect(await screen.findByText(t('importPlaces.foundTitle', { count: 2 }))).toBeTruthy();
  });

  it('Google Takeout CSV (Hebrew headers), and a CSV that is not one', async () => {
    online();
    await open();
    await fireEvent.press(screen.getByText(t('importPlaces.modeCsv')));
    const field = screen.getByLabelText(t('importPlaces.csvLabel'));
    await fireEvent.changeText(field, 'Name,Phone\nBob,123');
    await fireEvent.press(screen.getByTestId('import-extract'));
    expect(await screen.findByText(t('importPlaces.notTakeout'))).toBeTruthy();

    await fireEvent.changeText(field, 'כותרת,הערה,כתובת אתר\nמחנה יהודה,לבוא רעבים,https://maps.google.com/?cid=1\n,,\n');
    await fireEvent.press(screen.getByTestId('import-extract'));
    expect(await screen.findByText('מחנה יהודה')).toBeTruthy();
    expect(screen.getByText('לבוא רעבים')).toBeTruthy();
    expect(mockApi.extractPlaces).not.toHaveBeenCalled();
  });

  it('a failed save can be retried without saving any place twice', async () => {
    online();
    let calls = 0;
    mockApi.addTripMember.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('network')) : Promise.resolve(structuredClone(trip));
    });
    await open();
    await paste('High Line\nLittle Island');
    await screen.findByText(t('importPlaces.foundTitle', { count: 2 }));
    await fireEvent.press(screen.getByTestId('import-add'));
    await waitFor(() => expect(mockApi.addTripMember).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('import-add').props.accessibilityState).toMatchObject({ busy: false }));
    expect(mockApi.createPlace).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('import-add'));
    expect(await screen.findByText(t('importPlaces.addedTitle', { count: 2 }))).toBeTruthy();
    // High Line was created before the failure: reused, not created again.
    expect(mockApi.createPlace.mock.calls.map((call) => (call[0] as unknown as { name: string }).name)).toEqual(['High Line', 'Little Island']);
  });

  it('a row can be linked to Google Maps: one search on tap, then saved by Google place ID (no copy by name)', async () => {
    online();
    mockApi.discoverSearch.mockImplementation(() =>
      Promise.resolve({
        results: [
          {
            placeId: 'ChIJhighline0001', name: 'The High Line', address: 'New York, NY 10011', location: { latitude: 40.748, longitude: -74.0048 },
            primaryType: 'park', typeLabel: 'Park', googleMapsUri: null, businessStatus: 'OPERATIONAL', timeZone: 'America/New_York',
            savedPlaceId: null, inTrip: false, category: 'outdoors',
          },
        ],
      }),
    );
    mockApi.saveGooglePlaces.mockImplementation(() =>
      Promise.resolve({ places: [tripPlace(70, { googlePlaceId: 'ChIJhighline0001', day: null })] }),
    );
    mockApi.updatePlace.mockImplementation(() => Promise.resolve(tripPlace(70, { googlePlaceId: 'ChIJhighline0001', day: null })));
    await open();
    await paste('High Line (Chelsea) - sunset walk\nLittle Island');
    await screen.findByText(t('importPlaces.foundTitle', { count: 2 }));
    expect(mockApi.discoverSearch).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText(t('googleLink.rowA11y', { name: 'High Line' })));
    // Nothing is searched until the user taps Search.
    expect(mockApi.discoverSearch).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByText(t('googleLink.search')));
    await waitFor(() => expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1));
    const body = mockApi.discoverSearch.mock.calls[0]?.[0] as unknown as { plan: { textQuery: string }; area: { text: string } };
    expect([body.plan.textQuery, body.area.text]).toEqual(['High Line Chelsea', 'New York']);
    await fireEvent.press(await screen.findByLabelText('The High Line'));
    expect(await screen.findByText(t('googleLink.linkedTag', { name: 'The High Line' }))).toBeTruthy();

    await fireEvent.press(screen.getByTestId('import-add'));
    expect(await screen.findByText(t('importPlaces.addedTitle', { count: 2 }))).toBeTruthy();
    expect(mockApi.saveGooglePlaces.mock.calls[0]?.[0]).toEqual({ items: [{ googlePlaceId: 'ChIJhighline0001', category: 'other' }], tripId: uuid(1) });
    // The user's own words stay theirs: their name as the label, their note.
    expect(mockApi.updatePlace.mock.calls[0]?.[1]).toEqual({ notes: 'sunset walk', myLabel: 'High Line' });
    // Only the unlinked row became a place saved by name.
    expect(mockApi.createPlace.mock.calls.map((call) => (call[0] as unknown as { name: string }).name)).toEqual(['Little Island']);
    expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1);
  });

  describe('choosing a CSV file', () => {
    async function chooseFile() {
      await fireEvent.press(screen.getByText(t('importPlaces.modeCsv')));
      await fireEvent.press(screen.getByTestId('import-choose-file'));
    }

    it('a Hebrew Takeout file is read on the phone: review list, URL ignored, nothing looked up', async () => {
      online();
      fileHas('\uFEFFכותרת,הערה,כתובת אתר\nמחנה יהודה,לבוא רעבים,https://maps.google.com/?cid=1\nKatz,,https://maps.google.com/?cid=2\n,,\n');
      await open();
      await chooseFile();
      expect(await screen.findByText(t('importPlaces.foundTitle', { count: 2 }))).toBeTruthy();
      expect(screen.getByText('מחנה יהודה')).toBeTruthy();
      // Katz is already saved: reused, not copied.
      expect(screen.getByText(t('importPlaces.saved'))).toBeTruthy();
      expect(pickMock).toHaveBeenCalledTimes(1);
      expect(mockApi.extractPlaces).not.toHaveBeenCalled();
      expect(mockApi.discoverSearch).not.toHaveBeenCalled();
      expect(mockApi.getGooglePlace).not.toHaveBeenCalled();
    });

    it('an English Takeout file', async () => {
      online();
      fileHas('Title,Note,URL\n"Russ & Daughters",bagels,https://www.google.com/maps/place/x\nThe Met,,\n');
      await open();
      await chooseFile();
      expect(await screen.findByText('Russ & Daughters')).toBeTruthy();
      expect(screen.getByText('bagels')).toBeTruthy();
      expect(screen.getByText(t('importPlaces.addCount', { count: 2 }))).toBeTruthy();
    });

    it('cancelling changes nothing; an unreadable or non-Takeout file says so and paste still works', async () => {
      online();
      pickMock.mockResolvedValue({ canceled: true, assets: null });
      await open();
      await chooseFile();
      await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(t('importPlaces.fileUnreadable'))).toBeNull();
      expect(screen.getByTestId('import-choose-file')).toBeTruthy();

      fileHas(new Error('no access'));
      await fireEvent.press(screen.getByTestId('import-choose-file'));
      expect(await screen.findByText(t('importPlaces.fileUnreadable'))).toBeTruthy();

      fileHas('Name,Phone\nBob,123\n', 'contacts.csv');
      await fireEvent.press(screen.getByTestId('import-choose-file'));
      expect(await screen.findByText(t('importPlaces.notTakeout'))).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText(t('importPlaces.csvLabel')), 'Title,Note\nHigh Line,\n');
      await fireEvent.press(screen.getByTestId('import-extract'));
      expect(await screen.findByText('High Line')).toBeTruthy();
    });
  });
});
