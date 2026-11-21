import { describe, expect, it } from 'vitest';
import { groupVisitMarkers, locationKey, markerLabel, type MarkerVisit } from './map-markers';

const A = { latitude: 40.758, longitude: -73.9855 };
const B = { latitude: 40.7614, longitude: -73.9776 };
const C = { latitude: 40.7396, longitude: -74.0089 };

const visit = (id: string, placeKey: string | null, location = placeKey === 'a' ? A : placeKey === 'b' ? B : C): MarkerVisit => ({
    id,
    placeKey,
    location,
});

const summary = (visits: MarkerVisit[]) => groupVisitMarkers(visits).markers.map((marker) => [marker.id, marker.numbers]);

describe('groupVisitMarkers', () => {
    it('numbers markers by itinerary position, the same numbers the list shows', () => {
        const day = [visit('s1', 'a'), visit('s2', 'b'), visit('s3', 'c')];
        expect(summary(day)).toEqual([
            ['place:a', [1]],
            ['place:b', [2]],
            ['place:c', [3]],
        ]);
    });

    it('is stable: the same day always gives the same markers, ids and numbers', () => {
        const day = [visit('s1', 'a'), visit('s2', 'b'), visit('s3', 'a'), visit('s4', 'c')];
        const first = groupVisitMarkers(day);
        for (let i = 0; i < 5; i += 1) expect(groupVisitMarkers([...day])).toEqual(first);
    });

    it('two visits to the same place share one marker with both numbers (none is dropped)', () => {
        const day = [visit('s1', 'a'), visit('s2', 'b'), visit('s3', 'a')];
        const { markers } = groupVisitMarkers(day);
        expect(markers.map((marker) => [marker.id, marker.numbers, marker.visits.map((v) => v.id)])).toEqual([
            ['place:a', [1, 3], ['s1', 's3']],
            ['place:b', [2], ['s2']],
        ]);
        expect(markerLabel(markers[0]!.numbers)).toBe('1·3');
    });

    it('the reported case: a place added many times stays one marker with every number', () => {
        const keys = ['a', 'b', 'c', 'b', 'b', 'a', 'a', 'b', 'c', 'b', 'c', 'd', 'a', 'b', 'b', 'c', 'd'];
        const day = keys.map((key, index) => visit(`s${index + 1}`, key, key === 'd' ? { latitude: 40.75, longitude: -73.99 } : undefined));
        const { markers } = groupVisitMarkers(day);
        expect(markers.map((marker) => marker.id)).toEqual(['place:a', 'place:b', 'place:c', 'place:d']);
        expect(markers.flatMap((marker) => marker.numbers).sort((x, y) => x - y)).toEqual(keys.map((_, index) => index + 1));
        expect(markerLabel(markers[1]!.numbers)).toBe('2·4+5');
    });

    it('adding a visit only changes the marker it lands on; ids of the others stay', () => {
        const before = [visit('s1', 'a'), visit('s2', 'b')];
        const after = [...before, visit('s3', 'c')];
        expect(summary(after).slice(0, 2)).toEqual(summary(before));
        expect(summary(after)[2]).toEqual(['place:c', [3]]);
    });

    it('removing and reordering renumber by the new order, with the same marker ids', () => {
        const day = [visit('s1', 'a'), visit('s2', 'b'), visit('s3', 'c')];
        expect(summary(day.filter((item) => item.id !== 's1'))).toEqual([
            ['place:b', [1]],
            ['place:c', [2]],
        ]);
        expect(summary([day[2]!, day[0]!, day[1]!])).toEqual([
            ['place:c', [1]],
            ['place:a', [2]],
            ['place:b', [3]],
        ]);
    });

    it('a repeated or missing visit id is never drawn twice, and numbering still matches the list', () => {
        const day = [visit('s1', 'a'), visit('s1', 'a'), visit('', 'b'), visit('s4', 'c')];
        expect(summary(day)).toEqual([
            ['place:a', [1]],
            ['place:c', [4]],
        ]);
    });

    it('a visit without a place key gets its own marker, keyed by the visit', () => {
        expect(summary([visit('s1', null), visit('s2', null)])).toEqual([
            ['visit:s1', [1]],
            ['visit:s2', [2]],
        ]);
    });

    it('visits without a usable location are counted, not drawn', () => {
        const result = groupVisitMarkers([visit('s1', 'a', null as never), visit('s2', 'b'), visit('s3', 'x', { latitude: 0, longitude: 0 })]);
        expect(result.markers.map((marker) => marker.id)).toEqual(['place:b']);
        expect(result.unmapped).toBe(2);
    });
});

describe('locationKey', () => {
    it('is the same for the same spot and null for unusable points', () => {
        expect(locationKey(A)).toBe(locationKey({ ...A }));
        expect(locationKey(A)).not.toBe(locationKey(B));
        expect(locationKey(null)).toBeNull();
    });
});
