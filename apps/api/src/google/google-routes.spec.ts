import { describe, expect, it } from 'vitest';
import { routeLegSchema } from '@travel-companion/shared';
import { buildComputeRoutesBody, ROUTES_FIELD_MASK, toRouteLeg } from './google-routes.mapper.js';

const FROM = { latitude: 40.7536, longitude: -73.9832 };
const TO = { latitude: 40.7794, longitude: -73.9632 };
const NOW = Date.parse('2026-11-20T12:00:00Z');

describe('Routes API request (Essentials only)', () => {
  it('asks only for duration, distance and the route line', () => {
    expect(ROUTES_FIELD_MASK.split(',')).toEqual(['routes.duration', 'routes.distanceMeters', 'routes.polyline.encodedPolyline']);
    for (const pro of ['travelAdvisory', 'tollInfo', 'speedReading', 'legs.', 'optimized']) expect(ROUTES_FIELD_MASK).not.toContain(pro);
  });

  it('never sets a field that bills as Pro or Enterprise', () => {
    for (const mode of ['walk', 'transit'] as const) {
      const body = buildComputeRoutesBody({ from: FROM, to: TO, mode, departAt: '2026-11-24T15:00:00Z' }, NOW, 'en');
      for (const pro of ['routingPreference', 'intermediates', 'optimizeWaypointOrder', 'extraComputations', 'routeModifiers']) {
        expect(body).not.toHaveProperty(pro);
      }
      expect(JSON.stringify(body)).not.toMatch(/heading|sideOfRoad|vehicleStopover|TRAFFIC/);
    }
  });

  it('walks without a time and rides transit at the planned time when Google accepts it', () => {
    expect(buildComputeRoutesBody({ from: FROM, to: TO, mode: 'walk', departAt: '2026-11-24T15:00:00Z' }, NOW, 'en')).toMatchObject({
      travelMode: 'WALK',
    });
    expect(buildComputeRoutesBody({ from: FROM, to: TO, mode: 'walk', departAt: '2026-11-24T15:00:00Z' }, NOW, 'en')).not.toHaveProperty(
      'departureTime',
    );
    expect(buildComputeRoutesBody({ from: FROM, to: TO, mode: 'transit', departAt: '2026-11-24T15:00:00Z' }, NOW, 'he')).toMatchObject({
      travelMode: 'TRANSIT',
      departureTime: '2026-11-24T15:00:00.000Z',
      languageCode: 'he',
    });
    // Outside Google's window (more than 100 days ahead): no time, Google uses now.
    expect(buildComputeRoutesBody({ from: FROM, to: TO, mode: 'transit', departAt: '2027-06-01T15:00:00Z' }, NOW, 'en')).not.toHaveProperty(
      'departureTime',
    );
  });
});

describe('toRouteLeg', () => {
  it('maps the first route to minutes, meters and the line', () => {
    const leg = toRouteLeg({ routes: [{ duration: '1530s', distanceMeters: 2040.6, polyline: { encodedPolyline: 'abc' } }] }, 'walk');
    expect(leg).toEqual({ minutes: 26, meters: 2041, mode: 'walk', polyline: 'abc' });
    expect(routeLegSchema.parse(leg)).toEqual(leg);
  });

  it('returns null when Google found no route', () => {
    expect(toRouteLeg({}, 'transit')).toBeNull();
    expect(toRouteLeg({ routes: [] }, 'transit')).toBeNull();
    expect(toRouteLeg({ routes: [{ distanceMeters: 100 }] }, 'walk')).toBeNull();
  });
});
