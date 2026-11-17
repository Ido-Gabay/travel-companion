import { z } from 'zod';

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
  };
}
