import { describe, expect, it } from 'vitest';
import { googlePlacePreviewSchema, googlePlaceSchema } from '@travel-companion/shared';
import {
  basicPreview,
  buildTextSearchBody,
  PLACE_DETAILS_FIELD_MASK,
  PLACE_PREVIEW_FIELD_MASK,
  toGooglePlacePreview,
  TEXT_SEARCH_FIELD_MASK,
  toGooglePlace,
} from './google-places.mapper.js';

describe('field masks', () => {
  it('request only Pro-level fields (no ratings, hours or photos)', () => {
    for (const expensive of ['rating', 'userRatingCount', 'photos', 'OpeningHours', 'reviews', 'priceLevel']) {
      expect(TEXT_SEARCH_FIELD_MASK).not.toContain(expensive);
      expect(PLACE_DETAILS_FIELD_MASK).not.toContain(expensive);
    }
    expect(TEXT_SEARCH_FIELD_MASK.split(',').every((field) => field.startsWith('places.'))).toBe(true);
  });
});

describe('toGooglePlace', () => {
  it('maps a Google place', () => {
    const place = toGooglePlace({
      id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      displayName: { text: "Katz's Delicatessen" },
      formattedAddress: '205 E Houston St, New York, NY 10002, USA',
      shortFormattedAddress: '205 E Houston St, New York',
      location: { latitude: 40.7223, longitude: -73.9874 },
      primaryType: 'deli',
      primaryTypeDisplayName: { text: 'Deli' },
      googleMapsUri: 'https://maps.google.com/?cid=1',
      businessStatus: 'OPERATIONAL',
    });
    expect(place).not.toBeNull();
    expect(googlePlaceSchema.parse(place)).toEqual(place);
    expect(place?.address).toBe('205 E Houston St, New York');
  });

  it('drops places without an id or name', () => {
    expect(toGooglePlace({ displayName: { text: 'x' } })).toBeNull();
    expect(toGooglePlace({ id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' })).toBeNull();
  });

  it('tolerates a missing location', () => {
    expect(toGooglePlace({ id: 'ChIJN1t_tDeuEmsRUsoyG83frY4', displayName: { text: 'x' } })?.location).toBeNull();
  });
});

describe('buildTextSearchBody', () => {
  const plan = { textQuery: 'coffee', includedType: 'coffee_shop' as const, openNow: true, category: 'coffee' as const };

  it('adds a named area to the text', () => {
    expect(buildTextSearchBody(plan, 'en', 15, { kind: 'near', text: 'Pod Times Square' })).toEqual({
      textQuery: 'coffee near Pod Times Square',
      pageSize: 15,
      languageCode: 'en',
      openNow: true,
      includedType: 'coffee_shop',
    });
  });

  it('biases toward a point and restricts to map bounds', () => {
    const center = { latitude: 40.75, longitude: -73.98 };
    expect(buildTextSearchBody(plan, 'he', 15, { kind: 'circle', center, radiusMeters: 1500 }).locationBias).toEqual({
      circle: { center, radius: 1500 },
    });
    const low = { latitude: 40.7, longitude: -74.0 };
    const high = { latitude: 40.8, longitude: -73.9 };
    const bounded = buildTextSearchBody(plan, 'en', 15, { kind: 'bounds', low, high });
    expect(bounded.locationRestriction).toEqual({ rectangle: { low, high } });
    expect(bounded.textQuery).toBe('coffee');
  });

  it('leaves out optional fields when not used', () => {
    expect(buildTextSearchBody({ ...plan, includedType: null, openNow: false }, 'en', 15)).toEqual({
      textQuery: 'coffee',
      pageSize: 15,
      languageCode: 'en',
    });
  });
});

describe('place preview (approved: rating + hours + photos, no reviews)', () => {
  it('asks for Enterprise fields but never Atmosphere fields', () => {
    const fields = PLACE_PREVIEW_FIELD_MASK.split(',');
    expect(fields).toEqual(expect.arrayContaining(['rating', 'userRatingCount', 'currentOpeningHours', 'photos']));
    for (const atmosphere of ['reviews', 'reviewSummary', 'editorialSummary', 'generativeSummary', 'servesBreakfast', 'outdoorSeating']) {
      expect(fields).not.toContain(atmosphere);
    }
  });

  it('maps rating, hours and photos', () => {
    const preview = toGooglePlacePreview({
      id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      displayName: { text: "Katz's Delicatessen" },
      rating: 4.5,
      userRatingCount: 12345,
      currentOpeningHours: { openNow: true, weekdayDescriptions: ['Monday: 8:00 AM – 10:45 PM'] },
      photos: [
        {
          name: 'places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/AXCi2Q6abcdefghijk',
          widthPx: 4032,
          heightPx: 3024,
          authorAttributions: [{ displayName: 'Ana', uri: 'https://maps.google.com/maps/contrib/1' }],
        },
        { name: 'not-a-photo' },
      ],
    });
    expect(preview && googlePlacePreviewSchema.parse(preview)).toEqual(preview);
    expect(preview?.rating).toBe(4.5);
    expect(preview?.openNow).toBe(true);
    expect(preview?.photos).toHaveLength(1);
    expect(preview?.photos[0]?.attributions[0]?.displayName).toBe('Ana');
    expect(preview?.detail).toBe('full');
  });

  it('falls back to a basic preview', () => {
    const place = toGooglePlace({ id: 'ChIJN1t_tDeuEmsRUsoyG83frY4', displayName: { text: 'x' } });
    const basic = place && basicPreview(place);
    expect(basic && googlePlacePreviewSchema.parse(basic)).toEqual(basic);
    expect(basic?.detail).toBe('basic');
    expect(basic?.photos).toEqual([]);
  });
});
