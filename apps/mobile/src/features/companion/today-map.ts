import type { LatLng } from '@travel-companion/shared';
import type { StopStatus, TodayResult } from './today-engine';
import { isUsableLatLng } from './travel';

/**
 * Map-first Today: what the map draws, derived from the engine's result.
 * Pure and unit-tested. Nothing here calls Google. The next leg follows the
 * real route when one was fetched (M16); every other line is straight (as the
 * crow flies), and only usable coordinates are drawn.
 */

/** A one-shot location reading older than this is shown as stale. */
export const LOCATION_STALE_MS = 2 * 60 * 1000;

export interface MapPin {
  id: string;
  /** Position in the day (1-based). */
  number: number;
  name: string;
  kind: StopStatus;
  location: LatLng;
}

export interface TodayMapModel {
  pins: MapPin[];
  /** From where the user sets off to the next stop: the real route's path, or a straight line. Only when travel is known. */
  nextLeg: LatLng[] | null;
  /** True when nextLeg is a real route (not a straight line). */
  nextLegIsRoute: boolean;
  /** The next stop and the open stops after it, in order (faint, approximate). */
  laterPath: LatLng[];
  /** Stops of the day with no usable map location (shown in the list only). */
  unmapped: number;
  /** Everything worth framing when fitting the day. */
  frame: LatLng[];
}

/** Where the engine measured the next leg from, as a point. */
export function originPoint(result: TodayResult, here: LatLng | null, hotel: LatLng | null): LatLng | null {
  switch (result.next?.origin ?? null) {
    case 'here':
      return here;
    case 'current':
      return result.current?.stop.location ?? null;
    case 'previous':
      return [...result.timeline].reverse().find((item) => item.status === 'done' && item.stop.location)?.stop.location ?? null;
    case 'hotel':
      return hotel;
    default:
      return null;
  }
}

export function buildTodayMap(result: TodayResult, here: LatLng | null, hotel: LatLng | null): TodayMapModel {
  const pins: MapPin[] = [];
  let unmapped = 0;
  result.timeline.forEach((item, index) => {
    if (isUsableLatLng(item.stop.location)) {
      pins.push({ id: item.stop.id, number: index + 1, name: item.stop.name, kind: item.status, location: item.stop.location });
    } else {
      unmapped += 1;
    }
  });

  const from = originPoint(result, here, hotel);
  const nextLocation = result.next?.stop.location ?? null;
  const path = result.next?.travel?.path;
  const nextLegIsRoute = Boolean(path && path.length > 1);
  const nextLeg: LatLng[] | null = nextLegIsRoute
    ? (path as LatLng[])
    : result.next?.travel && isUsableLatLng(from) && isUsableLatLng(nextLocation)
      ? [from, nextLocation]
      : null;

  const laterPath = pins.filter((pin) => pin.kind === 'next' || pin.kind === 'later').map((pin) => pin.location);

  const frame = [...pins.map((pin) => pin.location)];
  if (isUsableLatLng(hotel) && pins.length === 0) frame.push(hotel);
  if (nextLeg?.[0]) frame.push(nextLeg[0]);

  return { pins, nextLeg, nextLegIsRoute, laterPath: laterPath.length > 1 ? laterPath : [], unmapped, frame };
}

/** How old a location reading is, for the "last known location" state. */
export function locationAge(at: number, nowMs: number): { minutes: number; stale: boolean } {
  const age = Math.max(0, nowMs - at);
  return { minutes: Math.floor(age / 60_000), stale: age > LOCATION_STALE_MS };
}
