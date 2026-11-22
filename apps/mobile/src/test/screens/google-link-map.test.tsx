import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DiscoverResult, Place } from '@travel-companion/shared';
import PlaceScreen from '@/app/places/[id]';
import { tripPlace } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { mockApi, renderApp, resetAll, serverHas, setRouteParams } from '../render';

// Pretend this build has a Google Maps key, so the (mocked) map draws the pins.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual<{ default: { expoConfig?: { extra?: object } } }>('expo-constants').default;
  return {
    __esModule: true,
    default: { ...actual, expoConfig: { ...actual.expoConfig, extra: { ...actual.expoConfig?.extra, googleMapsEnabled: true } } },
  };
});

const t = i18n.t.bind(i18n);
const result = (placeId: string, name: string, latitude: number, longitude: number): DiscoverResult => ({
  placeId,
  name,
  address: 'New York, NY',
  location: { latitude, longitude },
  primaryType: 'restaurant',
  typeLabel: 'Deli',
  googleMapsUri: null,
  businessStatus: 'OPERATIONAL',
  timeZone: 'America/New_York',
  savedPlaceId: null,
  inTrip: false,
  category: 'food',
});

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-20T10:00:00Z') });
  await resetAll();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Find on Google Maps: map view', () => {
  it('shows the same results as numbered pins (no extra Google call); a pin shows that branch, ready to link', async () => {
    const katz = tripPlace(1, { source: 'custom', googlePlaceId: null, name: 'Katz', day: null, category: 'other' }) as unknown as Place;
    serverHas([]);
    setRouteParams({ id: katz.id });
    mockApi.getPlace.mockImplementation(() => Promise.resolve(katz));
    mockApi.getPlaceVisits.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.discoverSearch.mockImplementation(() =>
      Promise.resolve({
        results: [result('ChIJmidtown00001', 'Katz Midtown', 40.7549, -73.984), result('ChIJbrooklyn0001', 'Katz Brooklyn', 40.6782, -73.9442)],
      }),
    );
    mockApi.linkGooglePlace.mockImplementation(() => Promise.resolve({ ...katz, source: 'google', googlePlaceId: 'ChIJbrooklyn0001' }));

    await renderApp(<PlaceScreen />);
    await fireEvent.press(await screen.findByText(t('googleLink.action')));
    await fireEvent.press(await screen.findByText(t('googleLink.search')));
    await waitFor(() => expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1));
    // The list is numbered like the pins.
    expect(await screen.findByLabelText('Katz Midtown')).toBeTruthy();
    const googleCalls = () =>
      mockApi.discoverSearch.mock.calls.length + mockApi.getGooglePlace.mock.calls.length + mockApi.getGooglePlacePreview.mock.calls.length;
    const before = googleCalls();

    await fireEvent.press(screen.getByLabelText(t('googleLink.viewMap')));
    expect(screen.getByText(t('googleLink.mapHint'))).toBeTruthy();
    expect(screen.getByTestId('marker-ChIJmidtown00001')).toBeTruthy();
    expect(screen.getByTestId('marker-ChIJbrooklyn0001')).toBeTruthy();
    // Under the map, only the place whose pin was tapped.
    await fireEvent.press(screen.getByTestId('marker-ChIJbrooklyn0001'));
    expect(screen.queryByText(t('googleLink.mapHint'))).toBeNull();
    expect(screen.queryByLabelText('Katz Midtown')).toBeNull();
    expect(googleCalls()).toBe(before);

    await fireEvent.press(screen.getByLabelText('Katz Brooklyn'));
    await waitFor(() => expect(mockApi.linkGooglePlace).toHaveBeenCalledTimes(1));
    expect(mockApi.linkGooglePlace.mock.calls[0]?.[1]).toEqual({ googlePlaceId: 'ChIJbrooklyn0001', category: 'food' });
    expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1);
  });

  it('switching back to the list keeps the same results (still one search)', async () => {
    const katz = tripPlace(1, { source: 'custom', googlePlaceId: null, name: 'Katz', day: null }) as unknown as Place;
    serverHas([]);
    setRouteParams({ id: katz.id });
    mockApi.getPlace.mockImplementation(() => Promise.resolve(katz));
    mockApi.getPlaceVisits.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.discoverSearch.mockImplementation(() =>
      Promise.resolve({ results: [result('ChIJmidtown00001', 'Katz Midtown', 40.7549, -73.984), result('ChIJbrooklyn0001', 'Katz Brooklyn', 40.6782, -73.9442)] }),
    );
    await renderApp(<PlaceScreen />);
    await fireEvent.press(await screen.findByText(t('googleLink.action')));
    await fireEvent.press(await screen.findByText(t('googleLink.search')));
    await fireEvent.press(await screen.findByLabelText(t('googleLink.viewMap')));
    await fireEvent.press(screen.getByTestId('marker-ChIJmidtown00001'));
    await fireEvent.press(screen.getByLabelText(t('googleLink.viewList')));
    expect(screen.getByLabelText('Katz Midtown')).toBeTruthy();
    expect(screen.getByLabelText('Katz Brooklyn')).toBeTruthy();
    expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1);
  });
});
