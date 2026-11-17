import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { unauthenticated } from '../common/api-exception.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { JwtVerifier } from './jwt-verifier.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export function extractBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Global guard: every route requires a valid Supabase access token unless it
 * is marked @Public(). Deny by default, so a new endpoint is never open by accident.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw unauthenticated('Missing bearer token.');
    }

    request.user = await this.verifier.verify(token);
    return true;
  }
}
