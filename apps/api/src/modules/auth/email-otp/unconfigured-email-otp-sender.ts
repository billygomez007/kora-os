import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';

/** Thrown by UnconfiguredEmailOtpSender; the OTP request path (not this
 * class) translates it into a safe 503 response. */
export class EmailDeliveryUnavailableError extends Error {
  constructor() {
    super('Email delivery is not available');
  }
}

/**
 * The production-safe default when no real email provider is wired in
 * (docs task Phase D: "Production must fail closed or report unavailable
 * delivery when no real provider is configured. Do not silently pretend
 * an email was delivered."). Always throws rather than resolving —
 * there is no code path here that can be mistaken for a successful send.
 * Logs that a send was attempted (not the code, not the email) so an
 * operator can see delivery is unconfigured without any sensitive value
 * reaching the logs.
 */
@Injectable()
export class UnconfiguredEmailOtpSender implements EmailOtpSender {
  private readonly logger = new Logger(UnconfiguredEmailOtpSender.name);

  async send(_params: EmailOtpDeliveryParams): Promise<void> {
    this.logger.error(
      'Email OTP delivery was attempted but no email provider is configured',
    );
    throw new EmailDeliveryUnavailableError();
  }
}
