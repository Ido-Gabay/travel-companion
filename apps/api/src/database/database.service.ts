import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import type { AuthUser } from '../auth/auth.types.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export type Tx = TransactionSql;

/**
 * Owns the Postgres connection pool.
 *
 * All user data access goes through `asUser`, which runs the work in one
 * transaction as the `authenticated` role with the caller's claims set. That
 * makes the RLS policies in supabase/migrations apply to API queries too, so a
 * bug in a WHERE clause cannot leak another user's rows.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly sql: Sql;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.sql = postgres(config.databaseUrl, {
      ssl: config.databaseSsl === 'require' ? 'require' : false,
      max: config.databasePoolMax,
      // Prepared statements are not supported by Supabase's transaction pooler.
      // Disabling them keeps either pooler mode working.
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: { application_name: 'travel-companion-api' },
    });
  }

  async asUser<T>(user: AuthUser, work: (tx: Tx) => Promise<T>): Promise<T> {
    const claims = JSON.stringify({ sub: user.id, role: 'authenticated', email: user.email });
    const result = await this.sql.begin(async (tx) => {
      await tx`
        select
          set_config('request.jwt.claims', ${claims}, true),
          set_config('request.jwt.claim.sub', ${user.id}, true)
      `;
      await tx`set local role authenticated`;
      return work(tx);
    });
    // postgres.js types the result as UnwrapPromiseArray<T>; for our callers it is T.
    return result as unknown as T;
  }

  /**
   * Runs SQL as the API's own database role (not as a user). Only for
   * service tables with no user data, such as app.provider_usage.
   */
  service(): Sql {
    return this.sql;
  }

  /** Readiness probe: fails if the database is unreachable. */
  async ping(): Promise<void> {
    await this.sql`select 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
