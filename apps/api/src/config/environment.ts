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
  OTP_DIAGNOSTICS?: boolean;
  EMAIL_DELIVERY_MODE?: 'smtp' | 'resend';
  CLOUDFLARE_TRUSTED_PROXY_CIDRS?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  OTP_FROM_EMAIL?: string;
  INVITATION_FROM_EMAIL?: string;
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
  const otpDiagnostics = parseOptionalBoolean(input.OTP_DIAGNOSTICS);
  const cloudflareTrustedProxyCidrs = optionalString(
    input.CLOUDFLARE_TRUSTED_PROXY_CIDRS,
  );

  const {
    emailDeliveryMode,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    emailFrom,
    resendApiKey,
    otpFromEmail,
    invitationFromEmail,
  } = validateEmailDeliveryConfig(input);

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
    OTP_DIAGNOSTICS: otpDiagnostics,
    CLOUDFLARE_TRUSTED_PROXY_CIDRS: cloudflareTrustedProxyCidrs,
    EMAIL_DELIVERY_MODE: emailDeliveryMode,
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_SECURE: smtpSecure,
    SMTP_USER: smtpUser,
    SMTP_PASSWORD: smtpPassword,
    EMAIL_FROM: emailFrom,
    RESEND_API_KEY: resendApiKey,
    OTP_FROM_EMAIL: otpFromEmail,
    INVITATION_FROM_EMAIL: invitationFromEmail,
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

interface EmailDeliveryConfig {
  emailDeliveryMode: 'smtp' | 'resend' | undefined;
  smtpHost: string | undefined;
  smtpPort: number | undefined;
  smtpSecure: boolean | undefined;
  smtpUser: string | undefined;
  smtpPassword: string | undefined;
  emailFrom: string | undefined;
  resendApiKey: string | undefined;
  otpFromEmail: string | undefined;
  invitationFromEmail: string | undefined;
}

/**
 * EMAIL_DELIVERY_MODE is the one switch that can turn on real email
 * delivery, in every environment alike (docs task hardening: "Production
 * must require an explicitly configured real email delivery mode" —
 * applied uniformly here rather than as a production-only special case,
 * so there is no implicit "development gets a working sender for free"
 * path either). Leaving it unset is always valid and always safe: it
 * means EmailOtpModule falls back to UnconfiguredEmailOtpSender, which
 * fails closed rather than pretending to deliver. The only accepted
 * value is "smtp" or "resend" — there is deliberately no "console"/"dev"/"fake"
 * value that configuration could ever select.
 */
function validateEmailDeliveryConfig(
  input: Record<string, unknown>,
): EmailDeliveryConfig {
  const rawMode =
    typeof input.EMAIL_DELIVERY_MODE === 'string'
      ? input.EMAIL_DELIVERY_MODE.trim()
      : '';
  const emailDeliveryMode = rawMode.length > 0 ? rawMode : undefined;
  if (
    emailDeliveryMode !== undefined &&
    emailDeliveryMode !== 'smtp' &&
    emailDeliveryMode !== 'resend'
  ) {
    throw new Error(
      'EMAIL_DELIVERY_MODE must be "smtp" or "resend" if set, and left unset to use no email delivery (fails closed)',
    );
  }

  const smtpUser = optionalString(input.SMTP_USER);
  const smtpPassword = optionalString(input.SMTP_PASSWORD);

  if (emailDeliveryMode === undefined) {
    return {
      emailDeliveryMode,
      smtpHost: undefined,
      smtpPort: undefined,
      smtpSecure: undefined,
      smtpUser,
      smtpPassword,
      emailFrom: undefined,
      resendApiKey: undefined,
      otpFromEmail: undefined,
      invitationFromEmail: undefined,
    };
  }

  if (emailDeliveryMode === 'resend') {
    const resendApiKey = optionalString(input.RESEND_API_KEY);
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=resend');
    }
    const otpFromEmail = optionalString(input.OTP_FROM_EMAIL);
    if (!otpFromEmail || !otpFromEmail.includes('@')) {
      throw new Error(
        'OTP_FROM_EMAIL must be a non-empty address when EMAIL_DELIVERY_MODE=resend',
      );
    }
    const invitationFromEmail = optionalString(input.INVITATION_FROM_EMAIL);
    if (!invitationFromEmail || !invitationFromEmail.includes('@')) {
      throw new Error(
        'INVITATION_FROM_EMAIL must be a non-empty address when EMAIL_DELIVERY_MODE=resend',
      );
    }
    return {
      emailDeliveryMode,
      smtpHost: undefined,
      smtpPort: undefined,
      smtpSecure: undefined,
      smtpUser,
      smtpPassword,
      emailFrom: undefined,
      resendApiKey,
      otpFromEmail,
      invitationFromEmail,
    };
  }

  const smtpHost = optionalString(input.SMTP_HOST);
  if (!smtpHost) {
    throw new Error('SMTP_HOST is required when EMAIL_DELIVERY_MODE=smtp');
  }
  const smtpPort = Number(input.SMTP_PORT);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) {
    throw new Error(
      'SMTP_PORT must be an integer between 1 and 65535 when EMAIL_DELIVERY_MODE=smtp',
    );
  }
  const smtpSecure = parseRequiredBoolean(
    'SMTP_SECURE',
    input.SMTP_SECURE,
    'smtp',
  );
  const emailFrom = optionalString(input.EMAIL_FROM);
  if (!emailFrom || !emailFrom.includes('@')) {
    throw new Error(
      'EMAIL_FROM must be a non-empty address when EMAIL_DELIVERY_MODE=smtp',
    );
  }

  return {
    emailDeliveryMode,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    emailFrom,
    resendApiKey: undefined,
    otpFromEmail: undefined,
    invitationFromEmail: undefined,
  };
}

function optionalString(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRequiredBoolean(
  name: string,
  value: unknown,
  requiredForMode: string,
): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `${name} must be "true" or "false" when EMAIL_DELIVERY_MODE=${requiredForMode}`,
  );
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('OTP_DIAGNOSTICS must be "true" or "false" when set');
}
