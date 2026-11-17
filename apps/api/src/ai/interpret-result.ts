import {
  googlePlaceTypeSchema,
  placeCategorySchema,
  type InterpretResponse,
} from '@travel-companion/shared';
import { z } from 'zod';

/** What Claude must return (validated again here; never trusted blindly). */
const claudeOutputSchema = z.object({
  action: z.enum(['search', 'clarify']),
  summary: z.string().max(200),
  textQuery: z.string().max(200),
  includedType: z.union([googlePlaceTypeSchema, z.literal('none')]),
  category: placeCategorySchema,
  openNow: z.boolean(),
  nearBase: z.boolean().optional(),
  question: z.string().max(300),
  options: z.array(z.string().max(80)),
});

/**
 * Turns Claude's JSON text into our response. Returns null if it doesn't
 * validate, so the caller can fall back instead of showing something wrong.
 * `mustSearch` is set once the user has answered a clarification.
 */
export function parseInterpretOutput(text: string, mustSearch: boolean): InterpretResponse | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = claudeOutputSchema.safeParse(json);
  if (!parsed.success) return null;
  const out = parsed.data;

  if (out.action === 'clarify' && !mustSearch && out.question.trim()) {
    return {
      action: 'clarify',
      question: out.question.trim(),
      options: out.options.map((o) => o.trim()).filter(Boolean).slice(0, 4),
    };
  }

  const textQuery = out.textQuery.trim();
  if (!textQuery) return null;
  return {
    action: 'search',
    summary: out.summary.trim() || textQuery,
    plan: {
      textQuery,
      includedType: out.includedType === 'none' ? null : out.includedType,
      openNow: out.openNow,
      category: out.category,
      ...(out.nearBase ? { nearBase: true } : {}),
    },
    interpretedBy: 'ai',
  };
}

/**
 * Used when no AI is configured or Claude fails: search Google with the
 * user's words (plus the trip destination if they gave no area). Labeled
 * "direct" so the app can say so honestly.
 */
export function directInterpretation(
  query: string,
  destination: string | null,
  clarifications: { answer: string }[],
): InterpretResponse {
  const extra = clarifications.map((c) => c.answer).join(', ');
  let textQuery = [query.trim(), extra].filter(Boolean).join(', ');
  if (destination && !textQuery.toLocaleLowerCase().includes(destination.toLocaleLowerCase())) {
    textQuery = `${textQuery} in ${destination}`;
  }
  textQuery = textQuery.slice(0, 200);
  return {
    action: 'search',
    summary: textQuery,
    plan: { textQuery, includedType: null, openNow: false, category: 'other' },
    interpretedBy: 'direct',
  };
}
