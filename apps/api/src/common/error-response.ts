import { HttpException } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@travel-companion/shared';
import { ApiException } from './api-exception.js';

export interface ErrorResponse {
  status: number;
  body: ApiError;
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION_FAILED',
  415: 'VALIDATION_FAILED',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Postgres SQLSTATE codes we translate instead of reporting a 500. */
const POSTGRES_ERRORS: Record<string, { status: number; code: ApiErrorCode; message: string }> = {
  '23505': { status: 409, code: 'CONFLICT', message: 'This record already exists.' },
  '23514': { status: 400, code: 'VALIDATION_FAILED', message: 'A value is out of range.' },
  '22001': { status: 400, code: 'VALIDATION_FAILED', message: 'A value is too long.' },
  '22P02': { status: 400, code: 'VALIDATION_FAILED', message: 'A value has the wrong format.' },
  '42501': { status: 403, code: 'FORBIDDEN', message: 'Not allowed.' },
};

function postgresCode(exception: unknown): string | undefined {
  if (
    exception instanceof Error &&
    exception.name === 'PostgresError' &&
    'code' in exception &&
    typeof exception.code === 'string'
  ) {
    return exception.code;
  }
  return undefined;
}

/**
 * Turns any thrown value into the documented error body. Unknown errors become
 * a generic 500 so internal details never reach the client.
 */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof ApiException) {
    return {
      status: exception.getStatus(),
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      body: {
        error: {
          code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED'),
          message: exception.message,
        },
      },
    };
  }

  const pgCode = postgresCode(exception);
  const mapped = pgCode ? POSTGRES_ERRORS[pgCode] : undefined;
  if (mapped) {
    return { status: mapped.status, body: { error: { code: mapped.code, message: mapped.message } } };
  }

  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Something went wrong.' } },
  };
}
