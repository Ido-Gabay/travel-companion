import { describe, expect, it, vi } from 'vitest';
import { extractPlacesResponseSchema } from '@travel-companion/shared';
import type { AppConfig } from '../config/app-config.js';
import type { UsageGuardService } from '../usage/usage-guard.service.js';
import { rateLimitClass } from '../rate-limit/rate-limiter.js';
import { AiService } from './ai.service.js';
import { buildExtractPlacesSystemPrompt, buildExtractPlacesUserMessage, EXTRACT_PLACES_OUTPUT_SCHEMA } from './extract-places-prompt.js';
import { parseExtractPlacesOutput } from './extract-places-result.js';

const TEXT = 'You must eat at Katz (the pastrami!) and grab bagels at Russ & Daughters on the Lower East Side. Also MoMA.';

describe('extract places: Claude output', () => {
    it('keeps names from the text with the notes and areas it gives', () => {
        const output = JSON.stringify({
            places: [
                { name: 'Katz', note: 'the pastrami', area: '' },
                { name: 'Russ & Daughters', note: 'bagels', area: 'Lower East Side' },
                { name: 'MoMA', note: '', area: '' },
            ],
        });
        expect(parseExtractPlacesOutput(output, TEXT)).toEqual([
            { name: 'Katz', note: 'the pastrami', area: null },
            { name: 'Russ & Daughters', note: 'bagels', area: 'Lower East Side' },
            { name: 'MoMA', note: null, area: null },
        ]);
    });

    it('drops places that are not in the text (no invented places) and repeats', () => {
        const output = JSON.stringify({
            places: [
                { name: 'Katz', note: '', area: '' },
                { name: 'katz', note: '', area: '' },
                { name: 'Peter Luger', note: 'famous steakhouse', area: 'Williamsburg' },
            ],
        });
        expect(parseExtractPlacesOutput(output, TEXT)?.map((place) => place.name)).toEqual(['Katz']);
    });

    it('rejects output that is not the schema', () => {
        expect(parseExtractPlacesOutput('not json', TEXT)).toBeNull();
        expect(parseExtractPlacesOutput(JSON.stringify({ items: [] }), TEXT)).toBeNull();
    });

    it('asks for the text only, and forbids made-up facts', () => {
        const system = buildExtractPlacesSystemPrompt();
        expect(system).toMatch(/Never add addresses, coordinates, opening hours/);
        expect(buildExtractPlacesUserMessage({ text: TEXT, locale: 'he' })).toBe(`User language: Hebrew\nText:\n${TEXT}`);
        expect(EXTRACT_PLACES_OUTPUT_SCHEMA.properties.places.items.required).toEqual(['name', 'note', 'area']);
    });
});

describe('extract places: service', () => {
    const service = (key: string | null, consume = vi.fn(async () => undefined)) =>
        new AiService({ anthropicApiKey: key, aiModel: 'm' } as AppConfig, { consume } as unknown as UsageGuardService);

    it('is "unavailable" with no key, without counting usage', async () => {
        const consume = vi.fn(async () => undefined);
        expect(await service(null, consume).extractPlaces({ text: TEXT, locale: 'en' })).toEqual({ action: 'unavailable' });
        expect(consume).not.toHaveBeenCalled();
    });

    it('is "unavailable" over the daily AI cap, without calling Claude', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const result = await service('key', vi.fn(async () => Promise.reject(new Error('cap')))).extractPlaces({ text: TEXT, locale: 'en' });
        expect(result).toEqual({ action: 'unavailable' });
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it('counts one AI call and returns only places found in the text', async () => {
        const consume = vi.fn(async () => undefined);
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ places: [{ name: 'MoMA', note: '', area: '' }, { name: 'Invented Bar', note: '', area: '' }] }) }] })),
        );
        const result = await service('key', consume).extractPlaces({ text: TEXT, locale: 'en' });
        expect(extractPlacesResponseSchema.parse(result)).toEqual({ action: 'places', places: [{ name: 'MoMA', note: null, area: null }] });
        expect(consume).toHaveBeenCalledWith('ai_interpret');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        fetchSpy.mockRestore();
    });

    it('is rate-limited like other paid routes', () => {
        expect(rateLimitClass('/v1/assistant/extract-places')).toBe('paid');
    });
});
