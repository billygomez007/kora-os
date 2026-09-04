import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../../audit/audit.module.js';
import { DevConsoleEmailOtpSender } from './dev-console-email-otp-sender.js';
import { EMAIL_OTP_SENDER } from './email-otp-sender.interface.js';
import { EmailOtpService } from './email-otp.service.js';
import { FakeEmailOtpSender } from './fake-email-otp-sender.js';
import { UnconfiguredEmailOtpSender } from './unconfigured-email-otp-sender.js';

/**
 * Selects the EmailOtpSender implementation by environment (docs task
 * Phase D): production always fails closed (UnconfiguredEmailOtpSender —
 * no real provider is integrated yet, see docs/SECURITY.md for exactly
 * where one connects); test uses the in-memory fake so specs never touch
 * a real send path; development uses the loud, clearly-labeled stdout
 * catcher so a developer can complete a sign-in locally. Tests that need
 * to *read back* a sent code (rather than merely avoid a real send)
 * additionally override this provider with a shared FakeEmailOtpSender
 * instance — see test/auth.e2e-spec.ts.
 */
@Module({
  imports: [AuditModule],
  providers: [
    EmailOtpService,
    {
      provide: EMAIL_OTP_SENDER,
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV');
        if (nodeEnv === 'production') {
          return new UnconfiguredEmailOtpSender();
        }
        if (nodeEnv === 'test') {
          return new FakeEmailOtpSender();
        }
        return new DevConsoleEmailOtpSender();
      },
      inject: [ConfigService],
    },
  ],
  exports: [EmailOtpService, EMAIL_OTP_SENDER],
})
export class EmailOtpModule {}
