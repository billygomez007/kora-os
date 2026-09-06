import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChallengeStatus } from '../../../generated/prisma/enums.js';
import { EmailOtpService } from './email-otp.service.js';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';

/**
 * Focused unit coverage for the one branch that is hard to exercise
 * through the e2e suite (which always uses FakeEmailOtpSender, and
 * FakeEmailOtpSender never fails): what happens when the configured
 * sender's send() rejects. Everything else about EmailOtpService (rate
 * limiting, atomic consumption, lockout, ...) already has thorough e2e
 * coverage in test/auth.e2e-spec.ts against a real database.
 */
function createServiceWithStubs(
  options: { existingUserId?: string | null } = {},
) {
  const prismaStub = {
    emailOtpChallenge: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options.existingUserId === undefined || options.existingUserId === null
          ? null
          : { id: options.existingUserId },
      ),
    },
  };
  const config = new ConfigService({
    OTP_CODE_LENGTH: 6,
    OTP_EXPIRY_MINUTES: 10,
    OTP_MAX_ATTEMPTS: 5,
    OTP_PEPPER: 'p'.repeat(32),
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
    OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
  });
  const failingSender = { send: vi.fn().mockRejectedValue(new EmailDeliveryUnavailableError()) };
  const auditService = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new EmailOtpService(
    prismaStub as never,
    config,
    failingSender as never,
    auditService as never,
  );

  return { service, prismaStub, failingSender, auditService };
}

describe('EmailOtpService — expiry wording stays tied to configuration', () => {
  it('passes the exact configured OTP_EXPIRY_MINUTES value to the sender, never a separately derived one', async () => {
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 17,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: 'p'.repeat(32),
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
    });
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new EmailOtpService(
      prismaStub as never,
      config,
      sender as never,
      auditService as never,
    );

    await service.requestChallenge({ email: 'new@example.test', requestId: 'req-1' });

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ expiryMinutes: 17 }),
    );
  });
});

describe('EmailOtpService — delivery failure', () => {
  it('invalidates the challenge rather than leaving it active when delivery fails', async () => {
    const { service, prismaStub } = createServiceWithStubs();

    await expect(
      service.requestChallenge({ email: 'new@example.test', requestId: 'req-1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prismaStub.emailOtpChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: OtpChallengeStatus.ACTIVE }),
        data: expect.objectContaining({
          status: OtpChallengeStatus.INVALIDATED,
          invalidatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('returns the same generic service-unavailable body whether or not the email already has an account', async () => {
    const forNewEmail = createServiceWithStubs({ existingUserId: null });
    const forExistingEmail = createServiceWithStubs({ existingUserId: 'user-1' });

    let newEmailError: unknown;
    let existingEmailError: unknown;
    try {
      await forNewEmail.service.requestChallenge({ email: 'new@example.test', requestId: 'req-1' });
    } catch (error) {
      newEmailError = error;
    }
    try {
      await forExistingEmail.service.requestChallenge({ email: 'existing@example.test', requestId: 'req-2' });
    } catch (error) {
      existingEmailError = error;
    }

    expect(newEmailError).toBeInstanceOf(ServiceUnavailableException);
    expect(existingEmailError).toBeInstanceOf(ServiceUnavailableException);
    const responseBody = (newEmailError as ServiceUnavailableException).getResponse();
    expect(responseBody).toEqual(
      (existingEmailError as ServiceUnavailableException).getResponse(),
    );
    expect(JSON.stringify(responseBody)).not.toMatch(/smtp|mailpit|nodemailer/i);
  });

  it('records a sanitized delivery-failure audit event with no code and no provider detail', async () => {
    const { service, auditService } = createServiceWithStubs({ existingUserId: 'user-1' });

    await expect(
      service.requestChallenge({ email: 'existing@example.test', requestId: 'req-3' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        action: 'auth.otp_delivery_failed',
        requestId: 'req-3',
      }),
    );
    const recordedCallArgs = JSON.stringify(auditService.record.mock.calls[0][0]);
    expect(recordedCallArgs).not.toMatch(/^\d{6}$/);
  });
});
