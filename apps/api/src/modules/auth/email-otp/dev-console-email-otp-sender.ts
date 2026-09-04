import { Injectable } from '@nestjs/common';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';

/**
 * Local-development-only convenience sender (docs task Phase D). Writes
 * directly to stdout via `console.log` — never through Nest's `Logger`
 * (the application/audit logging path docs task Phase E's "do not print
 * OTP values in application logs" governs) — the same distinction tools
 * like Rails' letter_opener or Django's console email backend draw
 * between "a log line" and "the one place a developer can see what a
 * real email provider would have sent." It exists only so a developer
 * running `pnpm api:dev` locally can complete a login without a real
 * email provider configured; it is never reachable in a deployed
 * environment.
 *
 * The constructor throws if NODE_ENV is "production", so this class
 * cannot be used there even if a future change mis-wires it — the
 * module-level guard (EmailOtpModule) is the primary control, this is
 * the belt-and-suspenders second one.
 */
@Injectable()
export class DevConsoleEmailOtpSender implements EmailOtpSender {
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevConsoleEmailOtpSender must never be constructed in production',
      );
    }
  }

  async send(params: EmailOtpDeliveryParams): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '=== [DEV ONLY — never runs in production] Kora email OTP ===',
        `To:      ${params.emailNormalized}`,
        `Code:    ${params.code}`,
        `Expires: ${params.expiresAt.toISOString()}`,
        '==============================================================',
        '',
      ].join('\n'),
    );
  }
}
