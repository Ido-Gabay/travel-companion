import { BadRequestException, NotFoundException } from '@nestjs/common';
import { updatePreferencesSchema } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { ApiException } from './api-exception.js';
import { toErrorResponse } from './error-response.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(updatePreferencesSchema);

  it('returns parsed data', () => {
    expect(pipe.transform({ locale: 'he' })).toEqual({ locale: 'he' });
  });

  it('throws VALIDATION_FAILED with per-field details', () => {
    try {
      pipe.transform({ locale: 'xx' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      const { status, body } = toErrorResponse(error);
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details?.[0]?.path).toBe('locale');
    }
  });
});

describe('toErrorResponse', () => {
  it('maps Nest HTTP exceptions to documented codes', () => {
    expect(toErrorResponse(new NotFoundException()).body.error.code).toBe('NOT_FOUND');
    expect(toErrorResponse(new BadRequestException('bad json')).status).toBe(400);
  });

  it('maps known Postgres errors', () => {
    const pgError = Object.assign(new Error('duplicate key'), { name: 'PostgresError', code: '23505' });
    expect(toErrorResponse(pgError)).toMatchObject({ status: 409, body: { error: { code: 'CONFLICT' } } });
  });

  it('hides unknown errors behind a generic 500', () => {
    const { status, body } = toErrorResponse(new Error('connection string with password'));
    expect(status).toBe(500);
    expect(body.error.message).toBe('Something went wrong.');
  });
});
