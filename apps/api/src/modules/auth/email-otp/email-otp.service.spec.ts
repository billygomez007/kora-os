import { Logger, ServiceUnavailableException } from '@nestjs/common';
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
  options: { existingUserId?: string | null; diagnostics?: boolean } = {},
) {
  const prismaStub = {
    emailOtpChallenge: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
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
    OTP_DIAGNOSTICS: options.diagnostics ?? false,
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
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
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

describe('EmailOtpService — safe diagnostics', () => {
  it('never logs the generated OTP or digest when diagnostics are enabled', async () => {
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: 'p'.repeat(32),
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
      OTP_DIAGNOSTICS: true,
    });
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new EmailOtpService(
      prismaStub as never,
      config,
      sender as never,
      auditService as never,
    );

    await service.requestChallenge({ email: 'new@example.test', requestId: 'req-safe' });

    const generatedCode = sender.send.mock.calls[0][0].code as string;
    const logs = loggerWarn.mock.calls.flat().map(String).join('\n');
    expect(logs).not.toContain(generatedCode);
    expect(logs).not.toMatch(/[a-f0-9]{64}/i);
    expect(logs).toContain('hashMatched=unknown');
    loggerWarn.mockRestore();
  });

  it('proves the stored digest matches the generated code via an in-process self-check, and confirms the email payload checkpoint fires with the right length', async () => {
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: 'p'.repeat(32),
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
      OTP_DIAGNOSTICS: true,
    });
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new EmailOtpService(
      prismaStub as never,
      config,
      sender as never,
      auditService as never,
    );

    await service.requestChallenge({ email: 'new@example.test', requestId: 'req-selfcheck' });

    const logs = loggerWarn.mock.calls.flat().map(String);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /event=request_digest_self_check .*storedDigestMatchesGeneratedCode=yes.*generatedCodeLength=6/,
        ),
        expect.stringMatching(/event=email_payload_prepared .*codeLength=6/),
      ]),
    );
    loggerWarn.mockRestore();
  });

  it('tags each diagnostic line with a replica/deployment identity, never the pepper itself', async () => {
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const pepper = 'p'.repeat(32);
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: pepper,
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
      OTP_DIAGNOSTICS: true,
    });
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const previousReplicaId = process.env.RAILWAY_REPLICA_ID;
    const previousDeploymentId = process.env.RAILWAY_DEPLOYMENT_ID;
    process.env.RAILWAY_REPLICA_ID = 'replica-a';
    process.env.RAILWAY_DEPLOYMENT_ID = 'deploy-a';
    const service = new EmailOtpService(
      prismaStub as never,
      config,
      sender as never,
      auditService as never,
    );

    try {
      await service.requestChallenge({ email: 'new@example.test', requestId: 'req-replica' });
    } finally {
      if (previousReplicaId === undefined) delete process.env.RAILWAY_REPLICA_ID;
      else process.env.RAILWAY_REPLICA_ID = previousReplicaId;
      if (previousDeploymentId === undefined) delete process.env.RAILWAY_DEPLOYMENT_ID;
      else process.env.RAILWAY_DEPLOYMENT_ID = previousDeploymentId;
    }

    const logs = loggerWarn.mock.calls.flat().map(String).join('\n');
    expect(logs).toContain('replicaId=replica-a');
    expect(logs).toContain('deploymentId=deploy-a');
    expect(logs).not.toContain(pepper);
    loggerWarn.mockRestore();
  });
});

