import { z } from 'zod';
import { clarificationSchema } from './discover.js';
import { localeSchema } from './locale.js';
import { placeCategorySchema } from './place.js';
import { STOP_STATUSES } from './stop.js';
import { calendarDateSchema, startTimeSchema } from './trip.js';

/**
 * D1 trip assistant: a request in the user's own words ("make Wednesday less
 * busy") turned into structured planning instructions. The instructions only
 * shape a PROPOSAL from the on-device planner; nothing is changed until the
 * user applies it. The assistant never sees Google Places content: visits are
 * described by an opaque ref, their category and the user's own label.
 */

export const ASSISTANT_MESSAGE_MAX = 300;
export const ASSISTANT_DAYS_MAX = 31;
export const ASSISTANT_ITEMS_MAX = 150;
export const ASSISTANT_INSTRUCTIONS_MAX = 6;

const refSchema = z.string().trim().min(1).max(12);
const labelSchema = z.string().trim().max(80).nullable();

/** A visit or wishlist place the request points at. Every part is optional; the phone resolves it. */
export const assistantTargetSchema = z.strictObject({
  /** A ref from the context (v1, w2…), when the request clearly names one. */
  ref: refSchema.nullable(),
  category: placeCategorySchema.nullable(),
  /** Words to match against the place's name on the phone, e.g. "museum". */
  text: z.string().trim().max(80).nullable(),
  day: calendarDateSchema.nullable(),
});
export type AssistantTarget = z.infer<typeof assistantTargetSchema>;

export const assistantInstructionSchema = z.discriminatedUnion('kind', [
  /** Fewer hours on a day (0 = keep it free). Null: noticeably lighter than now. */
  z.strictObject({ kind: z.literal('lighten'), day: calendarDateSchema, maxHours: z.number().min(0).max(14).nullable() }),
  /** First visit not before this time (empty days = every day). */
  z.strictObject({ kind: z.literal('dayStart'), time: startTimeSchema, days: z.array(calendarDateSchema).max(ASSISTANT_DAYS_MAX) }),
  /** Last visit over by this time (empty days = every day). */
  z.strictObject({ kind: z.literal('dayEnd'), time: startTimeSchema, days: z.array(calendarDateSchema).max(ASSISTANT_DAYS_MAX) }),
  /** Longer visits of a kind. Null: about half as long again. */
  z.strictObject({ kind: z.literal('moreTime'), category: placeCategorySchema, extraMinutes: z.number().int().min(15).max(240).nullable() }),
  /** Keep visits where and when they are: starred ones, or every planned visit. */
  z.strictObject({ kind: z.literal('keepFixed'), what: z.enum(['starred', 'all']) }),
  /** Move one visit to another day (null: the best day). */
  z.strictObject({ kind: z.literal('moveVisit'), target: assistantTargetSchema, toDay: calendarDateSchema.nullable() }),
  /** Look for a kind of place near where a day ends (or the stay). Searching is a separate tap. */
  z.strictObject({
    kind: z.literal('findNearby'),
    category: placeCategorySchema,
    query: z.string().trim().min(1).max(100),
    day: calendarDateSchema.nullable(),
    near: z.enum(['dayEnd', 'stay']),
  }),
  /** Running late today: visits whose time has passed get new times from now (today only). */
  z.strictObject({ kind: z.literal('catchUp') }),
  /**
   * A place to find (by the user's own words, or a kind of place) and then either
   * just locate or plan into the trip. The search itself is a separate tap.
   */
  z.strictObject({
    kind: z.literal('findPlace'),
    /** The user's words naming it ("SUMMIT One Vanderbilt") or a kind ("museum"); null = not named yet ("this place"). */
    query: z.string().trim().min(1).max(100).nullable(),
    category: placeCategorySchema.nullable(),
    /** An area the user named ("SoHo"). */
    area: z.string().trim().min(1).max(80).nullable(),
    /** Near the visits already planned. */
    nearPlanned: z.boolean(),
    /** Near where the user is now ("something interesting nearby"); the phone's one location reading. */
    nearHere: z.boolean().default(false),
    /** The day the user asked about. */
    day: calendarDateSchema.nullable(),
    /** "Where is it?" only (never changes the plan), or plan it in. */
    intent: z.enum(['locate', 'add']),
  }),
  /** Live: skip one visit (null target = the next one); a proposal with its own switch. */
  z.strictObject({ kind: z.literal('skipVisit'), target: assistantTargetSchema.nullable() }),
  /** Live: a visit is taking longer (null target = the one happening now / next; null minutes = 30). */
  z.strictObject({
    kind: z.literal('extendVisit'),
    target: assistantTargetSchema.nullable(),
    extraMinutes: z.number().int().min(10).max(240).nullable(),
  }),
  /** Live: a planned place is closed or unavailable (null target = the next one): skip, keep, or find an alternative nearby. */
  z.strictObject({ kind: z.literal('closedVisit'), target: assistantTargetSchema.nullable() }),
]);
export type AssistantInstruction = z.infer<typeof assistantInstructionSchema>;

const contextItemSchema = z.strictObject({
  ref: refSchema,
  category: placeCategorySchema,
  /** The user's own label or custom place name only (never a Google name). */
  label: labelSchema,
  start: startTimeSchema.nullable(),
  starred: z.boolean(),
  status: z.enum(STOP_STATUSES).nullable(),
});

/** Request body of POST /v1/assistant/trip. */
export const tripAssistantRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(ASSISTANT_MESSAGE_MAX),
  locale: localeSchema,
  context: z.strictObject({
    today: calendarDateSchema.nullable(),
    days: z
      .array(z.strictObject({ day: calendarDateSchema, visits: z.array(contextItemSchema).max(ASSISTANT_ITEMS_MAX) }))
      .max(ASSISTANT_DAYS_MAX),
    wishlist: z.array(contextItemSchema).max(ASSISTANT_ITEMS_MAX),
  }),
  clarifications: z.array(clarificationSchema).max(2).optional(),
});
export type TripAssistantRequest = z.input<typeof tripAssistantRequestSchema>;

export const tripAssistantResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plan'),
    /** One short line in the user's language: what will be planned. */
    summary: z.string().max(200),
    instructions: z.array(assistantInstructionSchema).min(1).max(ASSISTANT_INSTRUCTIONS_MAX),
  }),
  z.object({ action: z.literal('clarify'), question: z.string().max(300), options: z.array(z.string().max(80)).max(4) }),
  /** No AI right now (not configured, over the daily cap, or it failed): the app keeps manual planning. */
  z.object({ action: z.literal('unavailable') }),
]);
export type TripAssistantResponse = z.infer<typeof tripAssistantResponseSchema>;
