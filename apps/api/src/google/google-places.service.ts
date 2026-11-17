import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  GooglePhotoMedia,
  GooglePlace,
  GooglePlacePreview,
  SearchArea,
  SearchPlan,
  SupportedLocale,
} from '@travel-companion/shared';
import { ApiException, notConfigured, notFound } from '../common/api-exception.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { UsageGuardService, type UsageMetric } from '../usage/usage-guard.service.js';
import {
  basicPreview,
  buildTextSearchBody,
  PLACE_DETAILS_FIELD_MASK,
  PLACE_PREVIEW_FIELD_MASK,
  toGooglePlacePreview,
  TEXT_SEARCH_FIELD_MASK,
  toGooglePlace,
  type GoogleApiPlace,
} from './google-places.mapper.js';

const BASE_URL = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 10_000;
export const TEXT_SEARCH_PAGE_SIZE = 15;

class GoogleRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Google Places returned HTTP ${status}`);
  }
}

/**
 * The only code that talks to Google Places API (New). The server key never
 * leaves the backend. Results are returned for display and never stored.
 */
@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly usage: UsageGuardService,
  ) {}

  get configured(): boolean {
    return this.config.googlePlacesApiKey !== null;
  }

  /** Text Search (New), Pro fields only. Permanently closed places are dropped. */
  async searchText(plan: SearchPlan, language: SupportedLocale, area?: SearchArea): Promise<GooglePlace[]> {
    const body = buildTextSearchBody(plan, language, TEXT_SEARCH_PAGE_SIZE, area);

    let response: { places?: GoogleApiPlace[] };
    try {
      response = await this.call('google_text_search', 'POST', '/places:searchText', TEXT_SEARCH_FIELD_MASK, body);
    } catch (error) {
      // An unsupported includedType is a 400; retry once as plain text search.
      if (error instanceof GoogleRequestError && error.status === 400 && plan.includedType) {
        this.logger.warn(`Text Search rejected includedType=${plan.includedType}; retrying without it.`);
        const { includedType: _dropped, ...withoutType } = body;
        response = await this.call('google_text_search', 'POST', '/places:searchText', TEXT_SEARCH_FIELD_MASK, withoutType);
      } else {
        throw this.toApiError(error);
      }
    }

    return (response.places ?? [])
      .map(toGooglePlace)
      .filter((place): place is GooglePlace => place !== null)
      .filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY');
  }

  /** Place Details (New), Pro fields only. Fresh on every call (no caching, per Google terms). */
  async getPlace(placeId: string, language: SupportedLocale): Promise<GooglePlace> {
    let raw: GoogleApiPlace;
    try {
      raw = await this.call(
        'google_place_details',
        'GET',
        `/places/${encodeURIComponent(placeId)}?languageCode=${language}`,
        PLACE_DETAILS_FIELD_MASK,
      );
    } catch (error) {
      if (error instanceof GoogleRequestError && (error.status === 404 || error.status === 400)) {
        throw notFound('Google no longer has this place.');
      }
      throw this.toApiError(error);
    }
    const place = toGooglePlace(raw);
    if (!place) throw notFound('Google returned no usable details for this place.');
    return place;
  }

  /**
   * Preview for one place: rating, opening hours and photo list on top of the
   * basic fields. When the preview cap is used up it quietly falls back to the
   * basic (Pro) details, marked detail "basic".
   */
  async getPreview(placeId: string, language: SupportedLocale): Promise<GooglePlacePreview> {
    let raw: GoogleApiPlace;
    try {
      raw = await this.call(
        'google_place_preview',
        'GET',
        `/places/${encodeURIComponent(placeId)}?languageCode=${language}`,
        PLACE_PREVIEW_FIELD_MASK,
      );
    } catch (error) {
      if (error instanceof ApiException && (error.code === 'DAILY_LIMIT_REACHED' || error.code === 'MONTHLY_LIMIT_REACHED')) {
        return basicPreview(await this.getPlace(placeId, language));
      }
      if (error instanceof GoogleRequestError && (error.status === 404 || error.status === 400)) {
        throw notFound('Google no longer has this place.');
      }
      throw this.toApiError(error);
    }
    const preview = toGooglePlacePreview(raw);
    if (!preview) throw notFound('Google returned no usable details for this place.');
    return preview;
  }

  /**
   * A short-lived image URL for one photo (Place Details Photos SKU, one call
   * per photo). The URL has no API key in it, so the app loads it directly.
   */
  async getPhoto(photoName: string, maxWidthPx: number): Promise<GooglePhotoMedia> {
    let response: { photoUri?: string };
    try {
      response = await this.call(
        'google_place_photo',
        'GET',
        `/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`,
        null,
      );
    } catch (error) {
      if (error instanceof GoogleRequestError && (error.status === 404 || error.status === 400)) {
        throw notFound('Google no longer has this photo.');
      }
      throw this.toApiError(error);
    }
    if (!response.photoUri?.startsWith('https://')) {
      throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'Google returned no photo.');
    }
    return { uri: response.photoUri };
  }

  private async call<T>(
    metric: Extract<UsageMetric, `google_${string}`>,
    method: 'GET' | 'POST',
    path: string,
    fieldMask: string | null,
    body?: unknown,
  ): Promise<T> {
    const key = this.config.googlePlacesApiKey;
    if (!key) throw notConfigured('Google Places');
    await this.usage.consume(metric);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'X-Goog-Api-Key': key,
          ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Google Places request failed: ${String(error)}`);
      throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'Google Places is not reachable right now.');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GoogleRequestError(response.status, text.slice(0, 500));
    }
    return (await response.json()) as T;
  }

  private toApiError(error: unknown): unknown {
    if (!(error instanceof GoogleRequestError)) return error;
    // Never forward Google's error body (it can echo request details); log it instead.
    this.logger.error(`Google Places error ${error.status}: ${error.body}`);
    if (error.status === 429) {
      return new ApiException(429, 'RATE_LIMITED', 'Google Places is busy. Try again in a minute.');
    }
    return new ApiException(503, 'SERVICE_UNAVAILABLE', 'Google Places could not complete the request.');
  }
}
