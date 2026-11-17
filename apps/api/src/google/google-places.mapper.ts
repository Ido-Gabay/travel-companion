import { googlePlaceIdSchema, type GooglePlace } from '@travel-companion/shared';

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
] as const;

export const TEXT_SEARCH_FIELD_MASK = PLACE_FIELDS.map((field) => `places.${field}`).join(',');
export const PLACE_DETAILS_FIELD_MASK = PLACE_FIELDS.join(',');

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
  };
}
