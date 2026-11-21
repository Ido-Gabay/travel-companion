import { Module, VersioningType, type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AllExceptionsFilter } from '../common/all-exceptions.filter.js';
import { DatabaseService } from '../database/database.service.js';
import { PlacesController } from '../places/places.controller.js';
import { PlacesService } from '../places/places.service.js';
import { apiServices } from '../testing/api.js';
import { USER_A, seedUsers } from '../testing/d1-fixture.js';
import { closeAll, createDatabase, onCloseAll } from '../testing/pg.js';
import { TimeZonesController } from '../timezones/timezones.controller.js';
import { TimeZonesService } from '../timezones/timezones.service.js';
import { StaysService } from './stays.service.js';
import { StopsService } from './stops.service.js';
import { TripsV2Controller } from './trips-v2.controller.js';
import { TripsV2Service } from './trips-v2.service.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

/**
 * D1 · The HTTP surface: real controllers, pipes, routing (/v1 beside /v2,
 * URI versioning as in main.ts) and error bodies, on a test database. Only the
 * Supabase token check is replaced (the signed-in user is fixed).
 */
afterEach(closeAll);

class SignedIn implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<AuthenticatedRequest>().user = { id: USER_A, email: null };
    return true;
  }
}

async function start(): Promise<string> {
  const db = await createDatabase();
  await seedUsers(db);
  const { database } = await apiServices(db);
  @Module({
    controllers: [TripsController, TripsV2Controller, PlacesController, TimeZonesController],
    providers: [
      TripsService, TripsV2Service, StopsService, StaysService, PlacesService, TimeZonesService,
      { provide: DatabaseService, useValue: database },
      { provide: APP_GUARD, useClass: SignedIn },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  })
  class TestModule {}
  const app: INestApplication = await NestFactory.create(TestModule, { logger: false });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.listen(0, '127.0.0.1');
  onCloseAll(() => app.close());
  return (await app.getUrl()).replace('[::1]', '127.0.0.1');
}

describe('HTTP: v1 and v2 side by side', () => {
  it('routes, status codes and error bodies', async () => {
    const base = await start();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: (res.status === 204 ? null : await res.json()) as any };
    };

    const trip = await call('POST', '/v1/trips', { title: 'NY', baseLocation: 'Pod', startDate: '2026-11-23', endDate: '2026-11-29' });
    expect(trip.status).toBe(201);
    const place = await call('POST', '/v1/places', { name: 'Pin', latitude: 40.758, longitude: -73.9855 });
    const t = `/v2/trips/${trip.json.id}`;
    const saved = await call('POST', `${t}/places`, { placeId: place.json.id });
    expect(saved.status).toBe(200);
    const tripPlaceId = saved.json.places[0].tripPlaceId;

    const added = await call('POST', `${t}/stops`, { tripPlaceId, day: '2026-11-24' });
    expect([added.status, added.json.stop.timeZone]).toEqual([201, 'America/New_York']);
    const stop = `${t}/stops/${added.json.stop.id}`;
    // Transitions take no body.
    expect((await call('POST', `${stop}/complete`)).json.stop.status).toBe('completed');
    expect((await call('POST', `${stop}/fly`)).status).toBe(400);
    const skip = await call('POST', `${stop}/skip`);
    expect([skip.status, skip.json.error.code]).toEqual([409, 'INVALID_TRANSITION']);
    const remove = await call('DELETE', stop);
    expect([remove.status, remove.json.error.code, remove.json.error.details]).toEqual([
      409, 'CONFLICT', [{ path: 'reason', message: 'CONFIRM_REQUIRED' }],
    ]);
    expect((await call('DELETE', `${stop}?confirm=1`)).status).toBe(200);

    // Unknown fields are rejected, as in v1.
    expect((await call('POST', `${t}/stops`, { tripPlaceId, day: '2026-11-24', status: 'completed' })).status).toBe(400);
    // v1 trip detail has no D1 fields; v2 has no legacy base fields.
    const v1 = await call('GET', `/v1/trips/${trip.json.id}`);
    expect(Object.keys(v1.json.places[0])).not.toContain('latitude');
    const v2 = await call('GET', t);
    expect([v2.json.trip.baseLocation, v2.json.stays[0].label]).toEqual([undefined, 'Pod']);
    expect((await call('POST', '/v1/timezones/lookup', { latitude: 32.08, longitude: 34.78 })).json.timeZone).toBe('Asia/Jerusalem');
    expect((await call('GET', `/v2/places`)).status).toBe(404);
    expect((await call('DELETE', `${t}?deleteHistory=1`)).status).toBe(204);
  });
});
