import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendEmailSender } from '../../../common/email/resend-email-sender.js';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';
import { buildOtpEmailHtml, buildOtpEmailText } from './smtp-email-otp-sender.js';

@Injectable()
export class ResendEmailOtpSender implements EmailOtpSender {
  private readonly logger = new Logger(ResendEmailOtpSender.name);
  private readonly sender: ResendEmailSender;
  private readonly fromAddress: string;
  private readonly diagnosticsEnabled: boolean;

  constructor(config: ConfigService) {
    this.sender = new ResendEmailSender(config);
    this.fromAddress = config.getOrThrow<string>('OTP_FROM_EMAIL');
    const diagnostics = config.get<boolean | string>('OTP_DIAGNOSTICS');
    this.diagnosticsEnabled = diagnostics === true || diagnostics === 'true';
  }

  async send(params: EmailOtpDeliveryParams): Promise<void> {
    const text = buildOtpEmailText(params);
    const html = buildOtpEmailHtml(params);

    // Opt-in diagnostic only, and never the code or template content
    // itself: confirms the exact code this call received is present
    // verbatim in both rendered bodies immediately before they leave the
    // process for Resend's API. This layer has no challengeId to
    // correlate with EmailOtpService's own request/verify diagnostics
    // (EmailOtpDeliveryParams never carries one), so codeLength is the
    // only cross-reference available — still enough to prove or rule out
    // a template-rendering regression on its own.
    if (this.diagnosticsEnabled) {
      const codeLength = params.code.length;
      const textCarriesCode = text.includes(params.code);
      const htmlCarriesCode = html.includes(params.code);
      this.logger.warn(
        `OTP diagnostic event=email_template_rendered codeLength=${codeLength} textCarriesCode=${textCarriesCode ? 'yes' : 'no'} htmlCarriesCode=${htmlCarriesCode ? 'yes' : 'no'}`,
      );
    }

    try {
      await this.sender.send({
        from: this.fromAddress,
        to: params.emailNormalized,
        subject: 'Your Kora OS sign-in code',
        text,
        html,
      });
    } catch {
      throw new EmailDeliveryUnavailableError();
    }
  }
}
