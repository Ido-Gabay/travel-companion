import { apiErrorSchema, type ApiErrorCode } from '@travel-companion/shared';

/** Error codes the app can show a message for: the API's codes plus client-side ones. */
export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'TIMEOUT' | 'UNKNOWN';

export interface ErrorDetail {
  path: string;
  message: string;
}

export class ApiClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number | null,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Builds an ApiClientError from an HTTP status and (possibly invalid) JSON body. */
export function errorFromResponse(status: number, body: unknown): ApiClientError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiClientError(code, status, message, details ?? []);
  }
  const code: ClientErrorCode =
    status === 401 ? 'UNAUTHENTICATED' : status >= 500 ? 'INTERNAL' : 'UNKNOWN';
  return new ApiClientError(code, status, `Unexpected response (HTTP ${status}).`);
}

/** Maps anything thrown by a request to a code the UI can translate. */
export function toClientErrorCode(error: unknown): ClientErrorCode {
  return error instanceof ApiClientError ? error.code : 'UNKNOWN';
}

/** Client errors (4xx) won't succeed on retry; network and server errors might. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return true;
  if (
    error.code === 'DAILY_LIMIT_REACHED' ||
    error.code === 'MONTHLY_LIMIT_REACHED' ||
    error.code === 'NOT_CONFIGURED'
  ) {
    return false;
  }
  if (error.status === null) return true;
  return error.status >= 500 || error.status === 429;
}
