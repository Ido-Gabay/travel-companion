import { z } from 'zod';

/**
 * Every non-2xx API response has this body. `code` is stable and meant for
 * programmatic handling; `message` is English, for logs and developers.
 * The app shows its own translated text based on `code`.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'DAILY_LIMIT_REACHED',
  'MONTHLY_LIMIT_REACHED',
  'NOT_CONFIGURED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
  // D1 (API v2 only; v1 endpoints never return these, so installed apps keep parsing every error).
  'INVALID_TRANSITION',
  'STAY_OVERLAP',
  'STOPS_OUTSIDE_DATES',
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
