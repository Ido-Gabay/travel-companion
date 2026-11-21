import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DiscoverResult, DiscoverSearchRequest } from '@travel-companion/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import TripScreen from '@/app/trips/[id]/index';
import { memberId, tripDetail, tripPlace, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { mockApi, renderApp, resetAll, seedSavedCopy, serverHas, setRouteParams, storedOps } from '../render';

const t = i18n.t.bind(i18n);
const HOTEL = { latitude: 40.7577, longitude: -73.9857 };
const MET = { latitude: 40.7794, longitude: -73.9632 };
const GUGG = { latitude: 40.783, longitude: -73.959 };
const FRICK = { latitude: 40.7712, longitude: -73.9673 };
const WTC = { latitude: 40.7115, longitude: -74.0134 };
const SUMMIT = { latitude: 40.7531, longitude: -73.9787 };

// Tuesday is full uptown; Wednesday is downtown; the other days are open.
const places = () => [
  tripPlace(1, { myLabel: 'The Met', day: '2026-11-24', durationMinutes: 240 }),
  tripPlace(2, { myLabel: 'Guggenheim', day: '2026-11-24', durationMinutes: 240 }),
  tripPlace(3, { myLabel: 'Frick', day: '2026-11-24', startTime: '17:30', durationMinutes: 90 }),
  tripPlace(4, { myLabel: '9/11 Memorial', day: '2026-11-25', durationMinutes: 120 }),
];
const coords = { ChIJplace0001: MET, ChIJplace0002: GUGG, ChIJplace0003: FRICK, ChIJplace0004: WTC, ChIJhotel000001: HOTEL };
const result = (n: number, name: string, extra: Partial<DiscoverResult> = {}): DiscoverResult => ({
  placeId: `ChIJsummit0000${n}`,
  name,
  address: '45 E 42nd St, New York, NY',
  location: SUMMIT,
  primaryType: 'tourist_attraction',
  typeLabel: 'Observation deck',
  googleMapsUri: null,
  businessStatus: 'OPERATIONAL',
  timeZone: 'America/New_York',
  savedPlaceId: null,
  inTrip: false,
  category: 'sights',
  ...extra,
});

async function ask(message: string, results: DiscoverResult[]) {
  const detail = tripDetail(places());
  await seedSavedCopy([detail], Date.parse('2026-11-23T07:00:00Z'), { coords });
  serverHas([detail]);
  mockApi.discoverSearch.mockImplementation(() => Promise.resolve({ results }));
  mockApi.saveGooglePlaces.mockImplementation(() => {
    // After saving, the trip has the place (not planned yet).
    const saved = tripDetail([...places(), tripPlace(9, { googlePlaceId: 'ChIJsummit00001', day: null })]);
    mockApi.getTripV2.mockImplementation(() => Promise.resolve(structuredClone(saved)));
    return Promise.resolve({ places: [] });
  });
  mockApi.tripAssistant.mockImplementation(() => Promise.resolve({ action: 'unavailable' }));
  await renderApp(<TripScreen />);
  await fireEvent.press(await screen.findByText(t('tripPlan.open')));
  await fireEvent.changeText(await screen.findByLabelText(t('assistant.label')), message);
  await fireEvent.press(screen.getByText(t('assistant.send')));
}

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T08:00:00Z') });
  await resetAll();
  setRouteParams({ id: uuid(1) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Find a place and plan it in (D1)', () => {
  it('"I also want to visit SUMMIT One Vanderbilt…": search on tap, pick, best day with reasons, and only Apply saves and plans it', async () => {
    await ask('I also want to visit SUMMIT One Vanderbilt. Where is it, and which day would be best to add it?', [
      result(1, 'SUMMIT One Vanderbilt'),
      result(2, 'SUMMIT One Vanderbilt Gift Shop', { typeLabel: 'Gift shop', category: 'shopping' }),
    ]);
    expect(await screen.findByText(t('assistant.readOnPhone'))).toBeTruthy();
    expect(mockApi.tripAssistant).not.toHaveBeenCalled();
    // No Google search until the user taps.
    expect(mockApi.discoverSearch).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(t('placeFind.search')));
    await waitFor(() => expect(mockApi.discoverSearch).toHaveBeenCalledTimes(1));
    const body = mockApi.discoverSearch.mock.calls[0]?.[0] as unknown as DiscoverSearchRequest;
    expect(body.plan.textQuery).toBe('SUMMIT One Vanderbilt');
    expect(body.area).toEqual({ kind: 'near', text: 'New York' });

    // Two matches: "which one?"
    expect(await screen.findByText(t('placeFind.whichOne'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('SUMMIT One Vanderbilt'));

    // Where it is, and the days compared.
    expect(await screen.findByText(t('placeFind.whichDay'))).toBeTruthy();
    expect(screen.getAllByText(/from where you stay$/).length).toBeGreaterThan(0);
    // Each day as short tags and a load bar (no "x of y" sentence).
    expect(screen.getAllByText(t('placeFind.bestFit'))).toHaveLength(1);
    expect(screen.getAllByText(t('placeFind.dayFull')).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/ of .+ planned$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Suggested time for SUMMIT One Vanderbilt: /)).toBeTruthy();
    // One new place, nothing else: the button says exactly that.
    expect(screen.getByText(/^Add SUMMIT One Vanderbilt to /)).toBeTruthy();
    expect(mockApi.saveGooglePlaces).not.toHaveBeenCalled();
    expect(await storedOps()).toEqual([]);

    await fireEvent.press(screen.getByTestId('plan-apply'));
    await waitFor(async () => {
      const ops = await storedOps();
      const add = ops.find((op) => op.kind === 'stopAdd');
      expect(add && add.kind === 'stopAdd' && add.tripPlaceId).toBe(memberId(uuid(109)));
      expect(add && add.kind === 'stopAdd' && add.startTime).not.toBeNull();
      expect(add && add.kind === 'stopAdd' && add.day).not.toBe('2026-11-24');
    });
    expect(mockApi.saveGooglePlaces.mock.calls[0]?.[0]).toEqual({ items: [{ googlePlaceId: 'ChIJsummit00001', category: 'sights' }], tripId: uuid(1) });
    const ops = await storedOps();
    // Nothing else moved, retimed or removed.
    expect(ops.some((op) => op.kind === 'stop' || op.kind === 'stopRemove')).toBe(false);
  });

  it('"Where is the Frick?" only shows where it is: nothing to apply, nothing saved', async () => {
    await ask('Where is the Frick Collection?', [result(1, 'The Frick Collection', { location: FRICK })]);
    await fireEvent.press(await screen.findByText(t('placeFind.search')));
    expect(await screen.findByText(t('placeFind.planIt'))).toBeTruthy();
    expect(screen.getAllByText(/from Frick \(/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('plan-apply')).toBeNull();
    expect(screen.getByText(t('common.close'))).toBeTruthy();
    expect(mockApi.saveGooglePlaces).not.toHaveBeenCalled();
    expect(await storedOps()).toEqual([]);
  });
});
