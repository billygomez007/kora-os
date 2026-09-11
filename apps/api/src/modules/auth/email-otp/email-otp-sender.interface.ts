/**
 * Provider-neutral delivery boundary (docs task Phase D). No production
 * email provider is integrated yet — see docs/SECURITY.md for exactly
 * where one connects. Implementations must never resolve successfully
 * without actually attempting delivery; see UnconfiguredEmailOtpSender
 * for the fail-closed default when no provider is configured.
 */
export const EMAIL_OTP_SENDER = Symbol('EMAIL_OTP_SENDER');

export interface EmailOtpDeliveryParams {
  emailNormalized: string;
  code: string;
  expiresAt: Date;
  /** The same `OTP_EXPIRY_MINUTES` value used to compute `expiresAt`,
   * passed through explicitly so an email's "this code expires in ..."
   * wording is always sourced from the one configuration value that
   * actually controls validity — never a separately reconstructed or
   * independently worded duration that could drift from it. */
  expiryMinutes: number;
}

export interface EmailOtpSender {
  send(params: EmailOtpDeliveryParams): Promise<void>;
}
