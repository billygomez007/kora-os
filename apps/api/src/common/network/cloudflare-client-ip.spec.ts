import { cloudflareForwardedForMiddleware, createTrustedProxyMatcher } from './cloudflare-client-ip.js';
import type { Request } from 'express';

describe('Cloudflare client IP handling', () => {
  function requestWith(remoteAddress: string, cloudflareAddress: string) {
    const headers = { 'cf-connecting-ip': cloudflareAddress };
    return {
      socket: { remoteAddress },
      headers,
      header: (name: string) => headers[name.toLowerCase() as 'cf-connecting-ip'],
    } as unknown as Request;
  }

  it('does not trust CF-Connecting-IP when no proxy ranges are configured', () => {
    const matcher = createTrustedProxyMatcher(undefined);
    expect(matcher('203.0.113.10')).toBe(false);
  });

  it('accepts a configured proxy CIDR and rejects nearby addresses', () => {
    const matcher = createTrustedProxyMatcher('203.0.113.0/24');
    expect(matcher('203.0.113.42')).toBe(true);
    expect(matcher('203.0.114.42')).toBe(false);
  });

  it('uses CF-Connecting-IP only from a trusted peer', () => {
    const matcher = createTrustedProxyMatcher('203.0.113.0/24');
    const next = vi.fn();
    const middleware = cloudflareForwardedForMiddleware(matcher);
    const trustedRequest = requestWith('203.0.113.42', '198.51.100.8');
    middleware(trustedRequest, {} as never, next);
    expect(trustedRequest.headers['x-forwarded-for']).toBe('198.51.100.8');

    const spoofedRequest = requestWith('198.51.100.9', '192.0.2.8');
    middleware(spoofedRequest, {} as never, next);
    expect(spoofedRequest.headers['x-forwarded-for']).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(2);
  });
});
