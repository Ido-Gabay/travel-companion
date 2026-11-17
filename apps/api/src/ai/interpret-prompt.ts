import {
  GOOGLE_PLACE_TYPES,
  PLACE_CATEGORIES,
  type SupportedLocale,
} from '@travel-companion/shared';

export interface InterpretContext {
  locale: SupportedLocale;
  /** The user's own trip data (not Google content). */
  trip: {
    title: string;
    destination: string | null;
    baseLocation: string | null;
    startDate: string | null;
    endDate: string | null;
  } | null;
  clarifications: { question: string; answer: string }[];
}

/**
 * JSON schema for Claude's structured output. Kept flat (no nullable unions):
 * "none" stands for no Google type, empty strings for unused text.
 */
export const INTERPRET_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['search', 'clarify'] },
    summary: { type: 'string', description: 'Short user-facing description of what will be searched, in the user language. Empty when clarifying.' },
    textQuery: { type: 'string', description: 'Google Maps text search query, always including a place/area. Empty when clarifying.' },
    includedType: { type: 'string', enum: [...GOOGLE_PLACE_TYPES, 'none'] },
    category: { type: 'string', enum: [...PLACE_CATEGORIES] },
    openNow: { type: 'boolean' },
    nearBase: { type: 'boolean', description: 'True when the request is about where the traveler stays (near my hotel / where we stay).' },
    question: { type: 'string', description: 'One short clarification question in the user language. Empty when searching.' },
    options: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short suggested answers. Empty when searching.' },
  },
  required: ['action', 'summary', 'textQuery', 'includedType', 'category', 'openNow', 'nearBase', 'question', 'options'],
  additionalProperties: false,
} as const;

export function buildSystemPrompt(): string {
  return [
    'You turn a traveler\'s request into ONE Google Maps text search for a travel planning app.',
    'You never name, recommend or invent specific places. Google returns the places; you only build the search.',
    '',
    'Rules:',
    '- textQuery: a concise Google Maps query in English that always contains a concrete area (neighborhood, landmark or city). Keep quality words the user used ("best", "recommended", "cheap").',
    '- "Near my hotel", "near where we stay" and similar mean the trip\'s "staying at" location when one is given; search near it and set nearBase true. Otherwise nearBase is false.',
    '- If the request has no area, use the trip destination. If there is no destination either, or the area depends on something unknown (e.g. "near my hotel" without knowing the hotel), choose action "clarify".',
    '- Ask at most one short question. Offer up to 4 short options when natural (e.g. neighborhoods). If clarification answers are provided, you MUST choose "search".',
    '- includedType: the single best matching type from the list, or "none" if unsure or the request spans several kinds of places.',
    '- category: our app category for the results: food (restaurants, bakeries, ice cream), coffee (cafes), sights (attractions, museums, viewpoints, galleries), shopping, nightlife (bars, clubs), outdoors (parks), stay (hotels), other.',
    '- openNow: true only if the user asks for places open now.',
    '- summary: a few words for the UI in the user\'s language, e.g. "Italian restaurants near Times Square". No claims about specific places.',
    '- If the request is not about finding places, choose "clarify" and ask what kind of places they want.',
  ].join('\n');
}

export function buildUserMessage(query: string, context: InterpretContext): string {
  const lines = [
    `User language: ${context.locale === 'he' ? 'Hebrew' : 'English'}`,
    context.trip
      ? `Current trip: "${context.trip.title}"${context.trip.destination ? `, destination: ${context.trip.destination}` : ', no destination set'}${context.trip.startDate ? `, dates: ${context.trip.startDate} to ${context.trip.endDate ?? context.trip.startDate}` : ''}`
      : 'Current trip: none',
    ...(context.trip?.baseLocation ? [`Staying at: ${context.trip.baseLocation}`] : []),
    '',
    `Request: ${query}`,
  ];
  for (const c of context.clarifications) {
    lines.push(`You asked: ${c.question}`, `User answered: ${c.answer}`);
  }
  return lines.join('\n');
}
