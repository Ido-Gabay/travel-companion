import { z } from 'zod';

/**
 * Public configuration compiled into the app from apps/mobile/.env.
 * Expo only inlines variables that are referenced literally as
 * process.env.EXPO_PUBLIC_*, so each one is read by name below.
 */
const envSchema = z.object({
  supabaseUrl: z.url({ protocol: /^https$/ }),
  supabasePublishableKey: z
    .string()
    .min(20)
    .refine((key) => !key.startsWith('sb_secret_'), 'A secret key must never be used in the app.'),
  apiUrl: z.url({ protocol: /^https?$/ }),
});

export type AppEnv = z.infer<typeof envSchema>;

export type EnvResult = { ok: true; env: AppEnv } | { ok: false; problems: string[] };

export function readEnv(): EnvResult {
  const result = envSchema.safeParse({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, ''),
  });
  if (result.success) return { ok: true, env: result.data };

  const names: Record<string, string> = {
    supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
    supabasePublishableKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    apiUrl: 'EXPO_PUBLIC_API_URL',
  };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => {
      const key = String(issue.path[0] ?? '');
      return `${names[key] ?? key}: ${issue.message}`;
    }),
  };
}

export const envResult = readEnv();
