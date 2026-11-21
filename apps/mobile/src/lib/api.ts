import {
  discoverSearchResponseSchema,
  googlePhotoMediaSchema,
  googlePlacePreviewSchema,
  googlePlaceSchema,
  usageReportSchema,
  routeLegsResponseSchema,
  type RouteLegsRequest,
  type RouteLegsResponse,
  interpretResponseSchema,
  tripAssistantResponseSchema,
  type TripAssistantRequest,
  type TripAssistantResponse,
  extractPlacesResponseSchema,
  type ExtractPlacesRequest,
  type ExtractPlacesResponse,
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
  type GooglePhotoMedia,
  type GooglePlace,
  type GooglePlacePreview,
  type UsageReport,
  type InterpretRequest,
  type InterpretResponse,
  type SaveGooglePlacesInput,
  type LinkGooglePlaceInput,
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
  journalDaySchema,
  tripJournalSchema,
  type JournalDay,
  type TripJournal,
  type UpdateJournalDayInput,
  placeVisitListSchema,
  stayWriteResponseSchema,
  stopWriteResponseSchema,
  timeZoneSuggestionSchema,
  tripDetailV2Schema,
  tripV2Schema,
  type AddStopInput,
  type AddTripMemberInput,
  type CreateStayInput,
  type PlaceVisitList,
  type StayWriteResponse,
  type StopTransition,
  type StopWriteResponse,
  type TimeZoneSuggestion,
  type TripDetailV2,
  type TripV2,
  type UpdateStayInput,
  type UpdateStopInput,
  type UpdateTripV2Input,
} from '@travel-companion/shared';
import type { z } from 'zod';
import { reportReachable, reportUnreachable } from '@/features/offline/connection';
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
  void pingApi();
}

