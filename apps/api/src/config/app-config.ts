import type { UsageMetric } from '@travel-companion/shared';
import { z } from 'zod';

export interface UsageCap {
  daily: number;
  monthly: number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// connection string'),
  DATABASE_SSL: z.enum(['require', 'disable']).default('require'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  JWT_AUDIENCE: z.string().min(1).default('authenticated'),

  // Optional integrations. Without a key the feature answers NOT_CONFIGURED.
  GOOGLE_PLACES_API_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  AI_MODEL: z.string().min(1).default('claude-haiku-5-5'),

  // Caps that keep paid APIs inside Google's free monthly allowances (see
  // packages/shared/src/usage.ts and docs/GOOGLE_AND_AI.md). Daily caps spread
  // usage; monthly caps stay below the free allowance with a safety margin.
  // Text Search Pro and Place Details Pro: 5,000 free/month each.
  GOOGLE_TEXT_SEARCH_DAILY_CAP: z.coerce.number().int().min(0).default(160),
  GOOGLE_TEXT_SEARCH_MONTHLY_CAP: z.coerce.number().int().min(0).default(4500),
  GOOGLE_PLACE_DETAILS_DAILY_CAP: z.coerce.number().int().min(0).default(160),
  GOOGLE_PLACE_DETAILS_MONTHLY_CAP: z.coerce.number().int().min(0).default(4500),
  // Place preview (Place Details Enterprise: rating, hours) and photos: 1,000 free/month each.
  GOOGLE_PLACE_PREVIEW_DAILY_CAP: z.coerce.number().int().min(0).default(30),
  GOOGLE_PLACE_PREVIEW_MONTHLY_CAP: z.coerce.number().int().min(0).default(900),
  GOOGLE_PLACE_PHOTO_DAILY_CAP: z.coerce.number().int().min(0).default(60),
  GOOGLE_PLACE_PHOTO_MONTHLY_CAP: z.coerce.number().int().min(0).default(900),
  // Claude is paid per token (no free allowance); caps bound the spend.
  AI_DAILY_CAP: z.coerce.number().int().min(0).default(300),
  AI_MONTHLY_CAP: z.coerce.number().int().min(0).default(3000),

  // Per-user request limits per minute (abuse protection; cost caps still apply).
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(240),
  RATE_LIMIT_PAID_PER_MINUTE: z.coerce.number().int().min(1).default(60),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  supabaseUrl: string;
  jwtIssuer: string;
  jwksUrl: string;
  jwtAudience: string;
  databaseUrl: string;
  databaseSsl: 'require' | 'disable';
  databasePoolMax: number;
  googlePlacesApiKey: string | null;
  anthropicApiKey: string | null;
  aiModel: string;
  /** Daily and monthly call caps per paid metric. */
  caps: Record<UsageMetric, UsageCap>;
  /** Requests per user per minute: all routes, and Google/Claude routes. */
  rateLimit: { perMinute: number; paidPerMinute: number };
}

/**
 * Validates environment variables once at startup. A bad value stops the
 * process with a readable list of problems instead of failing later.
 * Secret values are never included in the error message.
 */
export function parseAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const e = result.data;
  const supabaseUrl = e.SUPABASE_URL.replace(/\/+$/, '');
  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    supabaseUrl,
    jwtIssuer: `${supabaseUrl}/auth/v1`,
    jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    jwtAudience: e.JWT_AUDIENCE,
    databaseUrl: e.DATABASE_URL,
    databaseSsl: e.DATABASE_SSL,
    databasePoolMax: e.DATABASE_POOL_MAX,
    googlePlacesApiKey: e.GOOGLE_PLACES_API_KEY ?? null,
    anthropicApiKey: e.ANTHROPIC_API_KEY ?? null,
    aiModel: e.AI_MODEL,
    caps: {
      google_text_search: { daily: e.GOOGLE_TEXT_SEARCH_DAILY_CAP, monthly: e.GOOGLE_TEXT_SEARCH_MONTHLY_CAP },
      google_place_details: { daily: e.GOOGLE_PLACE_DETAILS_DAILY_CAP, monthly: e.GOOGLE_PLACE_DETAILS_MONTHLY_CAP },
      google_place_preview: { daily: e.GOOGLE_PLACE_PREVIEW_DAILY_CAP, monthly: e.GOOGLE_PLACE_PREVIEW_MONTHLY_CAP },
      google_place_photo: { daily: e.GOOGLE_PLACE_PHOTO_DAILY_CAP, monthly: e.GOOGLE_PLACE_PHOTO_MONTHLY_CAP },
      ai_interpret: { daily: e.AI_DAILY_CAP, monthly: e.AI_MONTHLY_CAP },
    },
    rateLimit: { perMinute: e.RATE_LIMIT_PER_MINUTE, paidPerMinute: e.RATE_LIMIT_PAID_PER_MINUTE },
  };
}
