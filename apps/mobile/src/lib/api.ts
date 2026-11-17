import {
  discoverSearchResponseSchema,
  googlePlaceSchema,
  interpretResponseSchema,
  meSchema,
  saveGooglePlacesResponseSchema,
  preferencesSchema,
  placeListSchema,
  placeSchema,
  tripDetailSchema,
  tripListSchema,
  tripSchema,
  type CreatePlaceInput,
  type DiscoverSearchRequest,
  type DiscoverSearchResponse,
  type GooglePlace,
  type InterpretRequest,
  type InterpretResponse,
  type SaveGooglePlacesInput,
  type SaveGooglePlacesResponse,
  type SupportedLocale,
  type CreateTripInput,
  type ReorderTripDayInput,
  type ScheduleTripPlaceInput,
  type Place,
  type PlaceList,
  type TripDetail,
  type UpdateTripInput,
  type UpdatePlaceInput,
  type Me,
  type Preferences,
  type Trip,
  type TripList,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@travel-companion/shared';
import type { z } from 'zod';
import { ApiClientError, errorFromResponse } from './api-error';
import { envResult } from './env';
import { supabase } from './supabase';

/**
 * Generous because the free API host sleeps when idle and takes about a
 * minute to wake up (docs/DEPLOYMENT.md).
 */
const REQUEST_TIMEOUT_MS = 75_000;

/**
 * Fire-and-forget request to the public health check, sent at app launch so a
 * sleeping API host starts waking up before the user's first real request.
 */
export function wakeApi(): void {
  if (!envResult.ok) return;
  fetch(`${envResult.env.apiUrl}/health`).catch(() => undefined);
}

async function accessToken(): Promise<string> {
  // getSession() returns the stored session and refreshes it first if it has expired.
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new ApiClientError('UNAUTHENTICATED', 401, 'Not signed in.');
  return token;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  if (!envResult.ok) throw new ApiClientError('UNKNOWN', null, 'App is not configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${envResult.env.apiUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${await accessToken()}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiClientError(
      aborted ? 'TIMEOUT' : 'NETWORK',
      null,
      aborted ? 'Request timed out.' : 'Network request failed.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null);
    throw errorFromResponse(response.status, json);
  }
  return response;
}

async function request<S extends z.ZodType>(
  method: Method,
  path: string,
  schema: S,
  body?: unknown,
): Promise<z.output<S>> {
  const response = await send(method, path, body);
  const json: unknown = await response.json().catch(() => null);
  // Validate responses too: a contract mismatch shows up as a clear error, not a crash later.
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError('UNKNOWN', response.status, `Unexpected response shape for ${path}.`);
  }
  return parsed.data;
}

/** For endpoints that answer 204 No Content. */
async function requestNoContent(method: Method, path: string): Promise<void> {
  await send(method, path);
}

export const api = {
  getMe: (): Promise<Me> => request('GET', '/v1/me', meSchema),
  updateMe: (body: UpdateProfileInput): Promise<Me> => request('PATCH', '/v1/me', meSchema, body),
  updatePreferences: (body: UpdatePreferencesInput): Promise<Preferences> =>
    request('PATCH', '/v1/me/preferences', preferencesSchema, body),
  listTrips: (): Promise<TripList> => request('GET', '/v1/trips', tripListSchema),
  createTrip: (body: CreateTripInput): Promise<Trip> => request('POST', '/v1/trips', tripSchema, body),
  getTrip: (id: string): Promise<TripDetail> => request('GET', `/v1/trips/${id}`, tripDetailSchema),
  updateTrip: (id: string, body: UpdateTripInput): Promise<Trip> =>
    request('PATCH', `/v1/trips/${id}`, tripSchema, body),
  deleteTrip: (id: string): Promise<void> => requestNoContent('DELETE', `/v1/trips/${id}`),
  addTripPlace: (tripId: string, placeId: string): Promise<TripDetail> =>
    request('POST', `/v1/trips/${tripId}/places`, tripDetailSchema, { placeId }),
  removeTripPlace: (tripId: string, placeId: string): Promise<TripDetail> =>
    request('DELETE', `/v1/trips/${tripId}/places/${placeId}`, tripDetailSchema),
  scheduleTripPlace: (tripId: string, placeId: string, body: ScheduleTripPlaceInput): Promise<TripDetail> =>
    request('PATCH', `/v1/trips/${tripId}/places/${placeId}`, tripDetailSchema, body),
  reorderTripDay: (tripId: string, day: string, body: ReorderTripDayInput): Promise<TripDetail> =>
    request('PUT', `/v1/trips/${tripId}/days/${day}/order`, tripDetailSchema, body),

  listPlaces: (): Promise<PlaceList> => request('GET', '/v1/places', placeListSchema),
  getPlace: (id: string): Promise<Place> => request('GET', `/v1/places/${id}`, placeSchema),
  createPlace: (body: CreatePlaceInput): Promise<Place> =>
    request('POST', '/v1/places', placeSchema, body),
  updatePlace: (id: string, body: UpdatePlaceInput): Promise<Place> =>
    request('PATCH', `/v1/places/${id}`, placeSchema, body),
  deletePlace: (id: string): Promise<void> => requestNoContent('DELETE', `/v1/places/${id}`),
  saveGooglePlaces: (body: SaveGooglePlacesInput): Promise<SaveGooglePlacesResponse> =>
    request('POST', '/v1/places/google', saveGooglePlacesResponseSchema, body),

  /** Fresh Google content for display. Never persisted on the device or server. */
  getGooglePlace: (placeId: string, lang: SupportedLocale): Promise<GooglePlace> =>
    request('GET', `/v1/google/places/${encodeURIComponent(placeId)}?lang=${lang}`, googlePlaceSchema),

  interpret: (body: InterpretRequest): Promise<InterpretResponse> =>
    request('POST', '/v1/discover/interpret', interpretResponseSchema, body),
  discoverSearch: (body: DiscoverSearchRequest): Promise<DiscoverSearchResponse> =>
    request('POST', '/v1/discover/search', discoverSearchResponseSchema, body),
};
