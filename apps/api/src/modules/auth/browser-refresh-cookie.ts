import type { Request, Response } from 'express';
import { ForbiddenException } from '@nestjs/common';

export const BROWSER_CLIENT_HEADER = 'x-kora-client';
export const BROWSER_CLIENT_VALUE = 'web';
export const BROWSER_REFRESH_COOKIE = '__Host-kora_refresh';

/**
 * Browser refresh-cookie transport is opt-in. Legacy and mobile clients do
 * not send this header and therefore keep the existing JSON/body contract.
 */
export function isBrowserCookieClient(request: Request): boolean {
  return (
    request.header(BROWSER_CLIENT_HEADER)?.trim().toLowerCase() ===
    BROWSER_CLIENT_VALUE
  );
}

/**
 * Cookie parsing is deliberately limited to the one opaque credential we
 * own. No cookie values are logged or copied into response bodies.
 */
export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    if (name !== BROWSER_REFRESH_COOKIE) continue;

    const value = part.slice(separator + 1).trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * CORS is not a CSRF boundary. Cookie-authenticated browser operations must
 * carry an exact allowlisted Origin. Missing and malformed origins are
 * rejected deliberately; Android/body transport does not call this helper.
 */
export function assertAllowedBrowserOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): void {
  const origin = request.header('origin')?.trim();
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ForbiddenException(
      'Browser authentication origin is not permitted',
    );
  }
}

function maxAgeSeconds(expiresAt: Date, now = Date.now()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));
}

/**
 * __Host- cookies must omit Domain, use Path=/, and be Secure. Secure is
 * disabled only for local test/development HTTP; production always sets it.
 */
export function setBrowserRefreshCookie(
  response: Response,
  refreshToken: string,
  expiresAt: Date,
  secure: boolean,
  now = Date.now(),
): void {
  const maxAge = maxAgeSeconds(expiresAt, now);
  const value = encodeURIComponent(refreshToken);
  const secureAttribute = secure ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${BROWSER_REFRESH_COOKIE}=${value}; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}; Path=/; HttpOnly; SameSite=Lax${secureAttribute}`,
  );
}

export function clearBrowserRefreshCookie(
  response: Response,
  secure: boolean,
): void {
  const secureAttribute = secure ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${BROWSER_REFRESH_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${secureAttribute}`,
  );
}
