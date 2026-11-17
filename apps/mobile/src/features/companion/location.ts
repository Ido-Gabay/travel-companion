import type { LatLng } from '@travel-companion/shared';
import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

/**
 * Live Companion: the user's location.
 *
 * Phase 1 (now) is foreground only, one reading at a time, when the user
 * asks for something location-based (Discover "Near me"; later the Today
 * screen). No background tracking and no geofencing; those come in a later
 * phase behind their own permission. Locations stay on the device except
 * when sent with one request (e.g. a search) and are never stored by the API.
 */

export type LocationResult =
  | { ok: true; coords: LatLng }
  | { ok: false; reason: 'denied' | 'unavailable' };

/** A reading this recent is good enough (saves battery and time). */
const MAX_AGE_MS = 2 * 60 * 1000;
const REQUIRED_ACCURACY_M = 200;

/** Asks for "while using the app" permission if needed, then returns one location reading. */
export async function getCurrentLocation(): Promise<LocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) return { ok: false, reason: 'denied' };

    const recent = await Location.getLastKnownPositionAsync({
      maxAge: MAX_AGE_MS,
      requiredAccuracy: REQUIRED_ACCURACY_M,
    });
    const position =
      recent ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { ok: true, coords: { latitude: position.coords.latitude, longitude: position.coords.longitude } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; coords: LatLng; at: number }
  | { status: 'denied' }
  | { status: 'unavailable' };

/** Location for a screen: call `locate()` when the user needs it; reuses a fresh reading. */
export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  const locate = useCallback(async (): Promise<LocationResult> => {
    if (state.status === 'ready' && Date.now() - state.at < MAX_AGE_MS) return { ok: true, coords: state.coords };
    setState({ status: 'locating' });
    const result = await getCurrentLocation();
    setState(result.ok ? { status: 'ready', coords: result.coords, at: Date.now() } : { status: result.reason });
    return result;
  }, [state]);

  return { state, locate };
}
