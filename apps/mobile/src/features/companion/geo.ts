import type { DistanceUnit, LatLng } from '@travel-companion/shared';

/** Straight-line distance in meters (haversine). Good for "nearby" and sorting; not a walking route. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** "350 m" / "1.2 km", or "900 ft" / "0.8 mi", in the app language and the user's unit. */
export function formatDistance(meters: number, locale: string, unit: DistanceUnit = 'km'): string {
  if (unit === 'mi') {
    const miles = meters / METERS_PER_MILE;
    if (miles < 0.2) {
      const feet = Math.max(50, Math.round(meters / METERS_PER_FOOT / 50) * 50);
      return new Intl.NumberFormat(locale, { style: 'unit', unit: 'foot', maximumFractionDigits: 0 }).format(feet);
    }
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'mile', maximumFractionDigits: 1 }).format(miles);
  }
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10);
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', maximumFractionDigits: 0 }).format(rounded);
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
}

export interface Bounds {
  low: LatLng;
  high: LatLng;
}

/** The map area as south-west / north-east corners, from a map region (center + deltas). */
export function regionToBounds(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): Bounds {
  const clampLat = (value: number) => Math.max(-90, Math.min(90, value));
  const clampLng = (value: number) => Math.max(-180, Math.min(180, value));
  return {
    low: {
      latitude: clampLat(region.latitude - region.latitudeDelta / 2),
      longitude: clampLng(region.longitude - region.longitudeDelta / 2),
    },
    high: {
      latitude: clampLat(region.latitude + region.latitudeDelta / 2),
      longitude: clampLng(region.longitude + region.longitudeDelta / 2),
    },
  };
}
