import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest, RequestUser } from '../interfaces/authenticated-request.interface.js';

/** Injects the authenticated user (id, sessionId) resolved by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.authUser;
  },
);
