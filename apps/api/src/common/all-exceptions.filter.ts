import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { toErrorResponse } from './error-response.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const { status, body } = toErrorResponse(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    httpAdapter.reply(ctx.getResponse(), body, status);
  }
}
