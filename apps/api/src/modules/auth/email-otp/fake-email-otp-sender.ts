import { Injectable } from '@nestjs/common';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';

/**
 * Test double (docs task Phase D: "Tests must use an injected fake
 * sender that captures codes without logging them"). Captures deliveries
 * in memory only — never via `console`/`Logger` — so tests can retrieve
 * the code a real user would have received by email, without that value
 * ever touching application logs.
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
