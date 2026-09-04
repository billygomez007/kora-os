/**
 * Provider-neutral delivery boundary (docs task Phase D). No production
 * email provider is integrated yet — see docs/SECURITY.md for exactly
 * where one connects. Implementations must never resolve successfully
 * without actually attempting delivery; see UnconfiguredEmailOtpSender
 * for the fail-closed production default.
 */
export const EMAIL_OTP_SENDER = Symbol('EMAIL_OTP_SENDER');

export interface EmailOtpDeliveryParams {
  emailNormalized: string;
  code: string;
  expiresAt: Date;
}

export interface EmailOtpSender {
  send(params: EmailOtpDeliveryParams): Promise<void>;
}
