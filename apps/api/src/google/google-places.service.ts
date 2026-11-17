import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GooglePlace, SearchPlan, SupportedLocale } from '@travel-companion/shared';
import { ApiException, notConfigured, notFound } from '../common/api-exception.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { UsageGuardService } from '../usage/usage-guard.service.js';
import {
  PLACE_DETAILS_FIELD_MASK,
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
  async searchText(plan: SearchPlan, language: SupportedLocale): Promise<GooglePlace[]> {
    const body: Record<string, unknown> = {
      textQuery: plan.textQuery,
      pageSize: TEXT_SEARCH_PAGE_SIZE,
      languageCode: language,
      ...(plan.openNow ? { openNow: true } : {}),
      ...(plan.includedType ? { includedType: plan.includedType } : {}),
    };

    let response: { places?: GoogleApiPlace[] };
    try {
      response = await this.call('google_text_search', this.config.caps.googleTextSearch, 'POST', '/places:searchText', TEXT_SEARCH_FIELD_MASK, body);
    } catch (error) {
      // An unsupported includedType is a 400; retry once as plain text search.
      if (error instanceof GoogleRequestError && error.status === 400 && plan.includedType) {
        this.logger.warn(`Text Search rejected includedType=${plan.includedType}; retrying without it.`);
        const { includedType: _dropped, ...withoutType } = body;
        response = await this.call('google_text_search', this.config.caps.googleTextSearch, 'POST', '/places:searchText', TEXT_SEARCH_FIELD_MASK, withoutType);
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
        this.config.caps.googlePlaceDetails,
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

  private async call<T>(
    metric: 'google_text_search' | 'google_place_details',
    cap: number,
    method: 'GET' | 'POST',
    path: string,
    fieldMask: string,
    body?: unknown,
  ): Promise<T> {
    const key = this.config.googlePlacesApiKey;
    if (!key) throw notConfigured('Google Places');
    await this.usage.consume(metric, cap);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': fieldMask,
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
