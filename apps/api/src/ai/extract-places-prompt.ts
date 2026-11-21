import { MAX_IMPORT_PLACES, type ExtractPlacesRequest } from '@travel-companion/shared';

/** Flat JSON for Claude's structured output; "" = not stated in the text. */
export const EXTRACT_PLACES_OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        places: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'The place name exactly as written in the text.' },
                    note: { type: 'string', description: 'What the text itself says about it (e.g. "best pastrami", "book ahead"), or "".' },
                    area: { type: 'string', description: 'A neighborhood or area the text names for it (e.g. "SoHo"), or "".' },
                },
                required: ['name', 'note', 'area'],
                additionalProperties: false,
            },
        },
    },
    required: ['places'],
    additionalProperties: false,
} as const;

export function buildExtractPlacesSystemPrompt(): string {
    return [
        'You find the places a traveler wants to visit in text they pasted (a chat message, notes, recommendations).',
        'Return each distinct place (restaurant, cafe, bar, shop, museum, park, sight, hotel, market, street) once, in the order it appears.',
        '',
        'Rules:',
        '- Use only what the text says. Never add addresses, coordinates, opening hours, prices, ratings, or any fact that is not in the text.',
        '- name: exactly as written (keep the original language and spelling). Do not translate, correct or complete it.',
        '- note: a short phrase the text gives about that place ("try the pastrami", "closed Mondays"), copied or trimmed, never invented; "" if none.',
        '- area: only a neighborhood or area the text links to that place; "" if none.',
        '- Skip cities and countries on their own, people, dates, and generic words ("a nice cafe").',
        `- At most ${MAX_IMPORT_PLACES} places. If there are none, return an empty list.`,
    ].join('\n');
}

export function buildExtractPlacesUserMessage(body: ExtractPlacesRequest): string {
    return [`User language: ${body.locale === 'he' ? 'Hebrew' : 'English'}`, 'Text:', body.text].join('\n');
}