describe('EmailOtpService — cross-instance OTP_PEPPER consistency', () => {
  /**
   * Documents, against the real service (not just the pure digest
   * helper), exactly what a deployment where two running instances hold
   * a different OTP_PEPPER looks like: the code delivered to the user is
   * objectively correct, entered correctly, and still rejected — because
   * the instance that persisted codeDigest and the instance that
   * recomputes it for comparison disagree on the key. This is the
   * "request handled by replica A, verify handled by replica B with a
   * different secret" hypothesis from the production OTP incident,
   * reproduced deterministically without any real infrastructure.
   */
  function buildServiceWithPepper(pepper: string, options: { diagnostics?: boolean } = {}) {
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
        findUnique: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-1', emailNormalized: 'user@example.test' }),
      },
      authIdentity: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: pepper,
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
      OTP_DIAGNOSTICS: options.diagnostics ?? false,
    });
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new EmailOtpService(
      prismaStub as never,
      config,
      sender as never,
      auditService as never,
    );
    return { service, prismaStub, sender };
  }

  async function requestThenBuildStoredChallenge(pepper: string) {
    const requester = buildServiceWithPepper(pepper);
    await requester.service.requestChallenge({ email: 'user@example.test', requestId: 'req-a' });

    const created = requester.prismaStub.emailOtpChallenge.create.mock.calls[0][0].data;
    const deliveredCode = requester.sender.send.mock.calls[0][0].code as string;
    const storedChallenge = {
      id: created.id,
      emailNormalized: created.emailNormalized,
      codeDigest: created.codeDigest,
      status: OtpChallengeStatus.ACTIVE,
      expiresAt: created.expiresAt,
      attemptCount: 0,
      maxAttempts: created.maxAttempts,
    };
    return { deliveredCode, storedChallenge };
  }

  it('rejects the exact correct, freshly-delivered code when the verifying instance holds a different OTP_PEPPER', async () => {
    const pepperOnReplicaA = 'a'.repeat(32);
    const pepperOnReplicaB = 'b'.repeat(32);
    const { deliveredCode, storedChallenge } = await requestThenBuildStoredChallenge(pepperOnReplicaA);

    const verifier = buildServiceWithPepper(pepperOnReplicaB);
    verifier.prismaStub.emailOtpChallenge.findUnique.mockResolvedValue(storedChallenge);

    await expect(
      verifier.service.verifyChallenge({
        challengeId: storedChallenge.id,
        code: deliveredCode,
        requestId: 'req-b',
      }),
    ).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
  });

  it('accepts the same exact correct code when both instances share the same OTP_PEPPER (control case)', async () => {
    const sharedPepper = 'a'.repeat(32);
    const { deliveredCode, storedChallenge } = await requestThenBuildStoredChallenge(sharedPepper);

    const verifier = buildServiceWithPepper(sharedPepper);
    verifier.prismaStub.emailOtpChallenge.findUnique.mockResolvedValue(storedChallenge);
    verifier.prismaStub.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      verifier.service.verifyChallenge({
        challengeId: storedChallenge.id,
        code: deliveredCode,
        requestId: 'req-b',
      }),
    ).resolves.toMatchObject({ emailNormalized: 'user@example.test' });
  });

  it('logs the submitted code length (never the code) alongside a hash-mismatch rejection', async () => {
    const pepper = 'a'.repeat(32);
    const { storedChallenge } = await requestThenBuildStoredChallenge(pepper);

    const verifier = buildServiceWithPepper(pepper, { diagnostics: true });
    verifier.prismaStub.emailOtpChallenge.findUnique.mockResolvedValue(storedChallenge);
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const wrongCode = '999999';
    await expect(
      verifier.service.verifyChallenge({
        challengeId: storedChallenge.id,
        code: wrongCode,
        requestId: 'req-wrong',
      }),
    ).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });

    const logs = loggerWarn.mock.calls.flat().map(String);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/event=verify_submitted_code_shape .*submittedCodeLength=6/),
      ]),
    );
    expect(logs.join('\n')).not.toContain(wrongCode);
    loggerWarn.mockRestore();
  });

  it('logs matching request-time and verify-time row fingerprints for a stable challenge, and a matching digest comparison', async () => {
    const pepper = 'a'.repeat(32);
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const requester = buildServiceWithPepper(pepper, { diagnostics: true });
    await requester.service.requestChallenge({ email: 'user@example.test', requestId: 'req-a' });
    const created = requester.prismaStub.emailOtpChallenge.create.mock.calls[0][0].data;
    const deliveredCode = requester.sender.send.mock.calls[0][0].code as string;
    const storedChallenge = {
      id: created.id,
      emailNormalized: created.emailNormalized,
      codeDigest: created.codeDigest,
      status: OtpChallengeStatus.ACTIVE,
      expiresAt: created.expiresAt,
      attemptCount: 0,
      maxAttempts: created.maxAttempts,
    };

    const verifier = buildServiceWithPepper(pepper, { diagnostics: true });
    verifier.prismaStub.emailOtpChallenge.findUnique.mockResolvedValue(storedChallenge);
    verifier.prismaStub.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });

    await verifier.service.verifyChallenge({
      challengeId: storedChallenge.id,
      code: deliveredCode,
      requestId: 'req-b',
    });

    const logs = loggerWarn.mock.calls.flat().map(String);
    const requestFingerprintLine = logs.find(
      (line) => line.includes('event=challenge_row_fingerprint') && line.includes('phase=request'),
    );
    const verifyFingerprintLine = logs.find(
      (line) => line.includes('event=challenge_row_fingerprint') && line.includes('phase=verify'),
    );
    expect(requestFingerprintLine).toBeDefined();
    expect(verifyFingerprintLine).toBeDefined();

    const extractField = (line: string, field: string) =>
      line.match(new RegExp(`${field}=(\\S+)`))?.[1];
    expect(extractField(verifyFingerprintLine!, 'digestFingerprint')).toBe(
      extractField(requestFingerprintLine!, 'digestFingerprint'),
    );
    expect(extractField(verifyFingerprintLine!, 'emailFingerprint')).toBe(
      extractField(requestFingerprintLine!, 'emailFingerprint'),
    );

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/event=verify_digest_comparison .*match=yes/),
        expect.stringMatching(
          /event=generated_code_shape .*generatedCodeLength=6 generatedCodeByteLength=6 generatedCodeAsciiDigits=yes/,
        ),
      ]),
    );

    loggerWarn.mockRestore();
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
