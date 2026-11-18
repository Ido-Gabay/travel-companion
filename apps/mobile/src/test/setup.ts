/**
 * Shared setup for screen tests (jest-expo). Everything that would touch the
 * network, the device or native modules is replaced by a fake:
 *   API (`@/lib/api`), auth session, router, storage, notifications, maps, location.
 * Tests drive the fakes through `src/test/render.tsx`.
 */
import { jest } from '@jest/globals';
import '@/i18n/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => (globalThis as { __routeParams?: Record<string, string> }).__routeParams ?? {},
}));

jest.mock('@/lib/supabase', () => ({ supabase: null }));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: '00000000-0000-4000-8000-000000000901' } }, initializing: false }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@/lib/api', () => {
  const methods = [
    'getMe', 'updateMe', 'updatePreferences', 'listTrips', 'createTrip', 'getTrip', 'updateTrip', 'deleteTrip',
    'addTripPlace', 'removeTripPlace', 'scheduleTripPlace', 'reorderTripDay', 'listPlaces', 'getPlace',
    'createPlace', 'updatePlace', 'deletePlace', 'saveGooglePlaces', 'getGooglePlace', 'getGooglePlacePreview',
    'getGooglePhoto', 'getUsage', 'interpret', 'discoverSearch', 'getJournal', 'updateJournalDay', 'computeRoutes',
  ];
  const api: Record<string, unknown> = {};
  for (const name of methods) api[name] = jest.fn(() => Promise.reject(new Error(`api.${name} not mocked`)));
  return { api, wakeApi: jest.fn(), pingApi: jest.fn(() => Promise.resolve(false)) };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', granted: true, canAskAgain: true })),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
}));

jest.mock('react-native-maps', () => {
  const { Pressable, View } = require('react-native');
  const Mock = ({ children }: { children?: unknown }) => children ?? null;
  // A marker is a pressable box around its custom view, so tests can tap pins.
  const Marker = ({ children, onPress, identifier }: { children?: unknown; onPress?: (e: unknown) => void; identifier?: string }) =>
    require('react').createElement(
      Pressable,
      { testID: identifier ? `marker-${identifier}` : undefined, onPress: () => onPress?.({ stopPropagation: () => undefined }) },
      children,
    );
  return { __esModule: true, default: View, Marker, Polyline: Mock, Callout: Mock, PROVIDER_GOOGLE: 'google' };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined', granted: false, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied', granted: false, canAskAgain: false })),
  getCurrentPositionAsync: jest.fn(() => Promise.reject(new Error('no location in tests'))),
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  Accuracy: { Balanced: 3 },
}));
