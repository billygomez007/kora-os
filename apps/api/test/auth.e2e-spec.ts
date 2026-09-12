import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { normalizeEmail } from '../src/common/identity/normalize-email.js';
import { validateEnvironment } from '../src/config/environment.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { OtpChallengeStatus } from '../src/generated/prisma/client.js';
import { computeOtpDigest } from '../src/modules/auth/email-otp/otp-code.util.js';
import {
  authed,
  bypassOtpResendCooldown,
  createTestApp,
  signInWithEmailOtp,
  type TestApp,
} from './support/otp-test-helpers.js';

const runPrefix = `auth-spec-${randomUUID()}`;
let uniqueCounter = 0;
function uniqueEmail(): string {
  uniqueCounter += 1;
  return `${runPrefix}-${uniqueCounter}@example.test`;
}

describe('Passwordless email OTP auth (e2e)', () => {
  let cleanupModule: TestingModule;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const repositoryRootEnvPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../.env',
    );
    cleanupModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: repositoryRootEnvPath,
          validate: validateEnvironment,
        }),
        DatabaseModule,
      ],
    }).compile();
    prisma = cleanupModule.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await cleanupModule.close();
  });

  async function trackUser(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { emailNormalized: normalizeEmail(email) },
    });
    if (user) {
      createdUserIds.push(user.id);
    }
  }

  describe('request', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('returns the same generic shape for a brand-new email and an existing one, and never returns the code', async () => {
      const newEmail = uniqueEmail();
      const existing = await signInWithEmailOtp(testApp, uniqueEmail());
      await trackUser(existing.email);

      await bypassOtpResendCooldown(testApp, existing.emailNormalized);

      const forNewEmail = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email: newEmail })
        .expect(200);
      const forExistingEmail = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email: existing.email })
        .expect(200);

      expect(Object.keys(forNewEmail.body.data).sort()).toEqual(
        Object.keys(forExistingEmail.body.data).sort(),
      );
      expect(forNewEmail.body.data).toMatchObject({
        challengeId: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(JSON.stringify(forNewEmail.body)).not.toMatch(/"code"/);
    });

    it('creates no user before verification succeeds', async () => {
      const email = uniqueEmail();
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);

      const userBeforeVerify = await prisma.user.findUnique({
        where: { emailNormalized: normalizeEmail(email) },
      });
      expect(userBeforeVerify).toBeNull();
    });

    it('rejects a malformed email', async () => {
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('enforces the resend cooldown', async () => {
      const email = uniqueEmail();
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);

      const second = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email });
      expect(second.status).toBe(429);
    });

    it('invalidates the previous code when a new one is requested (after the cooldown)', async () => {
      const email = uniqueEmail();
      const first = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const firstCode = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );

      // Bypass the cooldown directly at the data layer — this test is
      // about resend invalidation, not the cooldown itself (covered
      // separately above).
      await prisma.emailOtpChallenge.update({
        where: { id: first.body.data.challengeId },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);

      const oldChallenge = await prisma.emailOtpChallenge.findUniqueOrThrow({
        where: { id: first.body.data.challengeId },
      });
      expect(oldChallenge.status).toBe(OtpChallengeStatus.INVALIDATED);

      // The old (now invalidated) code no longer works.
      const rejected = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: first.body.data.challengeId, code: firstCode });
      expect(rejected.status).toBe(401);
    });

    it('throttles repeated requests by IP across different emails', async () => {
      const results = [];
      for (let i = 0; i < 11; i += 1) {
        results.push(
          await request(testApp.app.getHttpServer())
            .post('/v1/auth/email-otp/request')
            .send({ email: uniqueEmail() }),
        );
      }
      expect(results.some((r) => r.status === 429)).toBe(true);
    });
  });

  describe('verify', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('creates a new user and a usable session on first verification', async () => {
      const email = uniqueEmail();
      const signedIn = await signInWithEmailOtp(testApp, email);
      await trackUser(email);

      expect(signedIn.response.body.data).toMatchObject({
        user: { email: signedIn.emailNormalized },
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      const meResponse = await authed(testApp, signedIn.accessToken)
        .get('/v1/auth/me')
        .expect(200);
      expect(meResponse.body.data.email).toBe(signedIn.emailNormalized);
    });

    it('trims surrounding whitespace from a pasted OTP without changing its digits', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const code = testApp.fakeEmailOtpSender.lastCodeFor(normalizeEmail(email));

      const verified = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({
          challengeId: requestResponse.body.data.challengeId,
          code: `  ${code} `,
        })
        .expect(200);

      expect(verified.body.data.accessToken).toEqual(expect.any(String));
      await trackUser(email);
    });

    it('signs an existing email into the same user rather than creating a second one', async () => {
      const email = uniqueEmail();
      const first = await signInWithEmailOtp(testApp, email);
      await trackUser(email);
      const second = await signInWithEmailOtp(testApp, email);

      expect(second.userId).toBe(first.userId);
      const userCount = await prisma.user.count({
        where: { emailNormalized: first.emailNormalized },
      });
      expect(userCount).toBe(1);
    });

    it('denies existing access tokens and refresh tokens after the user is suspended', async () => {
      const email = uniqueEmail();
      const signedIn = await signInWithEmailOtp(testApp, email);
      await trackUser(email);
      await prisma.user.update({
        where: { id: signedIn.userId },
        data: { status: 'SUSPENDED' },
      });

      await authed(testApp, signedIn.accessToken).get('/v1/auth/me').expect(401);
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);
    });

    it('does not issue a fresh OTP session for an existing suspended user', async () => {
      const email = uniqueEmail();
      const signedIn = await signInWithEmailOtp(testApp, email);
      await trackUser(email);
      await prisma.user.update({
        where: { id: signedIn.userId },
        data: { status: 'SUSPENDED' },
      });

      await bypassOtpResendCooldown(testApp, signedIn.emailNormalized);
      const challenge = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const code = testApp.fakeEmailOtpSender.lastCodeFor(signedIn.emailNormalized);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: challenge.body.data.challengeId, code })
        .expect(401);
    });

    it('normalizes email case, so two different-case requests resolve to the same account', async () => {
      const baseEmail = uniqueEmail();
      const lower = baseEmail.toLowerCase();
      const upper = baseEmail.toUpperCase();

      const first = await signInWithEmailOtp(testApp, lower);
      await trackUser(lower);
      const second = await signInWithEmailOtp(testApp, upper);

      expect(second.userId).toBe(first.userId);
    });

    it('rejects an incorrect code without consuming the real one', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: requestResponse.body.data.challengeId, code: '000000' })
        .expect(401);

      // The real code still works afterward.
      const realCode = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: requestResponse.body.data.challengeId, code: realCode })
        .expect(200);
      await trackUser(email);
    });

    it('locks the challenge after the configured number of wrong attempts, blocking even the correct code afterward', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const challengeId = requestResponse.body.data.challengeId;
      const realCode = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );

      for (let i = 0; i < 5; i += 1) {
        await request(testApp.app.getHttpServer())
          .post('/v1/auth/email-otp/verify')
          .send({ challengeId, code: '111111' })
          .expect(401);
      }

      const locked = await prisma.emailOtpChallenge.findUniqueOrThrow({
        where: { id: challengeId },
      });
      expect(locked.status).toBe(OtpChallengeStatus.LOCKED);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId, code: realCode })
        .expect(401);
    });

    /**
     * Production digest-mismatch investigation: rules out the database
     * row itself changing between creation and verification. Reads
     * codeDigest/emailNormalized fresh from real Postgres immediately
     * after creation, again after a failed-attempt update (the exact
     * `attemptCount: { increment: 1 } }`-only write recordFailedAttempt
     * performs), and independently recomputes the expected digest from
     * that second fresh read using the app's own configured OTP_PEPPER —
     * proving the persisted row is stable and that a correct code read
     * back off it still verifies successfully.
     */
    it('keeps codeDigest and emailNormalized byte-identical across a fresh read after creation and after a failed-attempt update', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const challengeId = requestResponse.body.data.challengeId;
      const realCode = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );

      const afterCreate = await prisma.emailOtpChallenge.findUniqueOrThrow({
        where: { id: challengeId },
      });
      expect(afterCreate.attemptCount).toBe(0);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId, code: '000000' })
        .expect(401);

      const afterFailedAttempt = await prisma.emailOtpChallenge.findUniqueOrThrow({
        where: { id: challengeId },
      });
      expect(afterFailedAttempt.attemptCount).toBe(1);
      expect(afterFailedAttempt.codeDigest).toBe(afterCreate.codeDigest);
      expect(afterFailedAttempt.emailNormalized).toBe(afterCreate.emailNormalized);

      const pepper = testApp.app.get(ConfigService).getOrThrow<string>('OTP_PEPPER');
      const recomputedFromFreshRead = computeOtpDigest({
        pepper,
        challengeId: afterFailedAttempt.id,
        emailNormalized: afterFailedAttempt.emailNormalized,
        code: realCode,
      });
      expect(recomputedFromFreshRead).toBe(afterFailedAttempt.codeDigest);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId, code: realCode })
        .expect(200);
      await trackUser(email);
    });

    it('rejects an expired code', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const code = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );

      await prisma.emailOtpChallenge.update({
        where: { id: requestResponse.body.data.challengeId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: requestResponse.body.data.challengeId, code })
        .expect(401);
    });

    it('cannot reuse an already-consumed code', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const code = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: requestResponse.body.data.challengeId, code })
        .expect(200);
      await trackUser(email);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: requestResponse.body.data.challengeId, code })
        .expect(401);
    });

    it('permits only one success out of concurrent verification attempts with the same code', async () => {
      const email = uniqueEmail();
      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const code = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );

      const attempt = () =>
        request(testApp.app.getHttpServer())
          .post('/v1/auth/email-otp/verify')
          .send({ challengeId: requestResponse.body.data.challengeId, code });

      const results = await Promise.all([attempt(), attempt(), attempt()]);
      await trackUser(email);

      const succeeded = results.filter((r) => r.status === 200);
      const rejected = results.filter((r) => r.status === 401);
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(2);
    });

    it('rejects an unknown challenge id', async () => {
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: randomUUID(), code: '123456' })
        .expect(401);
    });
  });

  describe('OTP never leaks', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('never stores the plaintext code, never returns it, and never logs it', async () => {
      const logSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');
      const email = uniqueEmail();

      const requestResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/request')
        .send({ email })
        .expect(200);
      const code = testApp.fakeEmailOtpSender.lastCodeFor(
        normalizeEmail(email),
      );
      const verifyResponse = await request(testApp.app.getHttpServer())
        .post('/v1/auth/email-otp/verify')
        .send({ challengeId: requestResponse.body.data.challengeId, code })
        .expect(200);
      await trackUser(email);

      expect(JSON.stringify(requestResponse.body)).not.toContain(code);
      expect(JSON.stringify(verifyResponse.body)).not.toContain(code);

      const storedChallenge = await prisma.emailOtpChallenge.findUniqueOrThrow({
        where: { id: requestResponse.body.data.challengeId },
      });
      expect(storedChallenge.codeDigest).not.toContain(code);
      expect(JSON.stringify(storedChallenge)).not.toContain(code);

      const auditEvents = await prisma.auditEvent.findMany({
        where: { entityId: requestResponse.body.data.challengeId },
      });
      expect(auditEvents.length).toBeGreaterThan(0);
      for (const event of auditEvents) {
        expect(JSON.stringify(event)).not.toContain(code);
      }

      const loggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .map((value) => String(value))
        .join('\n');
      expect(loggedText).not.toContain(code);

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('sessions built on OTP-verified sign-in', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('rotates the refresh token and rejects reuse across the whole session', async () => {
      const email = uniqueEmail();
      const signedIn = await signInWithEmailOtp(testApp, email);
      await trackUser(email);

      const firstRefresh = await request(testApp.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(200);
      const rotatedToken = firstRefresh.body.data.refreshToken;
      expect(rotatedToken).not.toBe(signedIn.refreshToken);

      await request(testApp.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);
      await request(testApp.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: rotatedToken })
        .expect(401);
    });

    it('revokes the current session on logout and every session on logout-all', async () => {
      const email = uniqueEmail();
      const session1 = await signInWithEmailOtp(testApp, email, { deviceLabel: 'device-1' });
      await trackUser(email);
      const session2 = await signInWithEmailOtp(testApp, email, { deviceLabel: 'device-2' });

      await authed(testApp, session1.accessToken).post('/v1/auth/logout').expect(204);
      await authed(testApp, session1.accessToken).get('/v1/auth/me').expect(401);
      await authed(testApp, session2.accessToken).get('/v1/auth/me').expect(200);

      await authed(testApp, session2.accessToken).post('/v1/auth/logout-all').expect(204);
      await authed(testApp, session2.accessToken).get('/v1/auth/me').expect(401);
    });

    it('immediately invalidates a session revoked via the sessions endpoint', async () => {
      const email = uniqueEmail();
      const session1 = await signInWithEmailOtp(testApp, email, { deviceLabel: 'device-1' });
      await trackUser(email);
      const session2 = await signInWithEmailOtp(testApp, email, { deviceLabel: 'device-2' });

      const list = await authed(testApp, session1.accessToken)
        .get('/v1/auth/sessions')
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual(
        expect.arrayContaining([session1.sessionId, session2.sessionId]),
      );

      await authed(testApp, session1.accessToken)
        .delete(`/v1/auth/sessions/${session2.sessionId}`)
        .expect(204);
      await authed(testApp, session2.accessToken).get('/v1/auth/me').expect(401);
      await authed(testApp, session1.accessToken).get('/v1/auth/me').expect(200);
    });

    it('rejects unauthenticated and garbage-token requests to protected routes', async () => {
      await request(testApp.app.getHttpServer()).get('/v1/auth/me').expect(401);
      await request(testApp.app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });
  });
});
