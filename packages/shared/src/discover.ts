import { z } from 'zod';
import { googlePlaceSchema, googlePlaceTypeSchema, latLngSchema } from './google.js';
import { placeCategorySchema, type PlaceCategory } from './place.js';

export const DISCOVER_QUERY_MAX = 300;

/** Structured search the AI proposes and the API validates before calling Google. */
export const searchPlanSchema = z.strictObject({
  /** Sent to Google Text Search. AI plans include a location; standard searches may use `area` instead. */
  textQuery: z.string().trim().min(1).max(200),
  includedType: googlePlaceTypeSchema.nullable(),
  openNow: z.boolean(),
  /** Our category for the places found (used when saving). */
  category: placeCategorySchema,
  /**
   * The request is about where the user stays ("near my hotel"). The app then
   * searches around the trip's pinned hotel location, not just by its name.
   */
  nearBase: z.boolean().optional(),
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

/** Largest search circle Google accepts (meters). */
export const SEARCH_RADIUS_MAX_M = 50_000;

/**
 * Where a standard search looks:
 * - near: a place name, e.g. the trip's destination or hotel ("coffee" near "Pod Times Square").
 * - circle: around a point, e.g. the user's current location (results outside may still appear).
 * - bounds: only inside the visible map area ("Search this area").
 */
export const searchAreaSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('near'), text: z.string().trim().min(1).max(200) }),
  z.strictObject({
    kind: z.literal('circle'),
    center: latLngSchema,
    radiusMeters: z.number().min(100).max(SEARCH_RADIUS_MAX_M),
  }),
  z
    .strictObject({ kind: z.literal('bounds'), low: latLngSchema, high: latLngSchema })
    .refine((area) => area.low.latitude < area.high.latitude, {
      error: 'low must be south of high.',
    }),
]);
export type SearchArea = z.infer<typeof searchAreaSchema>;

/** Request body of POST /v1/discover/search. */
export const discoverSearchRequestSchema = z.strictObject({
  plan: searchPlanSchema,
  tripId: z.uuid().optional(),
  /** Only for standard searches; AI plans already name a location. */
  area: searchAreaSchema.optional(),
});
export type DiscoverSearchRequest = z.infer<typeof discoverSearchRequestSchema>;

/** A Google result plus whether the user already saved it. */
export const discoverResultSchema = googlePlaceSchema.extend({
  /** The user's place id if this Google place is already in their collection. */
  savedPlaceId: z.uuid().nullable(),
  /** True if it's already in the trip given in the request. */
  inTrip: z.boolean(),
  /** Our category for this place, from Google's type (falls back to the search's category). */
  category: placeCategorySchema,
});
export type DiscoverResult = z.infer<typeof discoverResultSchema>;

export const discoverSearchResponseSchema = z.object({
  results: z.array(discoverResultSchema),
});
export type DiscoverSearchResponse = z.infer<typeof discoverSearchResponseSchema>;

const TYPE_CATEGORIES: [PlaceCategory, (type: string) => boolean][] = [
  ['stay', (type) => ['lodging', 'hotel', 'motel', 'hostel', 'bed_and_breakfast', 'inn', 'resort_hotel'].includes(type)],
  ['coffee', (type) => ['cafe', 'coffee_shop', 'tea_house', 'cat_cafe', 'internet_cafe'].includes(type)],
  [
    'nightlife',
    (type) => type === 'bar' || type.endsWith('_bar') || ['pub', 'night_club', 'karaoke', 'comedy_club', 'jazz_club'].includes(type),
  ],
  [
    'food',
    (type) =>
      type.endsWith('_restaurant') ||
      ['restaurant', 'bakery', 'deli', 'diner', 'food_court', 'meal_takeaway', 'meal_delivery', 'sandwich_shop',
        'ice_cream_shop', 'dessert_shop', 'donut_shop', 'bagel_shop', 'confectionery', 'food'].includes(type),
  ],
  [
    'sights',
    (type) =>
      ['tourist_attraction', 'museum', 'art_gallery', 'historical_landmark', 'historical_place', 'monument',
        'observation_deck', 'church', 'place_of_worship', 'cultural_landmark', 'performing_arts_theater',
        'opera_house', 'concert_hall', 'zoo', 'aquarium', 'sculpture', 'landmark', 'amusement_park'].includes(type),
  ],
  [
    'outdoors',
    (type) => ['park', 'national_park', 'state_park', 'garden', 'botanical_garden', 'beach', 'hiking_area', 'plaza',
      'dog_park', 'marina', 'playground'].includes(type),
  ],
  [
    'shopping',
    (type) => type.endsWith('_store') || ['shopping_mall', 'market', 'supermarket', 'grocery_store', 'department_store'].includes(type),
  ],
];

/** Our category for a Google primary type, e.g. "italian_restaurant" -> "food". */
export function categoryForGoogleType(primaryType: string | null, fallback: PlaceCategory = 'other'): PlaceCategory {
  if (!primaryType) return fallback;
  return TYPE_CATEGORIES.find(([, matches]) => matches(primaryType))?.[0] ?? fallback;
}
