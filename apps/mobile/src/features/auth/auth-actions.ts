import { requireSupabase } from '@/lib/supabase';
import { authErrorKey, type AuthErrorKey } from './auth-errors';

export type SignUpResult = { status: 'signed-in' } | { status: 'confirm-email' };

export class AuthActionError extends Error {
  constructor(readonly key: AuthErrorKey) {
    super(key);
    this.name = 'AuthActionError';
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new AuthActionError(authErrorKey(error));
}

export async function signUp(
  email: string,
  password: string,
  displayName: string | null,
): Promise<SignUpResult> {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    // Read by the database sign-up trigger to fill app.profiles.display_name.
    options: displayName ? { data: { display_name: displayName } } : undefined,
  });
  if (error) throw new AuthActionError(authErrorKey(error));
  // With "Confirm email" on, Supabase returns no session until the link is opened.
  return data.session ? { status: 'signed-in' } : { status: 'confirm-email' };
}

export async function signOut(): Promise<void> {
  // Local scope: ends this device's session even when offline.
  await requireSupabase().auth.signOut({ scope: 'local' });
}
