import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. The Google Maps SDK key for iOS comes from
 * apps/mobile/.env (GOOGLE_MAPS_IOS_API_KEY). It ends up inside the app
 * binary (that's how the Maps SDK works), so it must be restricted in Google
 * Cloud to the iOS bundle ID and to "Maps SDK for iOS" only. It is a
 * different key from the server's Places key, which never ships in the app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY?.trim() || null;

  return {
    ...config,
    name: config.name ?? 'Travel Companion',
    slug: config.slug ?? 'travel-companion',
    plugins: [
      ...(config.plugins ?? []),
      // Only link Google Maps when a key exists; otherwise the map shows a notice.
      ...(iosMapsKey ? [['react-native-maps', { iosGoogleMapsApiKey: iosMapsKey }] as [string, unknown]] : []),
    ],
    extra: {
      ...config.extra,
      googleMapsEnabled: iosMapsKey !== null,
    },
  };
};
