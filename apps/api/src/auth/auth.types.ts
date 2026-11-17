/** The signed-in caller, taken from a verified Supabase access token. */
export interface AuthUser {
  /** Supabase auth user id (JWT `sub`). Also the primary key of app.profiles. */
  id: string;
  email: string | null;
}

/** The parts of an HTTP request the auth layer reads and writes. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}
