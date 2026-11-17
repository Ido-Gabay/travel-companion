import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception.js';
import { AuthGuard, extractBearerToken } from './auth.guard.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { JwtVerifier } from './jwt-verifier.js';

const ISSUER = 'https://test-project.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';
const USER_ID = '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e';

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let verifier: JwtVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'ES256' };
  verifier = new JwtVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    keys: createLocalJWKSet({ keys: [publicJwk] }),
  });
});

function sign(claims: JWTPayload = {}, opts: { issuer?: string; audience?: string; exp?: string } = {}) {
  return new SignJWT({ role: 'authenticated', email: 'traveler@example.com', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject(typeof claims.sub === 'string' ? claims.sub : USER_ID)
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toBeInstanceOf(ApiException);
  await promise.catch((error: ApiException) => expect(error.getStatus()).toBe(status));
}

describe('JwtVerifier', () => {
  it('accepts a valid user token', async () => {
    await expect(verifier.verify(await sign())).resolves.toEqual({
      id: USER_ID,
      email: 'traveler@example.com',
    });
  });

  it('rejects a token from another project', async () => {
    await expectStatus(verifier.verify(await sign({}, { issuer: 'https://other.supabase.co/auth/v1' })), 401);
  });

  it('rejects the wrong audience', async () => {
    await expectStatus(verifier.verify(await sign({}, { audience: 'anon' })), 401);
  });

  it('rejects an expired token', async () => {
    await expectStatus(verifier.verify(await sign({}, { exp: '-1m' })), 401);
  });

  it('rejects anon-role and anonymous-user tokens', async () => {
    await expectStatus(verifier.verify(await sign({ role: 'anon' })), 401);
    await expectStatus(verifier.verify(await sign({ is_anonymous: true })), 401);
  });

  it('rejects a token signed by an unknown key', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(other.privateKey);
    await expectStatus(verifier.verify(forged), 401);
  });

  it('rejects garbage', async () => {
    await expectStatus(verifier.verify('not-a-jwt'), 401);
  });
});

describe('extractBearerToken', () => {
  it('reads a bearer token', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('ignores other schemes and missing headers', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(['Bearer a', 'Bearer b'])).toBeNull();
  });
});

describe('AuthGuard', () => {
  function contextFor(request: AuthenticatedRequest): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const reflectorReturning = (isPublic: boolean) =>
    ({ getAllAndOverride: () => isPublic }) as unknown as Reflector;

  it('lets public routes through without a token', async () => {
    const guard = new AuthGuard(reflectorReturning(true), verifier);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects protected routes without a token', async () => {
    const guard = new AuthGuard(reflectorReturning(false), verifier);
    await expectStatus(guard.canActivate(contextFor({ headers: {} })), 401);
  });

  it('attaches the verified user to the request', async () => {
    const guard = new AuthGuard(reflectorReturning(false), verifier);
    const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${await sign()}` } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user?.id).toBe(USER_ID);
  });
});
