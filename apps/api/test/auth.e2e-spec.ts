import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { validateEnvironment } from '../src/config/environment.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap/configure-application.js';

const runPrefix = `auth-spec-${randomUUID()}`;
let uniqueCounter = 0;

function uniqueEmail(): string {
  uniqueCounter += 1;
  return `${runPrefix}-${uniqueCounter}@example.test`;
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  configureApplication(app);
  await app.init();
  return app;
}

async function registerUser(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; password: string; displayName: string }> = {},
) {
  const body = {
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? 'a-safe-long-password',
    displayName: overrides.displayName ?? 'Test User',
  };
  const response = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send(body)
    .expect(201);
  return { body, response };
}

describe('Auth (e2e)', () => {
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
    // AuditEvent.actorUserId is onDelete: Restrict (audit history outlives
    // the user it describes in production), so the test's own audit rows
    // must be cleared before the user rows they reference can be deleted.
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await cleanupModule.close();
  });

  async function trackUser(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { emailNormalized: email } });
    if (user) {
      createdUserIds.push(user.id);
    }
  }

  describe('registration', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('creates a user and returns a usable access token', async () => {
      const { body, response } = await registerUser(app);
      await trackUser(body.email);

      expect(response.body.data).toMatchObject({
        user: { email: body.email, displayName: body.displayName },
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(response.body.data.user).not.toHaveProperty('passwordHash');

      const meResponse = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${response.body.data.accessToken}`)
        .expect(200);
      expect(meResponse.body.data).toMatchObject({ email: body.email });
    });

    it('rejects registering the same email twice', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);

      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ ...body, displayName: 'Different Name' })
        .expect(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_IN_USE');
    });

    it('rejects a password shorter than the minimum length', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: uniqueEmail(), password: 'short', displayName: 'Test' })
        .expect(400);
    });

    it('rejects a malformed email address', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'a-safe-long-password',
          displayName: 'Test',
        })
        .expect(400);
    });
  });

  describe('login', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('succeeds with correct credentials', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);

      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
    });

    it('fails with the same generic error for a wrong password and for a non-existent email', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);

      const wrongPassword = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: 'definitely-wrong-password' })
        .expect(401);

      const unknownEmail = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: uniqueEmail(), password: 'definitely-wrong-password' })
        .expect(401);

      expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
    });
  });

  describe('refresh rotation and reuse detection', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('rotates the refresh token on every use and rejects reuse for the whole session', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);

      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(200);
      const refreshToken1 = login.body.data.refreshToken;

      const firstRefresh = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: refreshToken1 })
        .expect(200);
      const refreshToken2 = firstRefresh.body.data.refreshToken;
      expect(refreshToken2).not.toBe(refreshToken1);

      // Reusing the already-rotated token is refresh-token reuse.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: refreshToken1 })
        .expect(401);

      // The whole session's token family — including the newer, otherwise
      // still-valid token2 — is now revoked.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: refreshToken2 })
        .expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });
  });

  describe('logout and session revocation', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('revokes the current session on logout', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(200);
      const accessToken = login.body.data.accessToken;

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('revokes every session on logout-all', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);

      const session1 = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password, deviceLabel: 'device-1' })
        .expect(200);
      const session2 = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password, deviceLabel: 'device-2' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/auth/logout-all')
        .set('Authorization', `Bearer ${session1.body.data.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${session1.body.data.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${session2.body.data.accessToken}`)
        .expect(401);
    });

    it('lists sessions and lets a user revoke one of their own other sessions', async () => {
      const { body } = await registerUser(app);
      await trackUser(body.email);

      const session1 = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password, deviceLabel: 'device-1' })
        .expect(200);
      const session2 = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: body.password, deviceLabel: 'device-2' })
        .expect(200);

      const listResponse = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${session1.body.data.accessToken}`)
        .expect(200);
      // One session from registerUser's implicit login, plus session1 and
      // session2 from the two explicit logins above.
      expect(listResponse.body.data).toHaveLength(3);
      expect(
        listResponse.body.data.map((s: { id: string }) => s.id),
      ).toEqual(
        expect.arrayContaining([
          session1.body.data.session.id,
          session2.body.data.session.id,
        ]),
      );

      await request(app.getHttpServer())
        .delete(`/v1/auth/sessions/${session2.body.data.session.id}`)
        .set('Authorization', `Bearer ${session1.body.data.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${session2.body.data.accessToken}`)
        .expect(401);
      // The revoking session itself stays active.
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${session1.body.data.accessToken}`)
        .expect(200);
    });

    it('does not let a user revoke a different user\'s session', async () => {
      const userA = await registerUser(app);
      await trackUser(userA.body.email);
      const userB = await registerUser(app);
      await trackUser(userB.body.email);

      await request(app.getHttpServer())
        .delete(`/v1/auth/sessions/${userB.response.body.data.session.id}`)
        .set('Authorization', `Bearer ${userA.response.body.data.accessToken}`)
        .expect(401);

      // Proof it was not actually revoked: user B's session still works.
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${userB.response.body.data.accessToken}`)
        .expect(200);
    });
  });

  describe('unauthenticated access', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('rejects a protected route with no token', async () => {
      await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
    });

    it('rejects a protected route with a garbage token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 once the login throttle limit is exceeded', async () => {
      const app = await createApp();
      try {
        const attempt = () =>
          request(app.getHttpServer())
            .post('/v1/auth/login')
            .send({ email: uniqueEmail(), password: 'whatever-password' });

        const results = [];
        for (let i = 0; i < 11; i += 1) {
          results.push(await attempt());
        }
        expect(results.some((r) => r.status === 429)).toBe(true);
      } finally {
        await app.close();
      }
    });
  });
});
