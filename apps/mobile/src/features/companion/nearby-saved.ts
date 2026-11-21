import { DEFAULT_VISIT_MINUTES, type LatLng, type PlaceCategory } from '@travel-companion/shared';
import { firstFit, type OpenWindow } from '../planning/opening-hours';
import { DAY_END_MIN, type FreeTime } from './today-engine';
import { reliableTravel, type TravelEstimate } from './travel';

/**
 * Live Today · saved places nearby: places saved to this trip but not on any
 * day, a short walk from where the user is now (one foreground reading). Pure;
 * travel is an estimate; opening hours only when already known. It suggests,
 * it never adds anything.
 */

/** Within this walk (estimate) a saved place counts as "nearby". */
export const NEARBY_SAVED_WALK_MIN = 15;
export const MAX_NEARBY_SAVED = 3;
/** A place opening within this long of arrival still counts as open. */
const OPENS_SOON_MIN = 20;

export interface SavedCandidate {
    /** The trip item id (the saved place's trip membership). */
    id: string;
    name: string;
    category: PlaceCategory;
    durationMinutes: number | null;
    location: LatLng | null;
    /** Today's opening windows: undefined = not known on the phone, null = unknown, [] = closed. */
    hours?: OpenWindow[] | null;
}

export type NearbyReason =
    /** Fits the free time before the next visit. */
    | 'fitsFree'
    /** Today's plan is done (or empty): time for it. */
    | 'dayDone'
    /** Close, but there isn't enough time before the next visit. */
    | 'tight';

export interface NearbySaved {
    candidate: SavedCandidate;
    travel: TravelEstimate;
    visitMinutes: number;
    reason: NearbyReason;
    /** The free time ends then (fitsFree). */
    until: number | null;
    untilStopId: string | null;
    /** From opening hours already on the phone (Google), else unknown. */
    hours: 'open' | 'unknown';
}

export const nearbyKey = (id: string) => `nearby:${id}`;

export function nearbySaved({
    here,
    candidates,
    nowMinutes,
    free,
    planDone,
    dismissed,
    maxWalk = NEARBY_SAVED_WALK_MIN,
}: {
    here: LatLng | null;
    candidates: readonly SavedCandidate[];
    nowMinutes: number;
    /** Today's free time (computeToday). */
    free: FreeTime | null;
    /** Nothing left on today's plan. */
    planDone: boolean;
    dismissed: ReadonlySet<string>;
    maxWalk?: number;
}): NearbySaved[] {
    if (!here) return [];
    const found: NearbySaved[] = [];
    for (const candidate of candidates) {
        if (!candidate.location || dismissed.has(nearbyKey(candidate.id))) continue;
        const travel = reliableTravel(here, candidate.location);
        if (!travel || travel.mode !== 'walk' || travel.minutes > maxWalk) continue;
        const visitMinutes = candidate.durationMinutes ?? DEFAULT_VISIT_MINUTES[candidate.category];
        const arrive = nowMinutes + travel.minutes;
        let hours: NearbySaved['hours'] = 'unknown';
        if (candidate.hours) {
            // Closed for the rest of today (or not open soon): not a good idea now.
            const opens = firstFit(candidate.hours, arrive, visitMinutes);
            if (opens === null || opens > arrive + OPENS_SOON_MIN) continue;
            hours = 'open';
        }
        let reason: NearbyReason;
        if (free && free.untilStopId) {
            // There and back toward the next stop (estimated as the same walk).
            reason = travel.minutes * 2 + visitMinutes <= free.minutes ? 'fitsFree' : 'tight';
        } else if (planDone || (free && !free.untilStopId)) {
            reason = arrive + visitMinutes <= DAY_END_MIN ? 'dayDone' : 'tight';
        } else {
            reason = 'tight';
        }
        found.push({
            candidate,
            travel,
            visitMinutes,
            reason,
            until: reason === 'fitsFree' ? (free?.until ?? null) : null,
            untilStopId: reason === 'fitsFree' ? (free?.untilStopId ?? null) : null,
            hours,
        });
    }
    const rank = (item: NearbySaved) => (item.reason === 'tight' ? 1 : 0);
    return found.sort((a, b) => rank(a) - rank(b) || a.travel.minutes - b.travel.minutes || a.candidate.id.localeCompare(b.candidate.id)).slice(0, MAX_NEARBY_SAVED);
}
