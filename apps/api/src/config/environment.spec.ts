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

  it('leaves JWT, refresh-token, and OTP secrets undefined outside production, with safe OTP defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      JWT_ACCESS_SECRET: undefined,
      JWT_ACCESS_TTL: '15m',
      REFRESH_TOKEN_PEPPER: undefined,
      REFRESH_TOKEN_TTL_DAYS: 30,
      OTP_PEPPER: undefined,
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
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

  it('requires an explicit OTP_PEPPER in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
      }),
    ).toThrow('OTP_PEPPER must be explicitly provided in production');
  });

  it('accepts a production config with strong secrets', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
        OTP_PEPPER: 'c'.repeat(32),
      }),
    ).toMatchObject({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
      OTP_PEPPER: 'c'.repeat(32),
    });
  });

  it('rejects an OTP_CODE_LENGTH below the minimum of six digits', () => {
    expect(() => validateEnvironment({ OTP_CODE_LENGTH: '4' })).toThrow(
      'OTP_CODE_LENGTH must be at least 6',
    );
  });

  it('rejects a non-positive OTP_MAX_ATTEMPTS', () => {
    expect(() => validateEnvironment({ OTP_MAX_ATTEMPTS: '0' })).toThrow(
      'OTP_MAX_ATTEMPTS must be a positive integer',
    );
  });

  it('accepts overridden OTP configuration', () => {
    expect(
      validateEnvironment({
        OTP_CODE_LENGTH: '8',
        OTP_EXPIRY_MINUTES: '5',
        OTP_MAX_ATTEMPTS: '3',
        OTP_RESEND_COOLDOWN_SECONDS: '30',
        OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: '10',
        OTP_MAX_REQUESTS_PER_IP_PER_HOUR: '50',
      }),
    ).toMatchObject({
      OTP_CODE_LENGTH: 8,
      OTP_EXPIRY_MINUTES: 5,
      OTP_MAX_ATTEMPTS: 3,
      OTP_RESEND_COOLDOWN_SECONDS: 30,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 10,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 50,
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

  it('leaves email delivery unset by default, in every environment — the safe, fail-closed state', () => {
    expect(validateEnvironment({})).toMatchObject({
      EMAIL_DELIVERY_MODE: undefined,
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_SECURE: undefined,
      EMAIL_FROM: undefined,
    });
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
        OTP_PEPPER: 'c'.repeat(32),
      }),
    ).toMatchObject({ EMAIL_DELIVERY_MODE: undefined });
  });

  it('rejects any EMAIL_DELIVERY_MODE other than "smtp" or "resend"', () => {
    expect(() =>
      validateEnvironment({ EMAIL_DELIVERY_MODE: 'console' }),
    ).toThrow('EMAIL_DELIVERY_MODE must be "smtp" or "resend"');
  });

  it('requires Resend credentials and separate sender identities when EMAIL_DELIVERY_MODE=resend', () => {
    expect(() => validateEnvironment({ EMAIL_DELIVERY_MODE: 'resend' })).toThrow(
      'RESEND_API_KEY is required',
    );
    expect(() =>
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'resend',
        RESEND_API_KEY: 're_placeholder_not_a_real_key',
      }),
    ).toThrow('OTP_FROM_EMAIL must be a non-empty address');
    expect(() =>
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'resend',
        RESEND_API_KEY: 're_placeholder_not_a_real_key',
        OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
      }),
    ).toThrow('INVITATION_FROM_EMAIL must be a non-empty address');
  });

  it('accepts the production Resend HTTPS configuration without SMTP variables', () => {
    expect(
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'resend',
        RESEND_API_KEY: 're_placeholder_not_a_real_key',
        OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
        INVITATION_FROM_EMAIL: 'Kora OS Invitations <invite@koraafric.com>',
      }),
    ).toMatchObject({
      EMAIL_DELIVERY_MODE: 'resend',
      RESEND_API_KEY: 're_placeholder_not_a_real_key',
      OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
      INVITATION_FROM_EMAIL: 'Kora OS Invitations <invite@koraafric.com>',
      SMTP_HOST: undefined,
    });
  });

  it('requires SMTP_HOST, SMTP_PORT, SMTP_SECURE, and EMAIL_FROM when EMAIL_DELIVERY_MODE=smtp', () => {
    expect(() =>
      validateEnvironment({ EMAIL_DELIVERY_MODE: 'smtp' }),
    ).toThrow('SMTP_HOST is required');

    expect(() =>
      validateEnvironment({ EMAIL_DELIVERY_MODE: 'smtp', SMTP_HOST: '127.0.0.1' }),
    ).toThrow('SMTP_PORT must be an integer');

    expect(() =>
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
      }),
    ).toThrow('SMTP_SECURE must be "true" or "false"');

    expect(() =>
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
      }),
    ).toThrow('EMAIL_FROM must be a non-empty address');
  });

  it('accepts a full local Mailpit SMTP configuration, with SMTP_USER/SMTP_PASSWORD optional', () => {
    expect(
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        EMAIL_FROM: 'Kora <no-reply@kora.local>',
      }),
    ).toMatchObject({
      EMAIL_DELIVERY_MODE: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      EMAIL_FROM: 'Kora <no-reply@kora.local>',
    });
  });

  it('accepts SMTP_USER and SMTP_PASSWORD when a provider requires authentication', () => {
    expect(
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'smtp',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_SECURE: 'true',
        SMTP_USER: 'a-user',
        SMTP_PASSWORD: 'a-password',
        EMAIL_FROM: 'Kora <no-reply@kora.example>',
      }),
    ).toMatchObject({ SMTP_USER: 'a-user', SMTP_PASSWORD: 'a-password' });
  });

  it('accepts Resend\'s documented production SMTP configuration (docs/operations/EMAIL_OTP_PRODUCTION_SETUP.md) — recommended implicit-TLS port 465', () => {
    expect(
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'smtp',
        SMTP_HOST: 'smtp.resend.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'resend',
        SMTP_PASSWORD: 're_placeholder_not_a_real_key',
        EMAIL_FROM: 'Kora OS <login@koraafric.com>',
      }),
    ).toMatchObject({
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_USER: 'resend',
      EMAIL_FROM: 'Kora OS <login@koraafric.com>',
    });
  });

  it('accepts Resend\'s alternative STARTTLS port 587 configuration', () => {
    expect(
      validateEnvironment({
        EMAIL_DELIVERY_MODE: 'smtp',
        SMTP_HOST: 'smtp.resend.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'resend',
        SMTP_PASSWORD: 're_placeholder_not_a_real_key',
        EMAIL_FROM: 'Kora OS <login@koraafric.com>',
      }),
    ).toMatchObject({ SMTP_PORT: 587, SMTP_SECURE: false });
  });
});
