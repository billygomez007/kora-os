import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../../audit/audit.module.js';
import { createEmailOtpSender } from './email-otp-sender.factory.js';
import { EMAIL_OTP_SENDER } from './email-otp-sender.interface.js';
import { EmailOtpService } from './email-otp.service.js';

/**
 * Selects the EmailOtpSender implementation by environment — see
 * createEmailOtpSender for the selection rules and the invariants they
 * guarantee (fake sender is test-only; every other environment is
 * real-delivery-or-fail-closed, never console/stdout).
 */
@Module({
  imports: [AuditModule],
  providers: [
    EmailOtpService,
    {
      provide: EMAIL_OTP_SENDER,
      useFactory: createEmailOtpSender,
      inject: [ConfigService],
    },
  ],
  exports: [EmailOtpService, EMAIL_OTP_SENDER],
})
export class EmailOtpModule {}
