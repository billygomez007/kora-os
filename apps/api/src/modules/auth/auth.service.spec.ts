import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '../../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

function buildService(userStatus: UserStatus) {
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'user-1',
        emailNormalized: 'owner@example.com',
        displayName: 'Owner',
        status: userStatus,
      }),
    },
    session: { create: vi.fn() },
    refreshToken: { findUnique: vi.fn() },
  };
  const tokenService = {
    generateRefreshToken: vi.fn(),
    refreshTokenTtlMs: vi.fn(),
    signAccessToken: vi.fn(),
    hashRefreshToken: vi.fn(),
  };
  const auditService = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    prisma as never,
    tokenService as never,
    auditService as never,
    new ConfigService({ JWT_ACCESS_TTL: '15m' }),
  );
  return { service, prisma, tokenService, auditService };
}

describe('AuthService account status enforcement', () => {
  it.each([UserStatus.PENDING, UserStatus.SUSPENDED, UserStatus.DELETED])(
    'does not issue an OTP session for a %s user',
    async (status) => {
      const { service, prisma } = buildService(status);

      await expect(
        service.issueSessionForVerifiedUser('user-1', {
          requestId: 'request-1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
    },
  );

  it('still issues an OTP session for an active user', async () => {
    const { service, prisma, tokenService } = buildService(UserStatus.ACTIVE);
    tokenService.generateRefreshToken = vi
      .fn()
      .mockReturnValue({ raw: 'refresh', hash: 'hash' });
    tokenService.refreshTokenTtlMs = vi.fn().mockReturnValue(60_000);
    tokenService.signAccessToken = vi.fn().mockResolvedValue('access');
    prisma.session.create.mockResolvedValue({
      id: 'session-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.issueSessionForVerifiedUser('user-1', { requestId: 'request-1' }),
    ).resolves.toMatchObject({ user: { id: 'user-1' }, accessToken: 'access' });
  });

  it('does not rotate a refresh token for a suspended user', async () => {
    const { service, prisma, tokenService } = buildService(UserStatus.ACTIVE);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      tokenHash: 'hash',
      revokedAt: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      sessionId: 'session-1',
      session: {
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        user: {
          id: 'user-1',
          emailNormalized: 'owner@example.com',
          displayName: 'Owner',
          status: UserStatus.SUSPENDED,
        },
      },
    });
    tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');

    await expect(
      service.refresh('refresh', { requestId: 'request-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalled();
    expect(
      (prisma as unknown as { $transaction?: unknown }).$transaction,
    ).toBeUndefined();
  });
});
