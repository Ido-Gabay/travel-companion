import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ApiException } from '../common/api-exception.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { RateLimiter, rateLimitClass } from './rate-limiter.js';

const WINDOW_MS = 60_000;

/**
 * Per-user request limits, after authentication (registered after AuthGuard).
 * Paid routes (Google, Claude) have a tighter limit; the daily/monthly cost
 * caps still apply on top. Public routes (health) are not limited.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = new RateLimiter();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { url?: string }>();
    const user = request.user;
    if (!user) return true;
    const kind = rateLimitClass(request.url ?? '');
    const limit = kind === 'paid' ? this.config.rateLimit.paidPerMinute : this.config.rateLimit.perMinute;
    const result = this.limiter.take(`${user.id}:${kind}`, limit, WINDOW_MS);
    if (!result.allowed) {
      throw new ApiException(429, 'RATE_LIMITED', `Too many requests. Try again in ${result.retryAfterSeconds} s.`, [
        { path: 'retryAfterSeconds', message: String(result.retryAfterSeconds) },
      ]);
    }
    return true;
  }
}
