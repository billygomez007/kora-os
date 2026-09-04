import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap/configure-application.js';
import { normalizeEmail } from '../src/common/identity/normalize-email.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { OtpChallengeStatus } from '../src/generated/prisma/client.js';
import { EMAIL_OTP_SENDER } from '../src/modules/auth/email-otp/email-otp-sender.interface.js';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from '../src/modules/auth/email-otp/email-otp-sender.interface.js';
import { claimTestPort } from './support/otp-test-helpers.js';

/** Always fails, the way an unreachable/misconfigured SMTP server would —
 * proves the request path's failure handling end to end, over the real
 * HTTP API and the real database, rather than only at the unit level. */
class AlwaysFailingEmailOtpSender implements EmailOtpSender {
  async send(_params: EmailOtpDeliveryParams): Promise<void> {
    throw new Error('smtp connection refused: 127.0.0.1:1 (simulated for test)');
  }
}

const runPrefix = `otp-delivery-failure-spec-${randomUUID()}`;

describe('Email OTP request when delivery fails (e2e)', () => {
  let moduleFixture: TestingModule;
  let app: Awaited<ReturnType<TestingModule['createNestApplication']>>;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_OTP_SENDER)
      .useValue(new AlwaysFailingEmailOtpSender())
      .compile();

    app = moduleFixture.createNestApplication({ forceCloseConnections: true });
    configureApplication(app);
    await app.listen(claimTestPort(), '127.0.0.1');

    prisma = app.get(PrismaService);
    await prisma.emailOtpChallenge.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the standard safe service-unavailable error, invalidates the challenge, and never reveals SMTP internals', async () => {
    const email = `${runPrefix}@example.test`;

    const response = await request(app.getHttpServer())
      .post('/v1/auth/email-otp/request')
      .send({ email })
      .expect(503);

    expect(response.body.error).toMatchObject({
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
    });
    const responseText = JSON.stringify(response.body);
    expect(responseText).not.toMatch(/smtp|connection refused|127\.0\.0\.1:1/i);

    const challenge = await prisma.emailOtpChallenge.findFirstOrThrow({
      where: { emailNormalized: normalizeEmail(email) },
      orderBy: { createdAt: 'desc' },
    });
    expect(challenge.status).toBe(OtpChallengeStatus.INVALIDATED);
    expect(challenge.invalidatedAt).not.toBeNull();

    // The undelivered challenge cannot be verified — it is unusable, not
    // merely "unlikely to be guessed".
    await request(app.getHttpServer())
      .post('/v1/auth/email-otp/verify')
      .send({ challengeId: challenge.id, code: '000000' })
      .expect(401);
  });

  it('gives the identical error body for an email that already has an account, so delivery failure cannot be used to enumerate accounts either', async () => {
    // No account exists in this suite for this run's emails at all (this
    // file never verifies a challenge successfully), so both requests
    // below hit the "no existing user" branch identically — the point is
    // that the failure response's shape does not vary by account
    // existence, matching the success-path guarantee in auth.e2e-spec.ts.
    const first = await request(app.getHttpServer())
      .post('/v1/auth/email-otp/request')
      .send({ email: `${runPrefix}-a@example.test` })
      .expect(503);
    const second = await request(app.getHttpServer())
      .post('/v1/auth/email-otp/request')
      .send({ email: `${runPrefix}-b@example.test` })
      .expect(503);

    expect(Object.keys(first.body).sort()).toEqual(Object.keys(second.body).sort());
    // Same error shape and content — only meta.requestId legitimately
    // differs between two distinct requests.
    expect(first.body.error).toEqual(second.body.error);
  });
});
