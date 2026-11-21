import type { LatLng } from '@travel-companion/shared';
import { isUsableLatLng } from '../companion/travel';

/**
 * One map marker per place, carrying every visit's number in the day (the list's numbers), so
 * repeat visits never stack pins whose drawing order (and so the visible number) is undefined.
 */

export interface MarkerVisit {
    /** The visit's id (stable; never an index). */
    id: string;
    /** The place's identity (e.g. Google place id); null = this visit alone. */
    placeKey: string | null;
    location: LatLng | null;
}

export interface VisitMarker<T extends MarkerVisit> {
    /** Stable across renders: derived from the place, or the visit when it has no place key. */
    id: string;
    location: LatLng;
    /** The visits at this marker, in day order. */
    visits: T[];
    /** Their numbers in the day (ascending). */
    numbers: number[];
}

export function groupVisitMarkers<T extends MarkerVisit>(visits: readonly T[]): { markers: VisitMarker<T>[]; unmapped: number } {
    const byId = new Map<string, VisitMarker<T>>();
    const seen = new Set<string>();
    let unmapped = 0;
    visits.forEach((visit, index) => {
        // A missing or repeated visit id can't be told apart from another visit: never draw it twice.
        if (!visit.id || seen.has(visit.id)) return;
        seen.add(visit.id);
        if (!isUsableLatLng(visit.location)) {
            unmapped += 1;
            return;
        }
        const id = visit.placeKey ? `place:${visit.placeKey}` : `visit:${visit.id}`;
        const marker = byId.get(id);
        if (marker) {
            marker.visits.push(visit);
            marker.numbers.push(index + 1);
        } else {
            byId.set(id, { id, location: visit.location, visits: [visit], numbers: [index + 1] });
        }
    });
    // Map preserves insertion order: markers come in the order of their first visit.
    return { markers: [...byId.values()], unmapped };
}

/** "3", "3·8", "2·4+5" (the first two numbers, then how many more). */
export function markerLabel(numbers: readonly number[]): string {
    if (numbers.length <= 2) return numbers.join('·');
    return `${numbers[0]}·${numbers[1]}+${numbers.length - 2}`;
}

/** Same spot on the map (to ~1 cm): used when only coordinates are known. */
export function locationKey(location: LatLng | null): string | null {
    return isUsableLatLng(location) ? `${location.latitude.toFixed(7)},${location.longitude.toFixed(7)}` : null;
}
