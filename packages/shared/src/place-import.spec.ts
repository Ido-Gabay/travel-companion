import { describe, expect, it } from 'vitest';
import { extractPlacesRequestSchema, extractPlacesResponseSchema, MAX_IMPORT_TEXT } from './index.js';

describe('place import contract', () => {
    it('accepts the user text and locale only, within the limit', () => {
        expect(extractPlacesRequestSchema.parse({ text: '  Katz, Russ & Daughters ', locale: 'en' }).text).toBe('Katz, Russ & Daughters');
        expect(extractPlacesRequestSchema.safeParse({ text: 'x'.repeat(MAX_IMPORT_TEXT + 1), locale: 'en' }).success).toBe(false);
        expect(extractPlacesRequestSchema.safeParse({ text: 'Katz', locale: 'en', tripId: 'x' }).success).toBe(false);
    });

    it('returns names with an optional note and area, or unavailable', () => {
        const places = extractPlacesResponseSchema.parse({ action: 'places', places: [{ name: 'Katz', note: 'pastrami', area: null }] });
        expect(places).toEqual({ action: 'places', places: [{ name: 'Katz', note: 'pastrami', area: null }] });
        expect(extractPlacesResponseSchema.parse({ action: 'unavailable' })).toEqual({ action: 'unavailable' });
        // No room for invented facts: unknown fields are rejected.
        expect(
            extractPlacesResponseSchema.safeParse({ action: 'places', places: [{ name: 'Katz', note: null, area: null, address: '205 E Houston St' }] })
                .success,
        ).toBe(false);
    });
});
