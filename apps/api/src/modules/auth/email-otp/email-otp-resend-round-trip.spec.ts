import { ConfigService } from '@nestjs/config';
import { EmailOtpService } from './email-otp.service.js';
import { ResendEmailOtpSender } from './resend-email-otp-sender.js';

/**
 * End-to-end round trip through the *real* production email pipeline
 * (EmailOtpService -> ResendEmailOtpSender -> the shared HTML/text
 * template builders), not the `{ send: vi.fn() }` stub every other spec
 * in this module uses. Investigating a production report of "the exact
 * code from the email is rejected as invalid" (docs task: OTP digest
 * mismatch investigation) — this test captures the code from the actual
 * JSON payload Resend would receive, at the same final boundary a real
 * recipient's email client renders from, and feeds only that captured
 * value into verifyChallenge. It never independently reconstructs or
 * assumes the code — if any layer between generation and the Resend
 * payload ever diverges, this test fails; it does not currently.
 */
describe('EmailOtpService + ResendEmailOtpSender — full round trip', () => {
  afterEach(() => vi.unstubAllGlobals());

  function extractCodeFromEmailText(text: string): string {
    // buildOtpEmailText puts the code alone on its own line — the one
    // line that is purely digits — so this reads it the same way an
    // actual recipient reads it out of the email body, not by re-deriving
    // it from anything EmailOtpService already computed.
    const line = text.split('\n').find((candidate) => /^\d{4,10}$/.test(candidate));
    if (!line) throw new Error('No digit-only line found in the rendered OTP email text');
    return line;
  }

  it('requestChallenge -> real Resend template rendering -> verifyChallenge succeeds with the exact code Resend would have delivered', async () => {
    let persisted: Record<string, unknown> | undefined;
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          // Mirrors the Prisma-schema-level defaults this stub has no
          // database to apply for it (status/attemptCount are @default(...)
          // columns, never set explicitly by requestChallenge itself).
          persisted = { status: 'ACTIVE', attemptCount: 0, ...data };
          return persisted;
        }),
        findUnique: vi.fn(async () => persisted),
        count: vi.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-1', emailNormalized: 'round-trip@example.test' }),
      },
      authIdentity: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: 'p'.repeat(32),
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
      RESEND_API_KEY: 're_do_not_leak_this_00000000000000000000',
      OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
    });
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };

    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const resendSender = new ResendEmailOtpSender(config);

    const service = new EmailOtpService(
      prismaStub as never,
      config,
      resendSender,
      auditService as never,
    );

    const { challengeId } = await service.requestChallenge({
      email: 'round-trip@example.test',
      requestId: 'req-round-trip',
    });

    // The exact JSON body ResendEmailSender submitted to Resend's API —
    // nothing closer to "what the recipient's email client would render"
    // is available outside a real inbox.
    const resendRequestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const resendPayload = JSON.parse(String(resendRequestInit.body)) as {
      text: string;
      html: string;
    };
    const deliveredCode = extractCodeFromEmailText(resendPayload.text);

    // The HTML body must carry the identical code, not a separately
    // formatted one.
    expect(resendPayload.html).toContain(deliveredCode);

    const result = await service.verifyChallenge({
      challengeId,
      code: deliveredCode,
      requestId: 'req-round-trip-verify',
    });

    expect(result.emailNormalized).toBe('round-trip@example.test');
  });

  it('preserves a leading-zero code all the way from generation through the real Resend payload to successful verification', async () => {
    // Deterministic in place of generateOtpCode, so this run is guaranteed
    // to exercise the leading-zero case rather than depending on random
    // chance — everything downstream (digest, template, verify) is still
    // the real, unmodified production code path.
    vi.doMock('node:crypto', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:crypto')>();
      return { ...actual, randomInt: (_min: number, _max: number) => 3 };
    });
    vi.resetModules();
    const { EmailOtpService: FreshEmailOtpService } = await import('./email-otp.service.js');
    const { ResendEmailOtpSender: FreshResendEmailOtpSender } = await import(
      './resend-email-otp-sender.js'
    );

    let persisted: Record<string, unknown> | undefined;
    const prismaStub = {
      emailOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          // Mirrors the Prisma-schema-level defaults this stub has no
          // database to apply for it (status/attemptCount are @default(...)
          // columns, never set explicitly by requestChallenge itself).
          persisted = { status: 'ACTIVE', attemptCount: 0, ...data };
          return persisted;
        }),
        findUnique: vi.fn(async () => persisted),
        count: vi.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-1', emailNormalized: 'leading-zero@example.test' }),
      },
      authIdentity: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const config = new ConfigService({
      OTP_CODE_LENGTH: 6,
      OTP_EXPIRY_MINUTES: 10,
      OTP_MAX_ATTEMPTS: 5,
      OTP_PEPPER: 'p'.repeat(32),
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR: 5,
      OTP_MAX_REQUESTS_PER_IP_PER_HOUR: 20,
      RESEND_API_KEY: 're_do_not_leak_this_00000000000000000000',
      OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
    });
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };

    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const resendSender = new FreshResendEmailOtpSender(config);
    const service = new FreshEmailOtpService(
      prismaStub as never,
      config,
      resendSender,
      auditService as never,
    );

    const { challengeId } = await service.requestChallenge({
      email: 'leading-zero@example.test',
      requestId: 'req-leading-zero',
    });

    const resendRequestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const resendPayload = JSON.parse(String(resendRequestInit.body)) as { text: string };
    const deliveredCode = extractCodeFromEmailText(resendPayload.text);
    expect(deliveredCode).toBe('000003');

    const result = await service.verifyChallenge({
      challengeId,
      code: deliveredCode,
      requestId: 'req-leading-zero-verify',
    });
    expect(result.emailNormalized).toBe('leading-zero@example.test');

    vi.doUnmock('node:crypto');
    vi.resetModules();
  });
});
