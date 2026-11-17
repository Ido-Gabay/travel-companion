import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from './api-exception.js';

/**
 * Validates and normalizes a request value with a shared zod schema.
 * Usage: `@Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput`
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new ApiException(
      400,
      'VALIDATION_FAILED',
      'Request validation failed.',
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
}
