import { describe, expect, it } from 'vitest';
import { authErrorKey, isValidEmail } from './auth-errors';

describe('authErrorKey', () => {
  it('maps Supabase error codes', () => {
    expect(authErrorKey({ code: 'invalid_credentials', status: 400 })).toBe('auth.invalidCredentials');
    expect(authErrorKey({ code: 'user_already_exists', status: 422 })).toBe('auth.userExists');
    expect(authErrorKey({ code: 'over_email_send_rate_limit', status: 429 })).toBe('errors.RATE_LIMITED');
  });

  it('treats fetch failures as network errors', () => {
    expect(authErrorKey({ name: 'AuthRetryableFetchError', status: 0 })).toBe('errors.NETWORK');
  });

  it('falls back to a generic message', () => {
    expect(authErrorKey({ code: 'something_new', status: 500 })).toBe('errors.UNKNOWN');
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(isValidEmail(' traveler@example.com ')).toBe(true);
    expect(isValidEmail('traveler@')).toBe(false);
    expect(isValidEmail('no at sign')).toBe(false);
  });
});
