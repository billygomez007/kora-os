import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const service = new HealthService();

  it('reports liveness', () => {
    expect(service.getLiveness()).toMatchObject({
      status: 'ok',
      service: 'kora-api',
    });
  });

  it('reports current readiness checks', () => {
    expect(service.getReadiness()).toMatchObject({
      status: 'ready',
      checks: [{ name: 'api', status: 'up' }],
    });
  });
});
