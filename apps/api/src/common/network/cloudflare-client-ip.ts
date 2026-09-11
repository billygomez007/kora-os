import { BlockList, isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/**
 * Cloudflare supplies the original client address in CF-Connecting-IP, but
 * that header is only authoritative when the TCP peer is a configured
 * Cloudflare proxy range. An empty range list deliberately trusts nobody.
 */
export function createTrustedProxyMatcher(
  configuredCidrs: string | undefined,
): (address: string) => boolean {
  const blockList = new BlockList();
  for (const entry of configuredCidrs?.split(',').map((value) => value.trim()) ?? []) {
    if (!entry) continue;
    const [address, prefix] = entry.split('/', 2);
    const addressType = isIP(address);
    if (!addressType) {
      throw new Error('CLOUDFLARE_TRUSTED_PROXY_CIDRS contains an invalid IP address');
    }
    if (prefix === undefined) {
      blockList.addAddress(address, addressType === 4 ? 'ipv4' : 'ipv6');
      continue;
    }
    const parsedPrefix = Number(prefix);
    const maxPrefix = addressType === 4 ? 32 : 128;
    if (!Number.isInteger(parsedPrefix) || parsedPrefix < 0 || parsedPrefix > maxPrefix) {
      throw new Error('CLOUDFLARE_TRUSTED_PROXY_CIDRS contains an invalid CIDR prefix');
    }
    blockList.addSubnet(address, parsedPrefix, addressType === 4 ? 'ipv4' : 'ipv6');
  }

  return (address: string) => blockList.check(normalizeMappedAddress(address));
}

/**
 * Rewrite the standard forwarding header only after validating that the
 * immediate peer is trusted. Express then resolves req.ip from this header
 * using the same trust-proxy predicate configured by the application.
 */
export function cloudflareForwardedForMiddleware(
  isTrustedProxy: (address: string) => boolean,
) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const remoteAddress = request.socket.remoteAddress;
    const cloudflareAddress = request.header('cf-connecting-ip')?.trim();
    if (
      remoteAddress &&
      isTrustedProxy(remoteAddress) &&
      cloudflareAddress &&
      isIP(cloudflareAddress)
    ) {
      request.headers['x-forwarded-for'] = cloudflareAddress;
    }
    next();
  };
}

function normalizeMappedAddress(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}
