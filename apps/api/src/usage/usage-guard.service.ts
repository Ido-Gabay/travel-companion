import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  estimatedCostUsd,
  PROVIDER_PRICING,
  USAGE_METRICS,
  type UsageMetric,
  type UsageReport,
} from '@travel-companion/shared';
import { ApiException } from '../common/api-exception.js';
import { APP_CONFIG, type AppConfig, type UsageCap } from '../config/app-config.js';
import { DatabaseService } from '../database/database.service.js';

export type { UsageMetric };

/**
 * Hard daily and monthly caps for paid third-party APIs, counted in Postgres
 * so they hold across restarts and instances. A call is counted *before* it is
 * made, so a failed call still counts (errs on the side of spending less).
 * Days and months are UTC.
 */
@Injectable()
export class UsageGuardService {
  private readonly logger = new Logger(UsageGuardService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Records one call, or throws DAILY_/MONTHLY_LIMIT_REACHED when a cap is used up. */
  async consume(metric: UsageMetric, cap: UsageCap = this.config.caps[metric]): Promise<void> {
    const sql = this.db.service();
    const [month] = await sql<{ total: number }[]>`
      select coalesce(sum(count), 0)::int as total
      from app.provider_usage
      where metric = ${metric} and day >= date_trunc('month', current_date)::date
    `;
    if ((month?.total ?? 0) >= cap.monthly) {
      this.logger.warn(`Monthly cap reached for ${metric} (${cap.monthly}).`);
      throw new ApiException(
        429,
        'MONTHLY_LIMIT_REACHED',
        "This month's limit for this feature has been reached. It resets on the 1st (UTC).",
      );
    }

    const rows = await sql<{ count: number }[]>`
      insert into app.provider_usage (day, metric, count)
      select current_date, ${metric}, 1
      where ${cap.daily} > 0
      on conflict (day, metric) do update
        set count = app.provider_usage.count + 1
        where app.provider_usage.count < ${cap.daily}
      returning count
    `;
    if (rows.length === 0) {
      this.logger.warn(`Daily cap reached for ${metric} (${cap.daily}).`);
      throw new ApiException(
        429,
        'DAILY_LIMIT_REACHED',
        'The daily limit for this feature has been reached. It resets at midnight UTC.',
      );
    }
  }

  /** Today's and this month's counts per metric, with caps, free allowance and estimated cost. */
  async report(): Promise<UsageReport> {
    const sql = this.db.service();
    const rows = await sql<{ metric: string; today: number; month: number; day: string; month_label: string }[]>`
      select m.metric,
        coalesce(sum(u.count) filter (where u.day = current_date), 0)::int as today,
        coalesce(sum(u.count), 0)::int as month,
        current_date::text as day,
        to_char(current_date, 'YYYY-MM') as month_label
      from unnest(${sql.array([...USAGE_METRICS])}::text[]) as m(metric)
      left join app.provider_usage u
        on u.metric = m.metric and u.day >= date_trunc('month', current_date)::date
      group by m.metric
    `;
    const byMetric = new Map(rows.map((row) => [row.metric, row]));
    const first = rows[0];
    return {
      day: first?.day ?? new Date().toISOString().slice(0, 10),
      month: first?.month_label ?? new Date().toISOString().slice(0, 7),
      items: USAGE_METRICS.map((metric) => {
        const row = byMetric.get(metric);
        const month = row?.month ?? 0;
        const pricing = PROVIDER_PRICING[metric];
        return {
          metric,
          sku: pricing.sku,
          today: row?.today ?? 0,
          month,
          dailyCap: this.config.caps[metric].daily,
          monthlyCap: this.config.caps[metric].monthly,
          freePerMonth: pricing.freePerMonth,
          usdPer1000: pricing.usdPer1000,
          estimatedCostUsd: estimatedCostUsd(metric, month),
        };
      }),
    };
  }
}
