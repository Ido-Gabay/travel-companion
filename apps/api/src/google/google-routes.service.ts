import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RouteLeg, RouteLegRequest, RouteLegsResponse, SupportedLocale } from '@travel-companion/shared';
import { ApiException, notConfigured } from '../common/api-exception.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { UsageGuardService } from '../usage/usage-guard.service.js';
import { buildComputeRoutesBody, ROUTES_FIELD_MASK, toRouteLeg, type GoogleRoutesResponse } from './google-routes.mapper.js';

const URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 10_000;

/**
 * The only code that calls Google Routes API (M16). One Compute Routes
 * request per leg, Essentials SKU only, counted against the `google_routes`
 * caps before each call. Results are returned for display, never stored.
 */
@Injectable()
export class GoogleRoutesService {
  private readonly logger = new Logger(GoogleRoutesService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly usage: UsageGuardService,
  ) {}

  /** Legs in order; a leg without a route is null. Stops calling Google once a cap is reached. */
  async computeLegs(legs: readonly RouteLegRequest[], language: SupportedLocale): Promise<RouteLegsResponse> {
    const key = this.config.googleRoutesApiKey;
    if (!key) throw notConfigured('Google Routes');
    const result: (RouteLeg | null)[] = [];
    let limited = false;
    for (const leg of legs) {
      if (limited) {
        result.push(null);
        continue;
      }
      try {
        await this.usage.consume('google_routes');
      } catch (error) {
        if (error instanceof ApiException && error.getStatus() === 429) {
          limited = true;
          result.push(null);
          continue;
        }
        throw error;
      }
      result.push(await this.computeOne(key, leg, language));
    }
    return { legs: result, limited };
  }

  private async computeOne(key: string, leg: RouteLegRequest, language: SupportedLocale): Promise<RouteLeg | null> {
    try {
      const response = await fetch(URL, {
        method: 'POST',
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': ROUTES_FIELD_MASK, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildComputeRoutesBody(leg, Date.now(), language)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        // Never forward Google's error body; log it. The app falls back to its estimate.
        const text = await response.text().catch(() => '');
        this.logger.error(`Google Routes error ${response.status}: ${text.slice(0, 300)}`);
        return null;
      }
      return toRouteLeg((await response.json()) as GoogleRoutesResponse, leg.mode);
    } catch (error) {
      this.logger.error(`Google Routes request failed: ${String(error)}`);
      return null;
    }
  }
}
