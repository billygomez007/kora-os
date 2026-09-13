import { ForbiddenException } from '@nestjs/common';
import {
  BROWSER_REFRESH_COOKIE,
  assertAllowedBrowserOrigin,
  clearBrowserRefreshCookie,
  isBrowserCookieClient,
  isCookieFirstBrowserClient,
  readRefreshCookie,
  setBrowserRefreshCookie,
} from './browser-refresh-cookie.js';

function requestWith(headers: Record<string, string>) {
  return {
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as never;
}

function responseSpy() {
  let value: unknown;
  return {
    setHeader(_name: string, next: unknown) {
      value = next;
    },
    header() {
      return value;
    },
  };
}

describe('browser refresh-cookie contract', () => {
  it('requires the explicit web client header', () => {
    expect(isBrowserCookieClient(requestWith({ 'x-kora-client': 'web' }))).toBe(
      true,
    );
    expect(
      isBrowserCookieClient(requestWith({ 'x-kora-client': 'android' })),
    ).toBe(false);
    expect(isBrowserCookieClient(requestWith({}))).toBe(false);
  });

  it('requires a separate explicit cookie-first marker for redaction', () => {
    expect(
      isCookieFirstBrowserClient(
        requestWith({
          'x-kora-client': 'web',
          'x-kora-auth-mode': 'cookie-v1',
        }),
      ),
    ).toBe(true);
    expect(
      isCookieFirstBrowserClient(requestWith({ 'x-kora-client': 'web' })),
    ).toBe(false);
    expect(
      isCookieFirstBrowserClient(
        requestWith({
          'x-kora-client': 'android',
          'x-kora-auth-mode': 'cookie-v1',
        }),
      ),
    ).toBe(false);
  });

  it('reads only the host-only refresh cookie', () => {
    const request = requestWith({
      cookie: `other=value; ${BROWSER_REFRESH_COOKIE}=opaque%2Dvalue`,
    });
    expect(readRefreshCookie(request)).toBe('opaque-value');
    expect(
      readRefreshCookie(requestWith({ cookie: 'other=value' })),
    ).toBeNull();
  });

  it.each([
    ['https://www.koraafric.com', true],
    ['https://koraafric.com', true],
    ['https://evil.example', false],
    ['not-an-origin', false],
    [undefined, false],
  ])('validates browser origin %s', (origin, allowed) => {
    const request = requestWith(origin ? { origin } : {});
    if (allowed) {
      expect(() =>
        assertAllowedBrowserOrigin(request, [
          'https://koraafric.com',
          'https://www.koraafric.com',
        ]),
      ).not.toThrow();
    } else {
      expect(() =>
        assertAllowedBrowserOrigin(request, [
          'https://koraafric.com',
          'https://www.koraafric.com',
        ]),
      ).toThrow(ForbiddenException);
    }
  });

  it('serializes the production cookie with a capped expiry and no Domain', () => {
    const response = responseSpy();
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date(now + 90_000);

    setBrowserRefreshCookie(
      response as never,
      'opaque-value',
      expiresAt,
      true,
      now,
    );

    expect(response.header()).toBe(
      `${BROWSER_REFRESH_COOKIE}=opaque-value; Max-Age=90; Expires=${expiresAt.toUTCString()}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(String(response.header())).not.toContain('Domain=');
  });

  it('omits Secure only for explicit non-production test/development use', () => {
    const response = responseSpy();
    const expiresAt = new Date(Date.parse('2026-01-01T00:01:00.000Z'));

    setBrowserRefreshCookie(
      response as never,
      'opaque-value',
      expiresAt,
      false,
      Date.parse('2026-01-01T00:00:00.000Z'),
    );

    expect(String(response.header())).not.toContain('; Secure');
  });

  it('clears the cookie with matching host-only attributes', () => {
    const response = responseSpy();

    clearBrowserRefreshCookie(response as never, true);

    expect(response.header()).toBe(
      `${BROWSER_REFRESH_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(String(response.header())).not.toContain('Domain=');
  });
});
