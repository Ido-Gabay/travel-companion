import { Inject, Injectable, Logger } from '@nestjs/common';
import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { ApiException, unauthenticated } from '../common/api-exception.js';
import type { AuthUser } from './auth.types.js';

export const JWT_VERIFIER_OPTIONS = Symbol('JWT_VERIFIER_OPTIONS');

export interface JwtVerifierOptions {
  issuer: string;
  audience: string;
  /** Key source. Production: createRemoteJWKSet(<project JWKS URL>). Tests: a local key set. */
  keys: JWTVerifyGetKey;
}

/** Asymmetric algorithms Supabase can sign access tokens with. HS256 is deliberately excluded. */
const ALLOWED_ALGORITHMS = ['ES256', 'RS256', 'EdDSA'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies Supabase access tokens locally against the project's public signing
 * keys. No call to Supabase per request; jose caches the key set and refetches
 * it when it sees an unknown key id (key rotation).
 */
@Injectable()
export class JwtVerifier {
  private readonly logger = new Logger(JwtVerifier.name);

  constructor(@Inject(JWT_VERIFIER_OPTIONS) private readonly options: JwtVerifierOptions) {}

  async verify(token: string): Promise<AuthUser> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.options.keys, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ALLOWED_ALGORITHMS,
      }));
    } catch (error) {
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) {
        // Could not fetch signing keys: our problem, not the caller's token.
        this.logger.error(`JWT verification could not complete: ${String(error)}`);
        throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'Authentication is temporarily unavailable.');
      }
      throw unauthenticated('Invalid or expired access token.');
    }

    if (payload.role !== 'authenticated') {
      throw unauthenticated('Access token is not a signed-in user token.');
    }
    if (payload.is_anonymous === true) {
      throw unauthenticated('Anonymous sessions are not supported.');
    }
    if (typeof payload.sub !== 'string' || !UUID_PATTERN.test(payload.sub)) {
      throw unauthenticated('Access token has no valid subject.');
    }

    return {
      id: payload.sub.toLowerCase(),
      email: typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : null,
    };
  }
}
