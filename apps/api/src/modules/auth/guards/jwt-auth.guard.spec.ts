import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '../../../generated/prisma/client.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function buildGuard(userStatus: UserStatus, isPublic = false) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  };
  const tokenService = {
    verifyAccessToken: vi
      .fn()
      .mockResolvedValue({ sub: 'user-1', sid: 'session-1' }),
  };
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { status: userStatus },
      }),
    },
  };
  const guard = new JwtAuthGuard(
    reflector as never,
    tokenService as never,
    prisma as never,
  );
  const request = { headers: { authorization: 'Bearer token' } } as {
    headers: { authorization: string };
    authUser?: unknown;
  };
  const context = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { guard, request, context, prisma };
}

describe('JwtAuthGuard account status enforcement', () => {
  it('allows an active user with an active session', async () => {
    const { guard, request, context } = buildGuard(UserStatus.ACTIVE);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.authUser).toEqual({ id: 'user-1', sessionId: 'session-1' });
  });

  it.each([UserStatus.PENDING, UserStatus.SUSPENDED, UserStatus.DELETED])(
    'rejects a %s user even when the session and JWT are valid',
    async (status) => {
      const { guard, context } = buildGuard(status);

      await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('keeps public routes outside account status enforcement', async () => {
    const { guard, context, prisma } = buildGuard(UserStatus.SUSPENDED, true);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });
});
