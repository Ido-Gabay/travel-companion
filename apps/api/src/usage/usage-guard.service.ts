import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api-exception.js';
import { DatabaseService } from '../database/database.service.js';

export type UsageMetric = 'google_text_search' | 'google_place_details' | 'ai_interpret';

/**
 * Hard daily caps for paid third-party APIs, counted in Postgres so they hold
 * across restarts and instances. A call is counted *before* it is made, so a
 * failed call still counts (errs on the side of spending less).
 */
@Injectable()
export class UsageGuardService {
  private readonly logger = new Logger(UsageGuardService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Records one call, or throws DAILY_LIMIT_REACHED if today's cap is used up. */
  async consume(metric: UsageMetric, dailyCap: number): Promise<void> {
    const sql = this.db.service();
    const rows = await sql<{ count: number }[]>`
      insert into app.provider_usage (day, metric, count)
      select current_date, ${metric}, 1
      where ${dailyCap} > 0
      on conflict (day, metric) do update
        set count = app.provider_usage.count + 1
        where app.provider_usage.count < ${dailyCap}
      returning count
    `;
    if (rows.length === 0) {
      this.logger.warn(`Daily cap reached for ${metric} (${dailyCap}).`);
      throw new ApiException(
        429,
        'DAILY_LIMIT_REACHED',
        'The daily limit for this feature has been reached. It resets at midnight UTC.',
      );
    }
  }
}
