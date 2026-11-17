import { describe, expect, it } from 'vitest';
import { distanceMeters, formatDistance, regionToBounds } from './geo';

describe('geo helpers', () => {
  it('measures straight-line distance', () => {
    // Times Square to the Empire State Building: about 1.1 km.
    const meters = distanceMeters({ latitude: 40.758, longitude: -73.9855 }, { latitude: 40.7484, longitude: -73.9857 });
    expect(meters).toBeGreaterThan(1000);
    expect(meters).toBeLessThan(1150);
    expect(distanceMeters({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 })).toBe(0);
  });

  it('formats distances', () => {
    expect(formatDistance(347, 'en')).toBe('350 m');
    expect(formatDistance(3, 'en')).toBe('10 m');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(1609.344, 'en', 'mi')).toBe('1 mi');
    expect(formatDistance(100, 'en', 'mi')).toBe('350 ft');
  });

  it('turns a map region into corners', () => {
    const bounds = regionToBounds({ latitude: 40.75, longitude: -73.98, latitudeDelta: 0.1, longitudeDelta: 0.2 });
    expect(bounds.low.latitude).toBeCloseTo(40.7);
    expect(bounds.low.longitude).toBeCloseTo(-74.08);
    expect(bounds.high.latitude).toBeCloseTo(40.8);
    expect(bounds.high.longitude).toBeCloseTo(-73.88);
  });
});
