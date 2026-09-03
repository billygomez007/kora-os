import { HealthService } from './health.service.js';

function createHealthService(databaseReachable: boolean): HealthService {
  const prismaStub = {
    isDatabaseReachable: vi.fn().mockResolvedValue(databaseReachable),
  };
  return new HealthService(prismaStub as never);
}

describe('HealthService', () => {
  it('reports liveness without touching the database', () => {
    const service = createHealthService(true);

    expect(service.getLiveness()).toMatchObject({
      status: 'ok',
      service: 'kora-api',
    });
  });

  it('reports ready when the database is reachable', async () => {
    const service = createHealthService(true);

    await expect(service.getReadiness()).resolves.toMatchObject({
      ready: true,
      status: 'ready',
      checks: [
        { name: 'api', status: 'up' },
        { name: 'database', status: 'up' },
      ],
    });
  });

  it('reports unavailable when the database is unreachable', async () => {
    const service = createHealthService(false);

    await expect(service.getReadiness()).resolves.toMatchObject({
      ready: false,
      status: 'unavailable',
      checks: [
        { name: 'api', status: 'up' },
        { name: 'database', status: 'down' },
      ],
    });
  });
});
