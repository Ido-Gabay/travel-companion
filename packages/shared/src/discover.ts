import { z } from 'zod';
import { googlePlaceSchema, googlePlaceTypeSchema } from './google.js';
import { placeCategorySchema } from './place.js';

export const DISCOVER_QUERY_MAX = 300;

/** Structured search the AI proposes and the API validates before calling Google. */
export const searchPlanSchema = z.strictObject({
  /** Sent to Google Text Search; always includes a location. */
  textQuery: z.string().trim().min(1).max(200),
  includedType: googlePlaceTypeSchema.nullable(),
  openNow: z.boolean(),
  /** Our category for the places found (used when saving). */
  category: placeCategorySchema,
});
export type SearchPlan = z.infer<typeof searchPlanSchema>;

export const clarificationSchema = z.strictObject({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(200),
});

/** Request body of POST /v1/discover/interpret. */
export const interpretRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(DISCOVER_QUERY_MAX),
  tripId: z.uuid().optional(),
  /** Answers to earlier clarification questions, oldest first. */
  clarifications: z.array(clarificationSchema).max(3).optional(),
});
export type InterpretRequest = z.input<typeof interpretRequestSchema>;

/** Response of POST /v1/discover/interpret. */
export const interpretResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('search'),
    /** Short, user-facing description, e.g. "Italian restaurants near Times Square". */
    summary: z.string(),
    plan: searchPlanSchema,
    /** "ai" when Claude interpreted the request; "direct" when the text went to Google as typed. */
    interpretedBy: z.enum(['ai', 'direct']),
  }),
  z.object({
    action: z.literal('clarify'),
    question: z.string(),
    options: z.array(z.string()).max(4),
  }),
]);
export type InterpretResponse = z.infer<typeof interpretResponseSchema>;

/** Request body of POST /v1/discover/search. */
export const discoverSearchRequestSchema = z.strictObject({
  plan: searchPlanSchema,
  tripId: z.uuid().optional(),
});
export type DiscoverSearchRequest = z.infer<typeof discoverSearchRequestSchema>;

/** A Google result plus whether the user already saved it. */
export const discoverResultSchema = googlePlaceSchema.extend({
  /** The user's place id if this Google place is already in their collection. */
  savedPlaceId: z.uuid().nullable(),
  /** True if it's already in the trip given in the request. */
  inTrip: z.boolean(),
});
export type DiscoverResult = z.infer<typeof discoverResultSchema>;

export const discoverSearchResponseSchema = z.object({
  results: z.array(discoverResultSchema),
});
export type DiscoverSearchResponse = z.infer<typeof discoverSearchResponseSchema>;
