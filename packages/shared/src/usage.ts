import { z } from 'zod';

/** Paid third-party calls the API counts and caps. */
export const USAGE_METRICS = [
  'google_text_search',
  'google_place_details',
  'google_place_preview',
  'google_place_photo',
  'google_routes',
  'ai_interpret',
] as const;
export const usageMetricSchema = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof usageMetricSchema>;

/**
 * Google Maps Platform SKUs behind each metric, from Google's official price
 * list (checked 2026-11-17). Free usage is per SKU, per month, per billing
 * account; prices are USD per 1,000 calls for the first volume tier.
 * https://developers.google.com/maps/billing-and-pricing/pricing
 */
export const PROVIDER_PRICING: Record<UsageMetric, { sku: string; freePerMonth: number | null; usdPer1000: number | null }> = {
  google_text_search: { sku: 'Places API Text Search Pro', freePerMonth: 5000, usdPer1000: 32 },
  google_place_details: { sku: 'Places API Place Details Pro', freePerMonth: 5000, usdPer1000: 17 },
  google_place_preview: { sku: 'Places API Place Details Enterprise', freePerMonth: 1000, usdPer1000: 20 },
  google_place_photo: { sku: 'Places API Place Details Photos', freePerMonth: 1000, usdPer1000: 7 },
  // M16: Routes API Compute Routes, Essentials only (no traffic, no waypoint optimization).
  google_routes: { sku: 'Routes: Compute Routes Essentials', freePerMonth: 10000, usdPer1000: 5 },
  // Anthropic bills per token, with no free allowance; the cap limits calls.
  ai_interpret: { sku: 'Claude Haiku 5.5 (per token)', freePerMonth: null, usdPer1000: null },
};

/** Cost above the free allowance, in USD (0 while inside it). Null when not priced per call. */
export function estimatedCostUsd(metric: UsageMetric, monthCount: number): number | null {
  const pricing = PROVIDER_PRICING[metric];
  if (pricing.freePerMonth === null || pricing.usdPer1000 === null) return null;
  const billable = Math.max(0, monthCount - pricing.freePerMonth);
  return Math.round((billable / 1000) * pricing.usdPer1000 * 100) / 100;
}

export const usageItemSchema = z.object({
  metric: usageMetricSchema,
  sku: z.string(),
  today: z.number().int().nonnegative(),
  month: z.number().int().nonnegative(),
  dailyCap: z.number().int().nonnegative(),
  monthlyCap: z.number().int().nonnegative(),
  freePerMonth: z.number().int().nullable(),
  usdPer1000: z.number().nullable(),
  estimatedCostUsd: z.number().nullable(),
});
export type UsageItem = z.infer<typeof usageItemSchema>;

/** Response of GET /v1/usage. Counts are this API's own (UTC days and months). */
export const usageReportSchema = z.object({
  day: z.iso.date(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  items: z.array(usageItemSchema),
});
export type UsageReport = z.infer<typeof usageReportSchema>;
