import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '../../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

function buildService(userStatus: UserStatus) {
  const transactionClient = {
    session: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'user-1',
        emailNormalized: 'owner@example.com',
        displayName: 'Owner',
        status: userStatus,
      }),
    },
    session: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (operation: unknown) => {
      if (typeof operation === 'function') {
        return operation(transactionClient);
      }
      return [];
    }),
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
  return { service, prisma, tokenService, auditService, transactionClient };
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserves the existing refresh response expiry semantics while session lifetime remains unchanged', async () => {
    const { service, prisma, tokenService } = buildService(UserStatus.ACTIVE);
    const sessionExpiresAt = new Date(Date.now() + 10_000);
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
        expiresAt: sessionExpiresAt,
        user: {
          id: 'user-1',
          emailNormalized: 'owner@example.com',
          displayName: 'Owner',
          status: UserStatus.ACTIVE,
        },
      },
    });
    tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');
    tokenService.generateRefreshToken = vi
      .fn()
      .mockReturnValue({ raw: 'next-refresh', hash: 'next-hash' });
    tokenService.refreshTokenTtlMs = vi.fn().mockReturnValue(120_000);
    tokenService.signAccessToken = vi.fn().mockResolvedValue('next-access');

    const result = await service.refresh('refresh', { requestId: 'request-1' });

    expect(result.session.expiresAt.getTime()).toBeGreaterThan(
      sessionExpiresAt.getTime(),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not rotate an unexpired refresh token when its session has expired', async () => {
    const { service, prisma, tokenService, transactionClient } = buildService(
      UserStatus.ACTIVE,
    );
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
        expiresAt: new Date(Date.now() - 1_000),
        user: {
          id: 'user-1',
          emailNormalized: 'owner@example.com',
          displayName: 'Owner',
          status: UserStatus.ACTIVE,
        },
      },
    });
    tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');

    await expect(
      service.refresh('refresh', { requestId: 'request-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.generateRefreshToken).not.toHaveBeenCalled();
    expect(transactionClient.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({ revokedReason: 'EXPIRED' }),
    });
  });

  it('allows only one conditional refresh-token claim and treats a loser as reuse', async () => {
    const { service, prisma, tokenService, transactionClient } = buildService(
      UserStatus.ACTIVE,
    );
    const existing = {
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
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-1',
          emailNormalized: 'owner@example.com',
          displayName: 'Owner',
          status: UserStatus.ACTIVE,
        },
      },
    };
    prisma.refreshToken.findUnique.mockResolvedValue(existing);
    tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');
    tokenService.generateRefreshToken = vi
      .fn()
      .mockReturnValue({ raw: 'next-refresh', hash: 'next-hash' });
    tokenService.refreshTokenTtlMs = vi.fn().mockReturnValue(120_000);
    tokenService.signAccessToken = vi.fn().mockResolvedValue('next-access');

    await expect(
      service.refresh('refresh', { requestId: 'request-1' }),
    ).resolves.toMatchObject({ accessToken: 'next-access' });

    transactionClient.refreshToken.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      service.refresh('refresh', { requestId: 'request-2' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transactionClient.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({ revokedReason: 'REUSE_DETECTED' }),
    });
  });
});

describe('AuthService browser access-token recovery', () => {
  it('mints an access token without changing the refresh-token family', async () => {
    const { service, prisma, tokenService, auditService } = buildService(
      UserStatus.ACTIVE,
    );
    const tokenExpiresAt = new Date(Date.now() + 60_000);
    const sessionExpiresAt = new Date(Date.now() + 120_000);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      tokenHash: 'hash',
      revokedAt: null,
      usedAt: null,
      expiresAt: tokenExpiresAt,
      sessionId: 'session-1',
      session: {
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: sessionExpiresAt,
        user: {
          id: 'user-1',
          emailNormalized: 'owner@example.com',
          displayName: 'Owner',
          status: UserStatus.ACTIVE,
        },
      },
    });
    tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');
    tokenService.signAccessToken = vi
      .fn()
      .mockResolvedValue('recovered-access');
    tokenService.refreshTokenTtlMs = vi.fn().mockReturnValue(60_000);

    const result = await service.recoverBrowserAccessToken('refresh', {
      requestId: 'request-1',
    });

    expect(result).toMatchObject({
      accessToken: 'recovered-access',
      user: { id: 'user-1' },
      session: { id: 'session-1', expiresAt: sessionExpiresAt },
    });
    expect(result).not.toHaveProperty('refreshToken');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(tokenService.generateRefreshToken).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.browser_access_token_recovered',
        entityId: 'session-1',
        metadata: { transport: 'browser_cookie', rotation: false },
      }),
    );
  });

  it.each([UserStatus.PENDING, UserStatus.SUSPENDED, UserStatus.DELETED])(
    'rejects a %s user without minting an access token',
    async (status) => {
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
          expiresAt: new Date(Date.now() + 60_000),
          user: {
            id: 'user-1',
            emailNormalized: 'owner@example.com',
            displayName: 'Owner',
            status,
          },
        },
      });
      tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');

      await expect(
        service.recoverBrowserAccessToken('refresh', {
          requestId: 'request-1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tokenService.signAccessToken).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a used token without classifying it as reuse or mutating the family', async () => {
    const { service, prisma, tokenService } = buildService(UserStatus.ACTIVE);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      tokenHash: 'hash',
      revokedAt: null,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      sessionId: 'session-1',
      session: {
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-1',
          emailNormalized: 'owner@example.com',
          displayName: 'Owner',
          status: UserStatus.ACTIVE,
        },
      },
    });
    tokenService.hashRefreshToken = vi.fn().mockReturnValue('hash');

    await expect(
      service.recoverBrowserAccessToken('refresh', { requestId: 'request-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
