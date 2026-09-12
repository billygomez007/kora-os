import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap/configure-application.js';
import { normalizeEmail } from '../../src/common/identity/normalize-email.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { EMAIL_OTP_SENDER } from '../../src/modules/auth/email-otp/email-otp-sender.interface.js';
import { FakeEmailOtpSender } from '../../src/modules/auth/email-otp/fake-email-otp-sender.js';
import type { EmailSendResult } from '../../src/common/email/email-sender.js';
import { StaffInvitationEmailService } from '../../src/modules/staff-invitations/staff-invitation-email.service.js';

class FakeStaffInvitationEmailService {
  sendCount = 0;

  async send(_params: unknown): Promise<EmailSendResult> {
    this.sendCount += 1;
    return {};
  }
}

export interface TestApp {
  app: INestApplication;
  fakeEmailOtpSender: FakeEmailOtpSender;
  fakeStaffInvitationEmailService: FakeStaffInvitationEmailService;
  prisma: PrismaService;
}

// Each test file boots (and tears down) a fresh Nest app per test, dozens
// of times across a suite run. Leaving the port to supertest's default
// `listen(0)` hands each app an OS-assigned ephemeral port, and the OS is
// free to reuse a very recently released one — including one whose prior
// occupant still has a connection in TIME_WAIT at the kernel level, below
// anything forceCloseConnections (Node/Nest-level socket tracking) can see
// or control. That reuse was reproducible (~1 in 10 runs) even after
// forceCloseConnections, always as a stray "Parse Error: Expected HTTP/,
// RTSP/ or ICE/" on some unrelated test. Assigning each app its own
// monotonically increasing port for the lifetime of the test process
// means no two test apps ever share a port number, removing the reuse
// race outright rather than narrowing its window.
const TEST_PORT_BASE = 34_500;
let nextTestPort = TEST_PORT_BASE;
/** Exported so a test file that needs to bootstrap its own app outside
 * createTestApp (e.g. to override EMAIL_OTP_SENDER with something other
 * than the fake) can still avoid ephemeral-port reuse the same way. */
export function claimTestPort(): number {
  const port = nextTestPort;
  nextTestPort += 1;
  return port;
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
export async function createTestApp(imports: unknown[] = []): Promise<TestApp> {
  const fakeEmailOtpSender = new FakeEmailOtpSender();
  const fakeStaffInvitationEmailService = new FakeStaffInvitationEmailService();
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule, ...(imports as never[])],
  })
    .overrideProvider(EMAIL_OTP_SENDER)
    .useValue(fakeEmailOtpSender)
    .overrideProvider(StaffInvitationEmailService)
    .useValue(fakeStaffInvitationEmailService)
    .compile();

  // forceCloseConnections is required here, not optional. Nest's Express
  // adapter only destroys lingering sockets on close() when this flag is
  // set (see ExpressAdapter#trackOpenConnections/closeOpenConnections in
  // @nestjs/platform-express); without it, close() just calls Node's
  // plain `httpServer.close()`, which waits for existing connections —
  // including idle keep-alive ones — to end on their own. Because this
  // suite creates and destroys a fresh Nest app (and a fresh ephemeral
  // supertest port) per test, an occasional slow-to-close socket let the
  // OS hand the next test a port with a stale connection still attached
  // to it, surfacing as "Parse Error: Expected HTTP/, RTSP/ or ICE/",
  // spurious 404s on routes that do exist, or a hung request timing out
  // at 20s — all observed, all on otherwise-unrelated tests, consistent
  // with connection/port reuse rather than any single test's logic.
  const app = moduleFixture.createNestApplication({
    forceCloseConnections: true,
  });
  configureApplication(app);
  await app.listen(claimTestPort(), '127.0.0.1');

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

  return { app, fakeEmailOtpSender, fakeStaffInvitationEmailService, prisma };
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
    patch: (url: string) =>
      request(testApp.app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${accessToken}`),
    delete: (url: string) =>
      request(testApp.app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${accessToken}`),
  };
}
