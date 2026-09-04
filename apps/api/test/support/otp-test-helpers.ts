import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap/configure-application.js';
import { normalizeEmail } from '../../src/common/identity/normalize-email.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { EMAIL_OTP_SENDER } from '../../src/modules/auth/email-otp/email-otp-sender.interface.js';
import { FakeEmailOtpSender } from '../../src/modules/auth/email-otp/fake-email-otp-sender.js';

export interface TestApp {
  app: INestApplication<App>;
  fakeEmailOtpSender: FakeEmailOtpSender;
  prisma: PrismaService;
}

/**
 * Boots a real Nest application from AppModule with the EMAIL_OTP_SENDER
 * provider overridden to a fresh FakeEmailOtpSender the caller can read
 * codes back from (docs task Phase D: "Tests must use an injected fake
 * sender that captures codes without logging them"). Pass `imports` to
 * additionally register test-only modules (e.g. a throwaway
 * branch-scoped route) alongside AppModule, same as
 * `Test.createTestingModule` accepts.
 */
export async function createTestApp(
  imports: unknown[] = [],
): Promise<TestApp> {
  const fakeEmailOtpSender = new FakeEmailOtpSender();
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule, ...(imports as never[])],
  })
    .overrideProvider(EMAIL_OTP_SENDER)
    .useValue(fakeEmailOtpSender)
    .compile();

  const app = moduleFixture.createNestApplication();
  configureApplication(app);
  await app.init();

  const prisma = app.get(PrismaService);
  // EmailOtpService's per-IP request limit is intentionally backed by the
  // database (real abuse protection has to survive a process restart),
  // not by the in-memory throttler storage a fresh DI container resets.
  // Every e2e test's requests originate from the same loopback address,
  // so without this, OTP-heavy test files exhaust
  // OTP_MAX_REQUESTS_PER_IP_PER_HOUR by accumulating challenge rows
  // across unrelated tests and files sharing the one local Postgres
  // instance. Clearing the table when a fresh app boots keeps that
  // real security behavior intact while giving each test (or at least
  // each `beforeEach`) a clean slate.
  await prisma.emailOtpChallenge.deleteMany({});

  return { app, fakeEmailOtpSender, prisma };
}

export interface SignedInUser {
  email: string;
  emailNormalized: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  response: request.Response;
}

/**
 * The one passwordless sign-in flow (docs task Phase C) end to end:
 * request a code, read it back from the fake sender, verify it. Works
 * identically whether `email` already has an account or not — that is
 * the point of the unified flow.
 *
 * Backdates any still-active challenge for this email before requesting,
 * so signing the same email in more than once within a test (a second
 * device, an existing user signing in again, ...) never trips the resend
 * cooldown — that cooldown has its own dedicated test in
 * auth.e2e-spec.ts ("enforces the resend cooldown").
 */
export async function signInWithEmailOtp(
  testApp: TestApp,
  email: string,
  overrides: { deviceLabel?: string } = {},
): Promise<SignedInUser> {
  const emailNormalized = normalizeEmail(email);

  await bypassOtpResendCooldown(testApp, emailNormalized);

  const requestResponse = await request(testApp.app.getHttpServer())
    .post('/v1/auth/email-otp/request')
    .send({ email })
    .expect(200);
  const challengeId = requestResponse.body.data.challengeId as string;
  const code = testApp.fakeEmailOtpSender.lastCodeFor(emailNormalized);

  const verifyResponse = await request(testApp.app.getHttpServer())
    .post('/v1/auth/email-otp/verify')
    .send({ challengeId, code, deviceLabel: overrides.deviceLabel })
    .expect(200);

  return {
    email,
    emailNormalized,
    userId: verifyResponse.body.data.user.id,
    accessToken: verifyResponse.body.data.accessToken,
    refreshToken: verifyResponse.body.data.refreshToken,
    sessionId: verifyResponse.body.data.session.id,
    response: verifyResponse,
  };
}

/**
 * Pushes the most recent OTP challenge for an email far enough into the
 * past that OTP_RESEND_COOLDOWN_SECONDS no longer applies to it. Exported
 * separately so a test can call it directly before its own raw `/request`
 * calls, the way `signInWithEmailOtp` does internally.
 */
export async function bypassOtpResendCooldown(
  testApp: TestApp,
  emailNormalized: string,
): Promise<void> {
  const mostRecent = await testApp.prisma.emailOtpChallenge.findFirst({
    where: { emailNormalized },
    orderBy: { createdAt: 'desc' },
  });
  if (mostRecent) {
    await testApp.prisma.emailOtpChallenge.update({
      where: { id: mostRecent.id },
      data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
  }
}

export function authed(testApp: TestApp, accessToken: string) {
  return {
    get: (url: string) =>
      request(testApp.app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${accessToken}`),
    post: (url: string) =>
      request(testApp.app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${accessToken}`),
    put: (url: string) =>
      request(testApp.app.getHttpServer())
        .put(url)
        .set('Authorization', `Bearer ${accessToken}`),
    delete: (url: string) =>
      request(testApp.app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${accessToken}`),
  };
}
