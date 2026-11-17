import { z } from 'zod';

/** Languages the app ships with. English is the default. */
export const SUPPORTED_LOCALES = ['en', 'he'] as const;
export const DEFAULT_LOCALE = 'en' satisfies SupportedLocale;

export const localeSchema = z.enum(SUPPORTED_LOCALES);
export type SupportedLocale = z.infer<typeof localeSchema>;

/** Locales written right-to-left. */
export const RTL_LOCALES: readonly SupportedLocale[] = ['he'];

export function isRtlLocale(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}
