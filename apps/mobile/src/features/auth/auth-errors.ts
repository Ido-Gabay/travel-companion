/** Translation keys for sign-in / sign-up failures. */
export type AuthErrorKey =
  | 'auth.invalidCredentials'
  | 'auth.emailNotConfirmed'
  | 'auth.userExists'
  | 'auth.weakPassword'
  | 'auth.invalidEmail'
  | 'errors.RATE_LIMITED'
  | 'errors.NETWORK'
  | 'errors.UNKNOWN';

interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
}

/** Maps a Supabase Auth error (by its stable `code`) to a message key. */
export function authErrorKey(error: AuthErrorLike): AuthErrorKey {
  switch (error.code) {
    case 'invalid_credentials':
      return 'auth.invalidCredentials';
    case 'email_not_confirmed':
      return 'auth.emailNotConfirmed';
    case 'user_already_exists':
    case 'email_exists':
      return 'auth.userExists';
    case 'weak_password':
      return 'auth.weakPassword';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'auth.invalidEmail';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'errors.RATE_LIMITED';
    default:
      break;
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'errors.NETWORK';
  if (error.status === 429) return 'errors.RATE_LIMITED';
  return 'errors.UNKNOWN';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email.trim());
}

export const PASSWORD_MIN = 8;
