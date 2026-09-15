import { AuthController } from './auth.controller.js';

// SEC-03 prerequisite regression: logout and logout-all must clear the
// browser refresh cookie even when the server-side revoke throws, matching
// browser-logout's existing finally-based ordering. Before this fix, a
// thrown revoke left a stale Set-Cookie the client believed was already
// cleared.

function requestWith(headers: Record<string, string>) {
  return {
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as never;
}

function responseSpy() {
  const headers: Record<string, unknown> = {};
  return {
    setHeader(name: string, value: unknown) {
      headers[name] = value;
    },
    get(name: string) {
      return headers[name];
    },
  };
}

function configStub(nodeEnv: string) {
  return { get: (_key: string) => nodeEnv } as never;
}

const browserRequest = requestWith({
  'x-kora-client': 'web',
  origin: 'https://www.koraafric.com',
});

const currentUser = { id: 'user-1', sessionId: 'session-1' } as never;

describe('auth controller browser-cookie clearing ordering', () => {
  it('clears the browser refresh cookie on logout even when the server-side revoke throws', async () => {
    const authService = {
      logout: vi.fn().mockRejectedValue(new Error('db unavailable')),
    };
    const controller = new AuthController(
      authService as never,
      {} as never,
      configStub('production'),
    );
    const response = responseSpy();

    await expect(
      controller.logout(currentUser, browserRequest, response as never),
    ).rejects.toThrow('db unavailable');

    expect(String(response.get('Set-Cookie'))).toContain(
      '__Host-kora_refresh=;',
    );
  });

  it('clears the browser refresh cookie on logout-all even when the server-side revoke throws', async () => {
    const authService = {
      logoutAll: vi.fn().mockRejectedValue(new Error('db unavailable')),
    };
    const controller = new AuthController(
      authService as never,
      {} as never,
      configStub('production'),
    );
    const response = responseSpy();

    await expect(
      controller.logoutAll(currentUser, browserRequest, response as never),
    ).rejects.toThrow('db unavailable');

    expect(String(response.get('Set-Cookie'))).toContain(
      '__Host-kora_refresh=;',
    );
  });

  it('still clears the cookie on the successful logout path (unchanged behavior)', async () => {
    const authService = { logout: vi.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(
      authService as never,
      {} as never,
      configStub('production'),
    );
    const response = responseSpy();

    await controller.logout(currentUser, browserRequest, response as never);

    expect(String(response.get('Set-Cookie'))).toContain(
      '__Host-kora_refresh=;',
    );
    expect(authService.logout).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      expect.anything(),
    );
  });

  it('never sets a cookie header for non-browser (mobile/body) clients', async () => {
    const authService = { logout: vi.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(
      authService as never,
      {} as never,
      configStub('production'),
    );
    const response = responseSpy();

    await controller.logout(currentUser, requestWith({}), response as never);

    expect(response.get('Set-Cookie')).toBeUndefined();
  });
});
