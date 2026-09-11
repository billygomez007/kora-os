import { Injectable } from '@nestjs/common';
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
  private readonly sender: ResendEmailSender;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    this.sender = new ResendEmailSender(config);
    this.fromAddress = config.getOrThrow<string>('OTP_FROM_EMAIL');
  }

  async send(params: EmailOtpDeliveryParams): Promise<void> {
    try {
      await this.sender.send({
        from: this.fromAddress,
        to: params.emailNormalized,
        subject: 'Your Kora OS sign-in code',
        text: buildOtpEmailText(params),
        html: buildOtpEmailHtml(params),
      });
    } catch {
      throw new EmailDeliveryUnavailableError();
    }
  }
}
