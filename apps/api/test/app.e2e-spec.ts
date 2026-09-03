import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApplication } from './../src/bootstrap/configure-application.js';

describe('Kora API foundation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  it('returns service information with a request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1')
      .set('x-request-id', 'request-service-info')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        name: 'kora-api',
        version: '0.1.0',
        status: 'ok',
      },
      meta: {
        requestId: 'request-service-info',
      },
    });
    expect(response.headers['x-request-id']).toBe('request-service-info');
  });

  it('returns liveness and readiness responses', async () => {
    const healthResponse = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200);

    expect(healthResponse.body.data.status).toBe('ok');
    expect(healthResponse.body.data.service).toBe('kora-api');
    expect(healthResponse.body.meta.requestId).toEqual(expect.any(String));

    // Exercises the real local PostgreSQL container: the database check
    // must report "up" and the endpoint must return 200 while it is
    // healthy.
    const readinessResponse = await request(app.getHttpServer())
      .get('/v1/readiness')
      .expect(200);

    expect(readinessResponse.body.data).toMatchObject({
      ready: true,
      status: 'ready',
      checks: [
        { name: 'api', status: 'up' },
        { name: 'database', status: 'up' },
      ],
    });
    expect(readinessResponse.body.meta.requestId).toEqual(expect.any(String));
  });

  it('uses the standard error contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/not-a-real-route')
      .set('x-request-id', 'request-not-found')
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /v1/not-a-real-route',
        retryable: false,
      },
      meta: {
        requestId: 'request-not-found',
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
