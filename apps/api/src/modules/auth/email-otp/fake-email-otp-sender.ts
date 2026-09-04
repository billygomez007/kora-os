import { Injectable } from '@nestjs/common';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';

/**
 * Test double. Captures deliveries in memory only, inside this test
 * process — never via `console`/`Logger` and never over a real network
 * connection — so tests can retrieve the code a real user would have
 * received by email, without that value ever touching application logs.
 *
 * Only `createEmailOtpSender` (email-otp-sender.factory.ts) constructs
 * this class, and only when NODE_ENV=test; no development or production
 * configuration can select it. Tests that need to read a code back
 * should get an instance through that factory path — e.g. via
 * `EMAIL_OTP_SENDER` — rather than constructing one directly and wiring
 * it in some other way, so that invariant stays enforced in one place.
 */
@Injectable()
export class FakeEmailOtpSender implements EmailOtpSender {
  private readonly deliveries: EmailOtpDeliveryParams[] = [];

  async send(params: EmailOtpDeliveryParams): Promise<void> {
    this.deliveries.push(params);
  }

  /** The most recent code sent to this email, or throws if none was. */
  lastCodeFor(emailNormalized: string): string {
    const match = [...this.deliveries]
      .reverse()
      .find((delivery) => delivery.emailNormalized === emailNormalized);
    if (!match) {
      throw new Error(`No OTP was sent to ${emailNormalized}`);
    }
    return match.code;
  }

  clear(): void {
    this.deliveries.length = 0;
  }
}
