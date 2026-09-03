import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getLiveness() {
    return {
      status: 'ok',
      service: 'kora-api',
      timestamp: new Date().toISOString(),
    } as const;
  }

  getReadiness() {
    return {
      status: 'ready',
      service: 'kora-api',
      checks: [{ name: 'api', status: 'up' }],
      timestamp: new Date().toISOString(),
    } as const;
  }
}
