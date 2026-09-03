import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export type DependencyCheckStatus = 'up' | 'down';

export interface DependencyCheck {
  name: string;
  status: DependencyCheckStatus;
}

export interface ReadinessReport {
  ready: boolean;
  status: 'ready' | 'unavailable';
  service: 'kora-api';
  checks: DependencyCheck[];
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness must never fail merely because a downstream dependency (such
   * as PostgreSQL) is temporarily unavailable — it does not touch the
   * database at all.
   */
  getLiveness() {
    return {
      status: 'ok',
      service: 'kora-api',
      timestamp: new Date().toISOString(),
    } as const;
  }

  async getReadiness(): Promise<ReadinessReport> {
    const databaseReachable = await this.prisma.isDatabaseReachable();

    const checks: DependencyCheck[] = [
      { name: 'api', status: 'up' },
      { name: 'database', status: databaseReachable ? 'up' : 'down' },
    ];
    const ready = checks.every((check) => check.status === 'up');

    return {
      ready,
      status: ready ? 'ready' : 'unavailable',
      service: 'kora-api',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
