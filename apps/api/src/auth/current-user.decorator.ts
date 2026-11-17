import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { unauthenticated } from '../common/api-exception.js';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';

/** Injects the verified caller. Only valid on routes protected by AuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    throw unauthenticated();
  }
  return user;
});
