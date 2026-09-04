import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';

/**
 * SMTP delivery adapter behind the EmailOtpSender port. Selected whenever
 * EMAIL_DELIVERY_MODE=smtp (see environment.ts and EmailOtpModule) —
 * development points this at the local Mailpit container
 * (infrastructure/compose.yaml, no real provider); a real production
 * provider connects later by pointing SMTP_HOST/SMTP_PORT/SMTP_USER/
 * SMTP_PASSWORD at that provider's SMTP endpoint. No provider is chosen
 * and no production credentials are added by this class.
 *
 * `logger`/`debug` are explicitly left off (nodemailer defaults to off,
 * but this is pinned rather than relied on): those options print raw SMTP
 * protocol traffic, which for this transport's DATA command includes the
 * OTP code itself. Every failure is caught here and re-thrown as
 * EmailDeliveryUnavailableError with only the error's name logged — never
 * the message, since SMTP client libraries routinely echo the remote
 * server's response text (which can itself echo back parts of the
 * request) into Error#message.
 */
@Injectable()
export class SmtpEmailOtpSender implements EmailOtpSender {
  private readonly logger = new Logger(SmtpEmailOtpSender.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    this.fromAddress = config.getOrThrow<string>('EMAIL_FROM');
    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: config.getOrThrow<boolean>('SMTP_SECURE'),
      auth: user && password ? { user, pass: password } : undefined,
      logger: false,
      debug: false,
    });
  }

  async send(params: EmailOtpDeliveryParams): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.emailNormalized,
        subject: 'Your Kora sign-in code',
        text: `Your Kora sign-in code is ${params.code}. It expires at ${params.expiresAt.toISOString()} and can only be used once.`,
      });
    } catch (error) {
      this.logger.error(
        `Email OTP delivery via SMTP failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      throw new EmailDeliveryUnavailableError();
    }
  }
}
