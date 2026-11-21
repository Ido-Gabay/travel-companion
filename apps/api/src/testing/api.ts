import type { AuthUser } from '../auth/auth.types.js';
import type { AppConfig } from '../config/app-config.js';
import { DatabaseService } from '../database/database.service.js';
import { PlacesService } from '../places/places.service.js';
import { TimeZonesService } from '../timezones/timezones.service.js';
import { StaysService } from '../trips/stays.service.js';
import { StopsService } from '../trips/stops.service.js';
import { TripsV2Service } from '../trips/trips-v2.service.js';
import { TripsService } from '../trips/trips.service.js';
import { onCloseAll, type TestDb } from './pg.js';

/**
 * The API's real services on a test database, through the API's own driver
 * (postgres.js) and DatabaseService.asUser (role authenticated, RLS on).
 */
export async function apiServices(db: TestDb) {
  const database = new DatabaseService({
    databaseUrl: await db.url(),
    databaseSsl: 'disable',
    databasePoolMax: 1,
  } as AppConfig);
  onCloseAll(() => database.onApplicationShutdown());
  const timeZones = new TimeZonesService();
  const tripsV2 = new TripsV2Service(database);
  return {
    database,
    timeZones,
    trips: new TripsService(database),
    tripsV2,
    stops: new StopsService(database, timeZones, tripsV2),
    stays: new StaysService(database, timeZones, tripsV2),
    places: new PlacesService(database, timeZones),
  };
}

export type ApiServices = Awaited<ReturnType<typeof apiServices>>;

export const asAuthUser = (id: string): AuthUser => ({ id, email: null });

/** The API error a call failed with: status, code and details (or a thrown non-API error). */
export async function apiError(work: () => Promise<unknown>): Promise<{ status: number; code: string; message: string; details: { path: string; message: string }[] }> {
  try {
    await work();
  } catch (error) {
    const e = error as { getStatus?: () => number; code?: string; message: string; details?: { path: string; message: string }[] };
    if (typeof e.getStatus === 'function') {
      return { status: e.getStatus(), code: e.code ?? '', message: e.message, details: e.details ?? [] };
    }
    throw error;
  }
  throw new Error('Expected the call to fail.');
}
