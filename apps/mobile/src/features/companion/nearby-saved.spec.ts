import type { LatLng } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { nearbyKey, nearbySaved, type SavedCandidate } from './nearby-saved';

// SoHo, Manhattan (approximate).
const HERE: LatLng = { latitude: 40.7233, longitude: -74.003 };
const PRINCE: LatLng = { latitude: 40.7244, longitude: -73.9985 }; // ~5 min walk
const SPRING: LatLng = { latitude: 40.7253, longitude: -74.0053 }; // ~4 min walk
const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 }; // far
const place = (id: string, location: LatLng | null, extra: Partial<SavedCandidate> = {}): SavedCandidate => ({
    id,
    name: id,
    category: 'coffee',
    durationMinutes: 45,
    location,
    ...extra,
});
const NOW = 14 * 60;
const free = (minutes: number, untilStopId: string | null = 'next') => ({ minutes, from: NOW, until: NOW + minutes, untilStopId });

describe('saved places nearby', () => {
    it('only a short walk away, closest first, with why it fits', () => {
        const list = nearbySaved({
            here: HERE,
            candidates: [place('prince', PRINCE), place('spring', SPRING), place('met', MET), place('pin', null)],
            nowMinutes: NOW,
            free: free(120),
            planDone: false,
            dismissed: new Set(),
        });
        expect(list.map((item) => item.candidate.id)).toEqual(['spring', 'prince']);
        expect(list[0]).toMatchObject({ reason: 'fitsFree', until: NOW + 120, untilStopId: 'next', hours: 'unknown' });
        expect(list[0]?.travel.mode).toBe('walk');
    });

    it('not enough time before the next visit: still shown, after the ones that fit', () => {
        const list = nearbySaved({
            here: HERE,
            candidates: [place('long', SPRING, { durationMinutes: 180 }), place('short', PRINCE, { durationMinutes: 30 })],
            nowMinutes: NOW,
            free: free(60),
            planDone: false,
            dismissed: new Set(),
        });
        expect(list.map((item) => [item.candidate.id, item.reason])).toEqual([
            ['short', 'fitsFree'],
            ['long', 'tight'],
        ]);
    });

    it('plan done for today: time for it; dismissed ones and closed ones are left out', () => {
        const list = nearbySaved({
            here: HERE,
            candidates: [
                place('done', SPRING),
                place('closed', PRINCE, { hours: [] }),
                place('open', PRINCE, { id: 'open', hours: [{ open: 9 * 60, close: 20 * 60 }] }),
                place('late', PRINCE, { id: 'late', hours: [{ open: 18 * 60, close: 23 * 60 }] }),
            ],
            nowMinutes: NOW,
            free: null,
            planDone: true,
            dismissed: new Set([nearbyKey('done')]),
        });
        expect(list.map((item) => [item.candidate.id, item.reason, item.hours])).toEqual([['open', 'dayDone', 'open']]);
    });

    it('nothing without a location reading', () => {
        expect(nearbySaved({ here: null, candidates: [place('a', SPRING)], nowMinutes: NOW, free: null, planDone: true, dismissed: new Set() })).toEqual([]);
    });
});
