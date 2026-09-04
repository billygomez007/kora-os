const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

const DATABASE_URL_PATTERN = /^postgres(ql)?:\/\/.+/;
const DURATION_PATTERN = /^\d+[smhd]$/;
const MIN_SIGNING_SECRET_LENGTH = 32;

const MIN_OTP_CODE_LENGTH = 6;

export interface KoraEnvironment extends Record<string, unknown> {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  API_PREFIX: string;
  DATABASE_URL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_ACCESS_TTL: string;
  REFRESH_TOKEN_PEPPER?: string;
  REFRESH_TOKEN_TTL_DAYS: number;
  OTP_PEPPER?: string;
  OTP_CODE_LENGTH: number;
  OTP_EXPIRY_MINUTES: number;
  OTP_MAX_ATTEMPTS: number;
  OTP_RESEND_COOLDOWN_SECONDS: number;
  OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: number;
  OTP_MAX_REQUESTS_PER_IP_PER_HOUR: number;
}

export function validateEnvironment(
  input: Record<string, unknown>,
): KoraEnvironment {
  const nodeEnvironment = String(input.NODE_ENV ?? 'development');
  if (!NODE_ENVIRONMENTS.includes(nodeEnvironment as NodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  const port = Number(input.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const apiPrefix = String(input.API_PREFIX ?? 'v1')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!apiPrefix || !/^[a-z0-9][a-z0-9/-]*$/i.test(apiPrefix)) {
    throw new Error('API_PREFIX contains unsupported characters');
  }

  const databaseUrl = normalizeDatabaseUrl(input.DATABASE_URL);
  if (nodeEnvironment === 'production' && !databaseUrl) {
    throw new Error(
      'DATABASE_URL must be explicitly provided in production; no local .env fallback is used',
    );
  }
  if (databaseUrl && !DATABASE_URL_PATTERN.test(databaseUrl)) {
    throw new Error(
      'DATABASE_URL must be a postgres:// or postgresql:// connection string',
    );
  }

  const jwtAccessSecret = requireSigningSecret(
    'JWT_ACCESS_SECRET',
    input.JWT_ACCESS_SECRET,
    nodeEnvironment,
  );
  const refreshTokenPepper = requireSigningSecret(
    'REFRESH_TOKEN_PEPPER',
    input.REFRESH_TOKEN_PEPPER,
    nodeEnvironment,
  );

  const jwtAccessTtl = String(input.JWT_ACCESS_TTL ?? '15m').trim();
  if (!DURATION_PATTERN.test(jwtAccessTtl)) {
    throw new Error('JWT_ACCESS_TTL must look like "15m", "1h", or "30d"');
  }

  const refreshTokenTtlDays = Number(input.REFRESH_TOKEN_TTL_DAYS ?? 30);
  if (!Number.isInteger(refreshTokenTtlDays) || refreshTokenTtlDays < 1) {
    throw new Error('REFRESH_TOKEN_TTL_DAYS must be a positive integer');
  }

  const otpPepper = requireSigningSecret(
    'OTP_PEPPER',
    input.OTP_PEPPER,
    nodeEnvironment,
  );

  const otpCodeLength = requirePositiveInteger(
    'OTP_CODE_LENGTH',
    input.OTP_CODE_LENGTH,
    6,
  );
  if (otpCodeLength < MIN_OTP_CODE_LENGTH) {
    throw new Error(`OTP_CODE_LENGTH must be at least ${MIN_OTP_CODE_LENGTH}`);
  }
  const otpExpiryMinutes = requirePositiveInteger(
    'OTP_EXPIRY_MINUTES',
    input.OTP_EXPIRY_MINUTES,
    10,
  );
  const otpMaxAttempts = requirePositiveInteger(
    'OTP_MAX_ATTEMPTS',
    input.OTP_MAX_ATTEMPTS,
    5,
  );
  const otpResendCooldownSeconds = requirePositiveInteger(
    'OTP_RESEND_COOLDOWN_SECONDS',
    input.OTP_RESEND_COOLDOWN_SECONDS,
    60,
  );
  const otpMaxRequestsPerEmailPerHour = requirePositiveInteger(
    'OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR',
    input.OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR,
    5,
  );
  const otpMaxRequestsPerIpPerHour = requirePositiveInteger(
    'OTP_MAX_REQUESTS_PER_IP_PER_HOUR',
    input.OTP_MAX_REQUESTS_PER_IP_PER_HOUR,
    20,
  );

  return {
    ...input,
    NODE_ENV: nodeEnvironment as NodeEnvironment,
    PORT: port,
    API_PREFIX: `/${apiPrefix}`,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_ACCESS_TTL: jwtAccessTtl,
    REFRESH_TOKEN_PEPPER: refreshTokenPepper,
    REFRESH_TOKEN_TTL_DAYS: refreshTokenTtlDays,
    OTP_PEPPER: otpPepper,
    OTP_CODE_LENGTH: otpCodeLength,
    OTP_EXPIRY_MINUTES: otpExpiryMinutes,
    OTP_MAX_ATTEMPTS: otpMaxAttempts,
    OTP_RESEND_COOLDOWN_SECONDS: otpResendCooldownSeconds,
    OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: otpMaxRequestsPerEmailPerHour,
    OTP_MAX_REQUESTS_PER_IP_PER_HOUR: otpMaxRequestsPerIpPerHour,
  };
}

function normalizeDatabaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * JWT_ACCESS_SECRET, REFRESH_TOKEN_PEPPER, and OTP_PEPPER all follow the
 * same policy as DATABASE_URL: required and explicit in production (no
 * local-.env fallback there), optional in development/test so unit tests
 * that never boot the auth module do not need one, but never accepted
 * below a safe minimum length when one is supplied. OTP_PEPPER keys the
 * HMAC-SHA256 digest EmailOtpService stores instead of a plaintext or
 * plain-hashed code (see prisma/schema.prisma's EmailOtpChallenge
 * comment) — a mandatory strong pepper in production is exactly what the
 * passwordless product decision (docs/SECURITY.md section 6) requires in
 * place of a password hashing function.
 */
function requireSigningSecret(
  name: string,
  value: unknown,
  nodeEnvironment: string,
): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    if (nodeEnvironment === 'production') {
      throw new Error(`${name} must be explicitly provided in production`);
    }
    return undefined;
  }
  if (trimmed.length < MIN_SIGNING_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SIGNING_SECRET_LENGTH} characters`,
    );
  }
  return trimmed;
}

function requirePositiveInteger(
  name: string,
  value: unknown,
  defaultValue: number,
): number {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
