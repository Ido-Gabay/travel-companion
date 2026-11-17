import { describe, expect, it } from 'vitest';
import { googlePlaceSchema } from '@travel-companion/shared';
import { PLACE_DETAILS_FIELD_MASK, TEXT_SEARCH_FIELD_MASK, toGooglePlace } from './google-places.mapper.js';

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
