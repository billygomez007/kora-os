import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap/configure-application.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Readiness when a required dependency is unavailable (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        isDatabaseReachable: async () => false,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  it('returns 503 with the standard envelope and no infrastructure detail', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/readiness')
      .set('x-request-id', 'request-readiness-degraded')
      .expect(503);

    expect(response.body.data).toMatchObject({
      ready: false,
      status: 'unavailable',
      checks: [
        { name: 'api', status: 'up' },
        { name: 'database', status: 'down' },
      ],
    });
    expect(response.body.meta).toEqual({
      requestId: 'request-readiness-degraded',
    });

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
    expect(serialized.toLowerCase()).not.toContain('password');
  });

  it('keeps liveness reporting ok while the database is unavailable', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
