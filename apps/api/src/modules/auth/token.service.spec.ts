import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service.js';

function createService(overrides: Record<string, unknown> = {}): TokenService {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
    REFRESH_TOKEN_TTL_DAYS: 30,
    ...overrides,
  });
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  it('signs and verifies an access token round trip', async () => {
    const service = createService();
    const token = await service.signAccessToken({ sub: 'user-1', sid: 'session-1' });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const signer = createService({ JWT_ACCESS_SECRET: 'a'.repeat(32) });
    const verifier = createService({ JWT_ACCESS_SECRET: 'c'.repeat(32) });
    const token = await signer.signAccessToken({ sub: 'user-1', sid: 'session-1' });

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });

  it('generates a high-entropy refresh token and a deterministic hash', () => {
    const service = createService();
    const first = service.generateRefreshToken();
    const second = service.generateRefreshToken();

    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).not.toBe(second.hash);
    expect(service.hashRefreshToken(first.raw)).toBe(first.hash);
  });

  it('never returns the pepper or raw token as part of the stored hash', () => {
    const service = createService();
    const { raw, hash } = service.generateRefreshToken();

    expect(hash).not.toContain(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for the same raw token under different peppers', () => {
    const serviceA = createService({ REFRESH_TOKEN_PEPPER: 'b'.repeat(32) });
    const serviceB = createService({ REFRESH_TOKEN_PEPPER: 'd'.repeat(32) });

    expect(serviceA.hashRefreshToken('same-raw-token')).not.toBe(
      serviceB.hashRefreshToken('same-raw-token'),
    );
  });

  it('converts REFRESH_TOKEN_TTL_DAYS into milliseconds', () => {
    const service = createService({ REFRESH_TOKEN_TTL_DAYS: 2 });
    expect(service.refreshTokenTtlMs()).toBe(2 * 24 * 60 * 60 * 1000);
  });
});
