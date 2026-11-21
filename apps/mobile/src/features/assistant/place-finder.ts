import { SEARCH_RADIUS_MAX_M, type AssistantInstruction, type DiscoverSearchRequest, type LatLng, type PlaceCategory, type SearchArea } from '@travel-companion/shared';
import { distanceMeters } from '../companion/geo';
import type { TravelMode } from '../companion/travel';
import { leg } from '../planning/day-planner';

/**
 * D1 trip assistant · finding a place the user named (or a kind of place).
 * Pure: builds the Google search (sent only when the user taps Search) and
 * describes where a found place is relative to the trip, with estimates only.
 */

export type FindPlace = Extract<AssistantInstruction, { kind: 'findPlace' }>;

/** Searching around one point (the user, or a closed place): a walk away. */
export const AROUND_RADIUS_M = 1200;

/** A Google search for a kind of place (an alternative to a closed one). */
export const KIND_QUERY: Record<PlaceCategory, string> = {
    food: 'restaurant',
    coffee: 'cafe',
    sights: 'museum or attraction',
    shopping: 'shops',
    nightlife: 'bar',
    outdoors: 'park',
    stay: 'hotel',
    other: 'things to do',
};

/** "Find an alternative nearby" for a closed place: the same kind, around it, the same day. */
export function alternativeFor(category: PlaceCategory, day: string): FindPlace {
    return { kind: 'findPlace', query: KIND_QUERY[category], category, area: null, nearPlanned: false, nearHere: false, day, intent: 'add' };
}

/** A circle around the places already planned (for "near what we're visiting"). */
export function circleAround(points: readonly LatLng[]): SearchArea | null {
    if (points.length === 0) return null;
    const center = {
        latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
        longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
    };
    const farthest = Math.max(...points.map((point) => distanceMeters(center, point)));
    return { kind: 'circle', center, radiusMeters: Math.round(Math.min(SEARCH_RADIUS_MAX_M, Math.max(800, Math.min(5000, farthest + 500)))) };
}

/**
 * The Google Text Search for a findPlace request: the user's words (or the
 * kind), around the area they named in the trip's destination, around the
 * planned visits, or in the destination.
 */
export function placeSearchRequest(
    find: FindPlace,
    query: string,
    context: { tripId: string; destination: string | null; planned: readonly LatLng[]; around?: LatLng | null },
): DiscoverSearchRequest {
    const plan = { textQuery: query.trim().slice(0, 200), includedType: null, openNow: false, category: find.category ?? 'other' };
    // Live: around where the user is, or around a closed place.
    if (context.around && !find.area) return { plan, tripId: context.tripId, area: { kind: 'circle', center: context.around, radiusMeters: AROUND_RADIUS_M } };
    const around = (find.nearPlanned || find.nearHere) && !find.area ? circleAround(context.planned) : null;
    if (around) return { plan, tripId: context.tripId, area: around };
    const destination = context.destination?.trim() || null;
    const near = find.area ? (destination && !find.area.toLowerCase().includes(destination.toLowerCase()) ? `${find.area}, ${destination}` : find.area) : destination;
    return near ? { plan, tripId: context.tripId, area: { kind: 'near', text: near.slice(0, 200) } } : { plan, tripId: context.tripId };
}

export interface NearbyVisit {
    id: string;
    day: string;
    minutes: number;
    mode: TravelMode | null;
}

/** Where a place is for this trip: the closest planned visits and the stay (estimates, ≈). */
export function placeContext(
    location: LatLng | null,
    visits: readonly { id: string; day: string; location: LatLng | null }[],
    stay: LatLng | null,
): { nearest: NearbyVisit[]; stay: { minutes: number; mode: TravelMode | null } | null } {
    if (!location) return { nearest: [], stay: null };
    const nearest = visits
        .flatMap((visit) => {
            if (!visit.location) return [];
            const trip = leg(location, visit.location);
            return trip.known ? [{ id: visit.id, day: visit.day, minutes: trip.minutes, mode: trip.mode }] : [];
        })
        .sort((a, b) => a.minutes - b.minutes)
        .slice(0, 2);
    const fromStay = stay ? leg(stay, location) : null;
    return { nearest, stay: fromStay?.known ? { minutes: fromStay.minutes, mode: fromStay.mode } : null };
}
