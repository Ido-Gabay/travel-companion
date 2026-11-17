import {
  googlePhotoNameSchema,
  googlePlaceIdSchema,
  type GooglePhoto,
  type GooglePlace,
  type GooglePlacePreview,
  type SearchArea,
  type SearchPlan,
  type SupportedLocale,
} from '@travel-companion/shared';

/** The subset of a Places API (New) Place object we request. */
export interface GoogleApiPlace {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string;
  businessStatus?: string;
  timeZone?: { id?: string };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photos?: {
    name?: string;
    widthPx?: number;
    heightPx?: number;
    googleMapsUri?: string;
    authorAttributions?: { displayName?: string; uri?: string }[];
  }[];
}

/**
 * Field masks. Every field here is billed at the "Pro" level for Text Search
 * and Place Details; no Enterprise fields (ratings, hours, photos) are asked for.
 */
export const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'location',
  'primaryType',
  'primaryTypeDisplayName',
  'googleMapsUri',
  'businessStatus',
  // Pro, like the fields above; used to schedule reminders in the trip's time zone.
  'timeZone',
] as const;

export const TEXT_SEARCH_FIELD_MASK = PLACE_FIELDS.map((field) => `places.${field}`).join(',');
export const PLACE_DETAILS_FIELD_MASK = PLACE_FIELDS.join(',');

/**
 * Place preview: the Pro fields plus rating, rating count and opening hours
 * (Place Details Enterprise) and the photo list (free metadata). Approved by
 * the owner on 2026-11-17 with caps inside the free allowance. Never add
 * reviews, editorialSummary or other "Atmosphere" fields here: they move the
 * request to a pricier SKU that was not approved.
 */
export const PREVIEW_FIELDS = [...PLACE_FIELDS, 'rating', 'userRatingCount', 'currentOpeningHours', 'photos'] as const;
export const PLACE_PREVIEW_FIELD_MASK = PREVIEW_FIELDS.join(',');

/** Most photos listed in a preview (each one costs only when its image is loaded). */
export const PREVIEW_PHOTO_LIMIT = 10;

/** Converts a Google Place into our display shape. Returns null if unusable. */
export function toGooglePlace(raw: GoogleApiPlace): GooglePlace | null {
  const id = googlePlaceIdSchema.safeParse(raw.id);
  const name = raw.displayName?.text?.trim();
  if (!id.success || !name) return null;

  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  return {
    placeId: id.data,
    name,
    address: raw.shortFormattedAddress ?? raw.formattedAddress ?? null,
    location:
      typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null,
    primaryType: raw.primaryType ?? null,
    typeLabel: raw.primaryTypeDisplayName?.text ?? null,
    googleMapsUri: raw.googleMapsUri ?? null,
    businessStatus: raw.businessStatus ?? null,
    timeZone: raw.timeZone?.id ?? null,
  };
}

/**
 * Request body for Text Search (New). A "near" area is added to the text
 * ("coffee near Pod Times Square"); a circle biases results toward a point;
 * bounds restrict results to the visible map.
 */
export function buildTextSearchBody(
  plan: SearchPlan,
  language: SupportedLocale,
  pageSize: number,
  area?: SearchArea,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    textQuery: area?.kind === 'near' ? `${plan.textQuery} near ${area.text}` : plan.textQuery,
    pageSize,
    languageCode: language,
  };
  if (plan.openNow) body.openNow = true;
  if (plan.includedType) body.includedType = plan.includedType;
  if (area?.kind === 'circle') {
    body.locationBias = { circle: { center: area.center, radius: area.radiusMeters } };
  } else if (area?.kind === 'bounds') {
    body.locationRestriction = { rectangle: { low: area.low, high: area.high } };
  }
  return body;
}

function toPhoto(raw: NonNullable<GoogleApiPlace['photos']>[number]): GooglePhoto | null {
  const name = googlePhotoNameSchema.safeParse(raw.name);
  if (!name.success) return null;
  return {
    name: name.data,
    widthPx: Math.max(0, Math.round(raw.widthPx ?? 0)),
    heightPx: Math.max(0, Math.round(raw.heightPx ?? 0)),
    attributions: (raw.authorAttributions ?? [])
      .filter((author) => author.displayName)
      .map((author) => ({ displayName: author.displayName ?? '', uri: author.uri ?? null })),
    googleMapsUri: raw.googleMapsUri?.startsWith('https://') ? raw.googleMapsUri : null,
  };
}

/** A preview from a full (Enterprise) details response. */
export function toGooglePlacePreview(raw: GoogleApiPlace): GooglePlacePreview | null {
  const place = toGooglePlace(raw);
  if (!place) return null;
  const rating = typeof raw.rating === 'number' && raw.rating >= 0 && raw.rating <= 5 ? raw.rating : null;
  const count = typeof raw.userRatingCount === 'number' && raw.userRatingCount >= 0 ? Math.round(raw.userRatingCount) : null;
  return {
    ...place,
    rating,
    userRatingCount: count,
    openNow: typeof raw.currentOpeningHours?.openNow === 'boolean' ? raw.currentOpeningHours.openNow : null,
    weekdayHours: (raw.currentOpeningHours?.weekdayDescriptions ?? []).filter((line) => typeof line === 'string').slice(0, 7),
    photos: (raw.photos ?? [])
      .map(toPhoto)
      .filter((photo): photo is GooglePhoto => photo !== null)
      .slice(0, PREVIEW_PHOTO_LIMIT),
    detail: 'full',
  };
}

/** A preview with only the free fields, used when the preview cap is reached. */
export function basicPreview(place: GooglePlace): GooglePlacePreview {
  return { ...place, rating: null, userRatingCount: null, openNow: null, weekdayHours: [], photos: [], detail: 'basic' };
}
