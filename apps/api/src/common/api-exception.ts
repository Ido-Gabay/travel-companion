import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from '@travel-companion/shared';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** An HTTP error with a stable, documented error code (see docs/API.md). */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message, status);
  }
}

export const unauthenticated = (message = 'Authentication required.') =>
  new ApiException(401, 'UNAUTHENTICATED', message);

export const notFound = (message = 'Not found.') => new ApiException(404, 'NOT_FOUND', message);
