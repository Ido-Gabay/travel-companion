import { describe, expect, it } from 'vitest';
import { GOOGLE_PLACE_TYPES } from '@travel-companion/shared';
import { areaFor, defaultWhere, SEARCH_PRESETS, whereOptions } from './search-presets';

const ny = { destination: 'New York', baseLocation: 'Pod Times Square', basePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' };
const hotel = { latitude: 40.7577, longitude: -73.9857 };
const here = { latitude: 40.758, longitude: -73.9855 };

describe('search presets', () => {
  it('only use Google types the API accepts', () => {
    for (const preset of SEARCH_PRESETS) {
      if (preset.includedType) expect(GOOGLE_PLACE_TYPES).toContain(preset.includedType);
    }
  });

  it('offers the hotel and destination only when the trip has them', () => {
    expect(whereOptions(ny)).toEqual(['hotel', 'destination', 'me', 'anywhere']);
    expect(whereOptions({ destination: 'New York', baseLocation: null, basePlaceId: null })).toEqual(['destination', 'me', 'anywhere']);
    expect(whereOptions(null)).toEqual(['me', 'anywhere']);
  });

  it('starts near the hotel before the trip and near the user during it', () => {
    expect(defaultWhere(ny, false)).toBe('hotel');
    expect(defaultWhere(ny, true)).toBe('me');
    expect(defaultWhere(null, false)).toBe('me');
  });

  it('builds the search area', () => {
    const none = { here: null, hotel: null };
    expect(areaFor('hotel', ny, { here: null, hotel })).toEqual({ kind: 'circle', center: hotel, radiusMeters: 1000 });
    // Never a guess from the hotel's name: without the pinned location there is no area.
    expect(areaFor('hotel', ny, none)).toBeNull();
    expect(areaFor('destination', ny, none)).toEqual({ kind: 'near', text: 'New York' });
    expect(areaFor('me', ny, { here, hotel: null })).toEqual({ kind: 'circle', center: here, radiusMeters: 1500 });
    expect(areaFor('me', ny, none)).toBeNull();
    expect(areaFor('anywhere', ny, { here, hotel })).toBeNull();
  });
});
