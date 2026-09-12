import { ConfigService } from '@nestjs/config';
import { createEmailOtpSender } from './email-otp-sender.factory.js';
import { FakeEmailOtpSender } from './fake-email-otp-sender.js';
import { ResendEmailOtpSender } from './resend-email-otp-sender.js';
import { UnconfiguredEmailOtpSender } from './unconfigured-email-otp-sender.js';

const SMTP_CONFIG = {
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  EMAIL_FROM: 'Kora <no-reply@kora.local>',
};

function configFor(values: Record<string, unknown>): ConfigService {
  return new ConfigService(values);
}

describe('createEmailOtpSender', () => {
  it('always returns the in-memory fake in test, regardless of EMAIL_DELIVERY_MODE', () => {
    const withoutMode = createEmailOtpSender(configFor({ NODE_ENV: 'test' }));
    const withSmtpMode = createEmailOtpSender(
      configFor({ NODE_ENV: 'test', EMAIL_DELIVERY_MODE: 'smtp', ...SMTP_CONFIG }),
    );
    const withResendMode = createEmailOtpSender(
      configFor({
        NODE_ENV: 'test',
        EMAIL_DELIVERY_MODE: 'resend',
        RESEND_API_KEY: 're_placeholder_not_a_real_key',
        OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
      }),
    );

    expect(withoutMode).toBeInstanceOf(FakeEmailOtpSender);
    expect(withSmtpMode).toBeInstanceOf(FakeEmailOtpSender);
    expect(withResendMode).toBeInstanceOf(FakeEmailOtpSender);
  });

  it('fails closed in development when no delivery mode is configured', () => {
    const sender = createEmailOtpSender(configFor({ NODE_ENV: 'development' }));
    expect(sender).toBeInstanceOf(UnconfiguredEmailOtpSender);
  });

  it('fails closed in production when no delivery mode is configured — never console, never the fake', () => {
    const sender = createEmailOtpSender(configFor({ NODE_ENV: 'production' }));
    expect(sender).toBeInstanceOf(UnconfiguredEmailOtpSender);
    expect(sender).not.toBeInstanceOf(FakeEmailOtpSender);
  });

  it('selects real SMTP delivery in development when EMAIL_DELIVERY_MODE=smtp (Mailpit)', async () => {
    const { SmtpEmailOtpSender } = await import('./smtp-email-otp-sender.js');
    const sender = createEmailOtpSender(
      configFor({ NODE_ENV: 'development', EMAIL_DELIVERY_MODE: 'smtp', ...SMTP_CONFIG }),
    );
    expect(sender).toBeInstanceOf(SmtpEmailOtpSender);
  });

  it('selects real SMTP delivery in production only when EMAIL_DELIVERY_MODE=smtp is explicitly set', async () => {
    const { SmtpEmailOtpSender } = await import('./smtp-email-otp-sender.js');
    const sender = createEmailOtpSender(
      configFor({ NODE_ENV: 'production', EMAIL_DELIVERY_MODE: 'smtp', ...SMTP_CONFIG }),
    );
    expect(sender).toBeInstanceOf(SmtpEmailOtpSender);
  });

  it('selects Resend HTTPS delivery when EMAIL_DELIVERY_MODE=resend', () => {
    const sender = createEmailOtpSender(
      configFor({
        NODE_ENV: 'production',
        EMAIL_DELIVERY_MODE: 'resend',
        RESEND_API_KEY: 're_placeholder_not_a_real_key',
        OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
      }),
    );
    expect(sender).toBeInstanceOf(ResendEmailOtpSender);
  });
});
