import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { isUserAllowedAccess } from '../../common/authorization/status-policy.js';
import { SessionRevokedReason, UserStatus } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from './token.service.js';

export interface RequestMetadata {
  deviceLabel?: string;
  userAgent?: string;
  ipHash?: string;
  requestId: string;
}

export interface AuthResult {
  user: { id: string; email: string | null; displayName: string };
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  session: { id: string; expiresAt: Date };
}

export interface SessionSummary {
  id: string;
  deviceLabel: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

const GENERIC_AUTH_ERROR = 'Authentication is required';

/**
 * Session issuance, rotation, and revocation — everything except how a
 * user's identity is first established, which is EmailOtpService's job
 * (Kora is passwordless; see docs/SECURITY.md section 6). The controller
 * calls `issueSessionForVerifiedUser` only after EmailOtpService has
 * already verified a one-time code.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  async issueSessionForVerifiedUser(
    userId: string,
    meta: RequestMetadata,
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!isUserAllowedAccess(user.status)) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const result = await this.issueSession(
      user.id,
      user.emailNormalized,
      user.displayName,
      meta,
    );

    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.session_created',
      entityType: 'session',
      entityId: result.session.id,
      requestId: meta.requestId,
      source: 'auth',
    });

    return result;
  }

  async refresh(rawRefreshToken: string, meta: RequestMetadata): Promise<AuthResult> {
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: { include: { user: true } } },
    });

    if (!existing) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (!isUserAllowedAccess(existing.session.user.status)) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (existing.revokedAt || existing.usedAt || existing.session.revokedAt) {
      // Reuse of an already-rotated (or already-revoked) refresh token:
      // treat the entire session's token family as compromised.
      await this.revokeSession(
        existing.sessionId,
        SessionRevokedReason.REUSE_DETECTED,
      );
      await this.auditService.record({
        actorUserId: existing.session.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'session',
        entityId: existing.sessionId,
        requestId: meta.requestId,
        source: 'auth',
      });
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const nextRefreshToken = this.tokenService.generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.tokenService.refreshTokenTtlMs(),
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          sessionId: existing.sessionId,
          tokenHash: nextRefreshToken.hash,
          expiresAt: refreshExpiresAt,
        },
      }),
      this.prisma.session.update({
        where: { id: existing.sessionId },
        data: { lastUsedAt: new Date() },
      }),
    ]);

    const accessToken = await this.tokenService.signAccessToken({
      sub: existing.session.userId,
      sid: existing.sessionId,
    });

    return {
      user: {
        id: existing.session.user.id,
        email: existing.session.user.emailNormalized,
        displayName: existing.session.user.displayName,
      },
      accessToken,
      accessTokenExpiresInSeconds: this.accessTokenTtlSeconds(),
      refreshToken: nextRefreshToken.raw,
      session: { id: existing.sessionId, expiresAt: refreshExpiresAt },
    };
  }

  async logout(userId: string, sessionId: string, meta: RequestMetadata): Promise<void> {
    await this.revokeOwnedSession(userId, sessionId, SessionRevokedReason.LOGOUT);
    await this.auditService.record({
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'session',
      entityId: sessionId,
      requestId: meta.requestId,
      source: 'auth',
    });
  }

  async logoutAll(userId: string, meta: RequestMetadata): Promise<void> {
    const activeSessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: SessionRevokedReason.LOGOUT_ALL },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: activeSessions.map((s) => s.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditService.record({
      actorUserId: userId,
      action: 'auth.logout_all',
      entityType: 'user',
      entityId: userId,
      requestId: meta.requestId,
      source: 'auth',
      metadata: { revokedSessionCount: activeSessions.length },
    });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceLabel: session.deviceLabel,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revokeSessionForUser(
    userId: string,
    sessionId: string,
    meta: RequestMetadata,
  ): Promise<void> {
    await this.revokeOwnedSession(userId, sessionId, SessionRevokedReason.LOGOUT);
    await this.auditService.record({
      actorUserId: userId,
      action: 'auth.session_revoked',
      entityType: 'session',
      entityId: sessionId,
      requestId: meta.requestId,
      source: 'auth',
    });
  }

  async me(userId: string): Promise<{ id: string; email: string | null; displayName: string; status: UserStatus }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      email: user.emailNormalized,
      displayName: user.displayName,
      status: user.status,
    };
  }

  private async issueSession(
    userId: string,
    email: string | null,
    displayName: string,
    meta: RequestMetadata,
  ): Promise<AuthResult> {
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.tokenService.refreshTokenTtlMs(),
    );

    const session = await this.prisma.session.create({
      data: {
        userId,
        deviceLabel: meta.deviceLabel,
        userAgent: meta.userAgent,
        ipHash: meta.ipHash,
        expiresAt: refreshExpiresAt,
        refreshTokens: {
          create: { tokenHash: refreshToken.hash, expiresAt: refreshExpiresAt },
        },
      },
    });

    const accessToken = await this.tokenService.signAccessToken({
      sub: userId,
      sid: session.id,
    });

    return {
      user: { id: userId, email, displayName },
      accessToken,
      accessTokenExpiresInSeconds: this.accessTokenTtlSeconds(),
      refreshToken: refreshToken.raw,
      session: { id: session.id, expiresAt: refreshExpiresAt },
    };
  }

  private async revokeOwnedSession(
    userId: string,
    sessionId: string,
    reason: SessionRevokedReason,
  ): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }
    await this.revokeSession(sessionId, reason);
  }

  private async revokeSession(
    sessionId: string,
    reason: SessionRevokedReason,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private accessTokenTtlSeconds(): number {
    const ttl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const amount = Number.parseInt(ttl, 10);
    const unit = ttl.at(-1);
    const multiplier = { s: 1, m: 60, h: 3600, d: 86_400 }[unit as 's' | 'm' | 'h' | 'd'] ?? 60;
    return amount * multiplier;
  }
}
