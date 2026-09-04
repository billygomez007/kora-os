import type { ConfigService } from '@nestjs/config';
import type { EmailOtpSender } from './email-otp-sender.interface.js';
import { FakeEmailOtpSender } from './fake-email-otp-sender.js';
import { SmtpEmailOtpSender } from './smtp-email-otp-sender.js';
import { UnconfiguredEmailOtpSender } from './unconfigured-email-otp-sender.js';

/**
 * Selects the EmailOtpSender implementation. Two invariants matter more
 * than which sender is picked:
 *
 * - FakeEmailOtpSender is reachable only when NODE_ENV=test, and nothing
 *   in EMAIL_DELIVERY_MODE or any other config value can select it —
 *   there is no config-driven path from a real environment to the
 *   in-memory test double.
 * - Every other environment gets a real-or-nothing choice: EMAIL_DELIVERY_MODE
 *   must be exactly "smtp" (validated in environment.ts; any other value
 *   fails startup) to get SmtpEmailOtpSender, otherwise delivery is
 *   UnconfiguredEmailOtpSender, which always fails closed. There is no
 *   console/stdout option to fall back to.
 */
export function createEmailOtpSender(config: ConfigService): EmailOtpSender {
  const nodeEnv = config.get<string>('NODE_ENV');
  if (nodeEnv === 'test') {
    return new FakeEmailOtpSender();
  }

  const deliveryMode = config.get<string>('EMAIL_DELIVERY_MODE');
  if (deliveryMode === 'smtp') {
    return new SmtpEmailOtpSender(config);
  }

  return new UnconfiguredEmailOtpSender();
}
