import { describe, expect, it } from 'vitest';
import { TimeZonesService, timeZoneDataBytes } from './timezones.service.js';

/** D1 · Time zone lookup from bundled open boundary data (tzf-wasm, no network). */
describe('TimeZonesService', () => {
  const service = new TimeZonesService();

  it('loads the boundary data only on the first lookup', () => {
    expect(timeZoneDataBytes()).toBe(0);
    service.suggest(40.758, -73.9855);
    expect(timeZoneDataBytes()).toBeGreaterThan(0);
  });

  it('reports the data release from the library, in the database format', () => {
    expect(service.dataset()).toMatch(/^[0-9]{4}[a-z]$/);
  });

  it.each([
    [40.758, -73.9855, 'America/New_York'],
    [32.0853, 34.7818, 'Asia/Jerusalem'],
    [41.8902, 12.4922, 'Europe/Rome'],
    [35.6595, 139.7005, 'Asia/Tokyo'],
    // Named for the place, not merged into a zone with the same clock.
    [43.6532, -79.3832, 'America/Toronto'],
    [59.9139, 10.7522, 'Europe/Oslo'],
  ])('(%s, %s) → %s, certain', (latitude, longitude, zone) => {
    const dataset = service.dataset();
    expect(service.suggest(latitude, longitude)).toEqual({ timeZone: zone, alternatives: [], certain: true, dataset });
    expect(service.derive(latitude, longitude)).toEqual({ timeZone: zone, dataset });
  });

  it('open sea is a suggestion, never derived for storage', () => {
    const suggestion = service.suggest(35, -40);
    expect(suggestion.certain).toBe(false);
    expect(suggestion.timeZone).toMatch(/^Etc\/GMT/);
    expect(service.derive(35, -40)).toBeNull();
  });

  it('many lookups do not grow memory (fixed-size data, no cache)', () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i += 1) service.suggest(-60 + random() * 130, -180 + random() * 360);
    const data = timeZoneDataBytes();
    const heap = process.memoryUsage().heapUsed;
    for (let i = 0; i < 20000; i += 1) service.suggest(-60 + random() * 130, -180 + random() * 360);
    // geo-tz's default cache grew by ~200 MB here; tzf-wasm's memory is fixed.
    expect(timeZoneDataBytes()).toBe(data);
    expect(process.memoryUsage().heapUsed - heap).toBeLessThan(20 * 1024 * 1024);
  });
});