/** Public health check; true when the server answered. Updates the connection state. */
export async function pingApi(): Promise<boolean> {
  if (!envResult.ok) return false;
  try {
    await fetch(`${envResult.env.apiUrl}/health`);
    reportReachable();
    return true;
  } catch {
    reportUnreachable();
    return false;
  }
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
    reportUnreachable();
    throw new ApiClientError(
      aborted ? 'TIMEOUT' : 'NETWORK',
      null,
      aborted ? 'Request timed out.' : 'Network request failed.',
    );
  } finally {
    clearTimeout(timer);
  }

  // Any answer from the server (even an error) means it is reachable.
  reportReachable();
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
  getJournal: (tripId: string): Promise<TripJournal> =>
    request('GET', `/v1/trips/${tripId}/journal`, tripJournalSchema),
  updateJournalDay: (tripId: string, day: string, body: UpdateJournalDayInput): Promise<JournalDay> =>
    request('PUT', `/v1/trips/${tripId}/journal/${day}`, journalDaySchema, body),

  // D1 · API v2: saved places, visits, stays.
  getTripV2: (id: string): Promise<TripDetailV2> => request('GET', `/v2/trips/${id}`, tripDetailV2Schema),
  updateTripV2: (id: string, body: UpdateTripV2Input): Promise<TripV2> =>
    request('PATCH', `/v2/trips/${id}`, tripV2Schema, body),
  deleteTripV2: (id: string, deleteHistory: boolean): Promise<void> =>
    requestNoContent('DELETE', `/v2/trips/${id}${deleteHistory ? '?deleteHistory=1' : ''}`),
  addTripMember: (tripId: string, body: AddTripMemberInput): Promise<TripDetailV2> =>
    request('POST', `/v2/trips/${tripId}/places`, tripDetailV2Schema, body),
  removeTripMember: (tripId: string, tripPlaceId: string): Promise<TripDetailV2> =>
    request('DELETE', `/v2/trips/${tripId}/places/${tripPlaceId}`, tripDetailV2Schema),
  addStop: (tripId: string, body: AddStopInput): Promise<StopWriteResponse> =>
    request('POST', `/v2/trips/${tripId}/stops`, stopWriteResponseSchema, body),
  updateStop: (tripId: string, stopId: string, body: UpdateStopInput): Promise<StopWriteResponse> =>
    request('PATCH', `/v2/trips/${tripId}/stops/${stopId}`, stopWriteResponseSchema, body),
  transitionStop: (tripId: string, stopId: string, action: StopTransition, at: string | null): Promise<StopWriteResponse> =>
    request('POST', `/v2/trips/${tripId}/stops/${stopId}/${action}`, stopWriteResponseSchema, at ? { at } : {}),
  removeStop: (tripId: string, stopId: string, confirm: boolean): Promise<TripDetailV2> =>
    request('DELETE', `/v2/trips/${tripId}/stops/${stopId}${confirm ? '?confirm=1' : ''}`, tripDetailV2Schema),
  reorderStops: (tripId: string, day: string, stopIds: string[]): Promise<TripDetailV2> =>
    request('PUT', `/v2/trips/${tripId}/days/${day}/order`, tripDetailV2Schema, { stopIds }),
  addStay: (tripId: string, body: CreateStayInput): Promise<StayWriteResponse> =>
    request('POST', `/v2/trips/${tripId}/stays`, stayWriteResponseSchema, body),
  updateStay: (tripId: string, stayId: string, body: UpdateStayInput): Promise<StayWriteResponse> =>
    request('PATCH', `/v2/trips/${tripId}/stays/${stayId}`, stayWriteResponseSchema, body),
  removeStay: (tripId: string, stayId: string): Promise<TripDetailV2> =>
    request('DELETE', `/v2/trips/${tripId}/stays/${stayId}`, tripDetailV2Schema),
  getPlaceVisits: (placeId: string): Promise<PlaceVisitList> =>
    request('GET', `/v1/places/${placeId}/visits`, placeVisitListSchema),
  lookupTimeZone: (latitude: number, longitude: number): Promise<TimeZoneSuggestion> =>
    request('POST', '/v1/timezones/lookup', timeZoneSuggestionSchema, { latitude, longitude }),

  listPlaces: (): Promise<PlaceList> => request('GET', '/v1/places', placeListSchema),
  getPlace: (id: string): Promise<Place> => request('GET', `/v1/places/${id}`, placeSchema),
  createPlace: (body: CreatePlaceInput): Promise<Place> =>
    request('POST', '/v1/places', placeSchema, body),
  updatePlace: (id: string, body: UpdatePlaceInput): Promise<Place> =>
    request('PATCH', `/v1/places/${id}`, placeSchema, body),
  deletePlace: (id: string): Promise<void> => requestNoContent('DELETE', `/v1/places/${id}`),
  saveGooglePlaces: (body: SaveGooglePlacesInput): Promise<SaveGooglePlacesResponse> =>
    request('POST', '/v1/places/google', saveGooglePlacesResponseSchema, body),
  linkGooglePlace: (id: string, body: LinkGooglePlaceInput): Promise<Place> =>
    request('POST', `/v1/places/${id}/google`, placeSchema, body),

  /** Fresh Google content for display. Never persisted on the device or server. */
  getGooglePlace: (placeId: string, lang: SupportedLocale): Promise<GooglePlace> =>
    request('GET', `/v1/google/places/${encodeURIComponent(placeId)}?lang=${lang}`, googlePlaceSchema),
  /** Rating, opening hours and photo list (capped on the server; falls back to basic). */
  getGooglePlacePreview: (placeId: string, lang: SupportedLocale): Promise<GooglePlacePreview> =>
    request(
      'GET',
      `/v1/google/places/${encodeURIComponent(placeId)}/preview?lang=${lang}`,
      googlePlacePreviewSchema,
    ),
  /** A short-lived image URL for one photo. Each call is billed by Google (capped). */
  getGooglePhoto: (name: string, maxWidth: number): Promise<GooglePhotoMedia> =>
    request('GET', `/v1/google/photos?name=${encodeURIComponent(name)}&maxWidth=${maxWidth}`, googlePhotoMediaSchema),
  getUsage: (): Promise<UsageReport> => request('GET', '/v1/usage', usageReportSchema),
  /** M16: real travel times (Google Routes, capped on the server). Never stored. */
  computeRoutes: (body: RouteLegsRequest, lang: SupportedLocale): Promise<RouteLegsResponse> =>
    request('POST', `/v1/google/routes?lang=${lang}`, routeLegsResponseSchema, body),

  /** D1 trip assistant: the user's words → planning instructions (or one question, or "unavailable"). */
  tripAssistant: (body: TripAssistantRequest): Promise<TripAssistantResponse> =>
    request('POST', '/v1/assistant/trip', tripAssistantResponseSchema, body),
  extractPlaces: (body: ExtractPlacesRequest): Promise<ExtractPlacesResponse> =>
    request('POST', '/v1/assistant/extract-places', extractPlacesResponseSchema, body),
  interpret: (body: InterpretRequest): Promise<InterpretResponse> =>
    request('POST', '/v1/discover/interpret', interpretResponseSchema, body),
  discoverSearch: (body: DiscoverSearchRequest): Promise<DiscoverSearchResponse> =>
    request('POST', '/v1/discover/search', discoverSearchResponseSchema, body),
};
