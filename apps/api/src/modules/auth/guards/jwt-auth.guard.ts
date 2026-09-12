import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../database/prisma.service.js';
import { isUserAllowedAccess } from '../../../common/authorization/status-policy.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';
import { TokenService } from '../token.service.js';

/**
 * Registered globally (see AppModule). Verifies the access token's
 * signature and expiry, then re-checks the session it names is still
 * present and not revoked — a JWT alone proves the token was validly
 * signed, not that the session behind it is still trusted, so revoking a
 * session must take effect immediately rather than waiting for the access
 * token to naturally expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    const claims = await this.tokenService
      .verifyAccessToken(token)
      .catch(() => null);
    if (!claims) {
      throw new UnauthorizedException('Authentication is required');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { status: true } },
      },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user ||
      !isUserAllowedAccess(session.user.status)
    ) {
      throw new UnauthorizedException('Authentication is required');
    }

    request.authUser = { id: claims.sub, sessionId: claims.sid };
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}
