import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DiscoverResult, Place } from '@travel-companion/shared';
import PlacesScreen from '@/app/(tabs)/places';
import PlaceScreen from '@/app/places/[id]';
import { tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { mockApi, renderApp, resetAll, serverHas, setRouteParams } from '../render';

const t = i18n.t.bind(i18n);
/** The category chip (a button) whose label is this text. */
function chip(label: string) {
  for (const text of screen.getAllByText(label)) {
    let node: typeof text | null = text;
    while (node && node.props.accessibilityRole !== 'button') node = node.parent;
    if (node) return node;
  }
  throw new Error(`No chip labeled ${label}`);
}
const custom = (n: number, name: string, extra: Partial<ReturnType<typeof tripPlace>> = {}) =>
  tripPlace(n, { source: 'custom', googlePlaceId: null, name, day: null, ...extra });
const result = (placeId: string, name: string): DiscoverResult => ({
  placeId,
  name,
  address: '205 E Houston St, New York, NY',
  location: { latitude: 40.7223, longitude: -73.9874 },
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

describe('Link a place saved by name to Google Maps', () => {
  it('from the place: one search on tap, pick a result, and the place is linked (no other lookups)', async () => {
    const katz = custom(1, "Katz's", { address: 'Lower East Side', category: 'food' }) as unknown as Place;
    serverHas([]);
    setRouteParams({ id: katz.id });
    mockApi.getPlace.mockImplementation(() => Promise.resolve(katz));
    mockApi.getPlaceVisits.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.discoverSearch.mockImplementation(() => Promise.resolve({ results: [result('ChIJkatz0000001', "Katz's Delicatessen")] }));
    mockApi.linkGooglePlace.mockImplementation(() =>
      Promise.resolve({ ...katz, source: 'google', googlePlaceId: 'ChIJkatz0000001', name: null, address: null, myLabel: "Katz's" }),
    );
    await renderApp(<PlaceScreen />);
    await fireEvent.press(await screen.findByText(t('googleLink.action')));
    expect(mockApi.discoverSearch).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByText(t('googleLink.search')));
    await waitFor(() => expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1));
    expect((mockApi.discoverSearch.mock.calls[0]?.[0] as unknown as { plan: { textQuery: string } }).plan.textQuery).toBe("Katz's Lower East Side");
    await fireEvent.press(await screen.findByLabelText("Katz's Delicatessen"));
    await waitFor(() => expect(mockApi.linkGooglePlace).toHaveBeenCalledTimes(1));
    expect(mockApi.linkGooglePlace.mock.calls[0]).toEqual([katz.id, { googlePlaceId: 'ChIJkatz0000001', category: 'food' }]);
    expect(mockApi.saveGooglePlaces).not.toHaveBeenCalled();
  });

  it("an unclassified place shows the Google result's category right after linking", async () => {
    const katz = custom(1, "Katz's", { category: 'other' }) as unknown as Place;
    serverHas([]);
    setRouteParams({ id: katz.id });
    mockApi.getPlace.mockImplementation(() => Promise.resolve(katz));
    mockApi.getPlaceVisits.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.discoverSearch.mockImplementation(() => Promise.resolve({ results: [result('ChIJkatz0000001', "Katz's Delicatessen")] }));
    // Like the server: the sent category replaces 'other'.
    mockApi.linkGooglePlace.mockImplementation(((_id: string, body: { googlePlaceId: string; category?: string }) => {
      const linked = { ...katz, source: 'google', googlePlaceId: body.googlePlaceId, name: null, myLabel: "Katz's", category: body.category ?? 'other' };
      mockApi.getPlace.mockImplementation(() => Promise.resolve(linked));
      return Promise.resolve(linked);
    }) as never);
    await renderApp(<PlaceScreen />);
    await fireEvent.press(await screen.findByText(t('places.moreDetails')));
    expect(chip(t('categories.other')).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByText(t('googleLink.action')));
    await fireEvent.press(await screen.findByText(t('googleLink.search')));
    await fireEvent.press(await screen.findByLabelText("Katz's Delicatessen"));
    await waitFor(() => expect(mockApi.linkGooglePlace).toHaveBeenCalledTimes(1));
    expect(mockApi.linkGooglePlace.mock.calls[0]?.[1]).toEqual({ googlePlaceId: 'ChIJkatz0000001', category: 'food' });
    await waitFor(() => expect(chip(t('categories.food')).props.accessibilityState).toMatchObject({ selected: true }));
  });

  it('a Google place (or your own pin) offers no link', async () => {
    const google = tripPlace(2, { day: null }) as unknown as Place;
    serverHas([]);
    setRouteParams({ id: google.id });
    mockApi.getPlace.mockImplementation(() => Promise.resolve(google));
    mockApi.getPlaceVisits.mockImplementation(() => Promise.resolve({ items: [] }));
    mockApi.listTrips.mockImplementation(() => Promise.resolve({ items: [] }));
    await renderApp(<PlaceScreen />);
    await screen.findByText(t('places.directions'));
    expect(screen.queryByText(t('googleLink.action'))).toBeNull();
  });
});

describe('Saved: places by trip', () => {
  it('shows every saved place, or only the ones saved to the chosen trip', async () => {
    const nyc = tripDetail([custom(1, 'MoMA'), custom(2, 'Katz')]);
    const rome = tripDetail([custom(3, 'Colosseum')], { id: uuid(2), title: 'Rome' });
    serverHas([nyc, rome]);
    mockApi.listPlaces.mockImplementation(() =>
      Promise.resolve({ items: [...nyc.places, ...rome.places, custom(4, 'Somewhere else')] }),
    );
    await renderApp(<PlacesScreen />);
    expect(await screen.findByText('Somewhere else')).toBeTruthy();
    expect(screen.getByText('Colosseum')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(t('places.tripFilterA11y', { name: t('places.allTrips') })));
    await fireEvent.press(await screen.findByText('Rome'));
    // The menu runs its action once it has closed.
    await waitFor(() => expect(screen.queryByText('MoMA')).toBeNull());
    expect(await screen.findByText('Colosseum')).toBeTruthy();
    expect(screen.queryByText('Somewhere else')).toBeNull();

    await fireEvent.press(screen.getByLabelText(t('places.tripFilterA11y', { name: 'Rome' })));
    await fireEvent.press(await screen.findByText(t('places.allTrips')));
    expect(await screen.findByText('Somewhere else')).toBeTruthy();
  });
});
