import { describe, expect, it } from 'vitest';
import { destinationLabel, findDestination, matchDestinations } from './destinations';

describe('destination suggestions', () => {
    it('matches cities by their start, in English or Hebrew, then by a word, then the country', () => {
        expect(matchDestinations('new')[0]?.id).toBe('nyc');
        expect(matchDestinations('ניו')[0]?.id).toBe('nyc');
        expect(matchDestinations('york').map((item) => item.id)).toContain('nyc');
        expect(matchDestinations('ital').map((item) => item.id)).toEqual(expect.arrayContaining(['rome', 'milan']));
        expect(matchDestinations('krakow')[0]?.id).toBe('krakow');
        expect(matchDestinations('n')).toEqual([]);
        expect(matchDestinations('zzz')).toEqual([]);
        expect(matchDestinations('a').length).toBe(0);
        expect(matchDestinations('la', 3).length).toBeLessThanOrEqual(3);
    });

    it('writes and recognizes the label in the app language', () => {
        const nyc = matchDestinations('new york')[0];
        expect(nyc && destinationLabel(nyc, 'en')).toBe('New York, USA');
        expect(nyc && destinationLabel(nyc, 'he')).toBe('ניו יורק, ארה"ב');
        expect(findDestination('New York, USA')?.id).toBe('nyc');
        expect(findDestination('ניו יורק')?.id).toBe('nyc');
        expect(findDestination('Somewhere new')).toBeNull();
    });
});
