import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('provides safe development defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      API_PREFIX: '/v1',
    });
  });

  it('normalizes a configured API prefix', () => {
    expect(validateEnvironment({ API_PREFIX: '/v2/' }).API_PREFIX).toBe('/v2');
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('rejects an invalid environment name', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'preview' })).toThrow(
      'NODE_ENV must be one of',
    );
  });

  it('leaves JWT and refresh-token secrets undefined outside production', () => {
    expect(validateEnvironment({})).toMatchObject({
      JWT_ACCESS_SECRET: undefined,
      JWT_ACCESS_TTL: '15m',
      REFRESH_TOKEN_PEPPER: undefined,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('requires an explicit JWT_ACCESS_SECRET in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        REFRESH_TOKEN_PEPPER: 'a'.repeat(32),
      }),
    ).toThrow('JWT_ACCESS_SECRET must be explicitly provided in production');
  });

  it('requires an explicit REFRESH_TOKEN_PEPPER in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
      }),
    ).toThrow('REFRESH_TOKEN_PEPPER must be explicitly provided in production');
  });

  it('rejects a signing secret shorter than the minimum length', () => {
    expect(() =>
      validateEnvironment({ JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow('JWT_ACCESS_SECRET must be at least 32 characters');
  });

  it('accepts a production config with strong secrets', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
      }),
    ).toMatchObject({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
    });
  });

  it('rejects a malformed JWT_ACCESS_TTL', () => {
    expect(() =>
      validateEnvironment({ JWT_ACCESS_TTL: 'fifteen minutes' }),
    ).toThrow('JWT_ACCESS_TTL must look like');
  });

  it('rejects a non-positive REFRESH_TOKEN_TTL_DAYS', () => {
    expect(() =>
      validateEnvironment({ REFRESH_TOKEN_TTL_DAYS: '0' }),
    ).toThrow('REFRESH_TOKEN_TTL_DAYS must be a positive integer');
  });
});
