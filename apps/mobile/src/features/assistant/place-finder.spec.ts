import type { LatLng } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { circleAround, placeContext, placeSearchRequest, type FindPlace } from './place-finder';

const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 };
const MOMA: LatLng = { latitude: 40.7614, longitude: -73.9776 };
const SUMMIT: LatLng = { latitude: 40.7531, longitude: -73.9787 };
const HOTEL: LatLng = { latitude: 40.7577, longitude: -73.9857 };
const find = (extra: Partial<FindPlace> = {}): FindPlace => ({
    kind: 'findPlace',
    query: 'SUMMIT One Vanderbilt',
    category: null,
    area: null,
    nearPlanned: false,
    nearHere: false,
    day: null,
    intent: 'add',
    ...extra,
});
const TRIP = '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e';

describe('place finder', () => {
    it('searches the words in the trip destination, an area there, or around the planned visits', () => {
        expect(placeSearchRequest(find(), 'SUMMIT One Vanderbilt', { tripId: TRIP, destination: 'New York', planned: [] })).toEqual({
            plan: { textQuery: 'SUMMIT One Vanderbilt', includedType: null, openNow: false, category: 'other' },
            tripId: TRIP,
            area: { kind: 'near', text: 'New York' },
        });
        const soho = placeSearchRequest(find({ query: 'shopping', category: 'shopping', area: 'SoHo' }), 'shopping', { tripId: TRIP, destination: 'New York', planned: [] });
        expect(soho.area).toEqual({ kind: 'near', text: 'SoHo, New York' });
        expect(soho.plan.category).toBe('shopping');
        const near = placeSearchRequest(find({ nearPlanned: true }), 'tourist attractions', { tripId: TRIP, destination: 'New York', planned: [MET, MOMA] });
        expect(near.area?.kind).toBe('circle');
        expect(placeSearchRequest(find(), 'x', { tripId: TRIP, destination: null, planned: [] }).area).toBeUndefined();
    });

    it('a circle that covers the planned visits, within limits', () => {
        const area = circleAround([MET, MOMA]);
        expect(area?.kind === 'circle' && area.radiusMeters).toBeGreaterThanOrEqual(800);
        expect(area?.kind === 'circle' && area.radiusMeters).toBeLessThanOrEqual(5000);
        expect(circleAround([])).toBeNull();
    });

    it('where it is for this trip: the nearest planned visits and the stay (estimates)', () => {
        const context = placeContext(SUMMIT, [
            { id: 'met', day: '2026-11-24', location: MET },
            { id: 'moma', day: '2026-11-25', location: MOMA },
            { id: 'pin', day: '2026-11-25', location: null },
        ], HOTEL);
        expect(context.nearest.map((item) => item.id)).toEqual(['moma', 'met']);
        expect(context.nearest[0]?.minutes).toBeLessThan(context.nearest[1]?.minutes ?? 0);
        expect(context.stay?.mode).toBe('walk');
        expect(placeContext(null, [], HOTEL)).toEqual({ nearest: [], stay: null });
    });
});
