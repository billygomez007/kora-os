import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Injectable Prisma Client wired to a single shared `pg.Pool` through
 * `@prisma/adapter-pg`. The pool is created once, in this constructor, and
 * reused for the lifetime of the process — a new connection pool is never
 * created per request. Connection and disconnection are driven entirely by
 * Nest's module lifecycle hooks.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /**
   * Lightweight connectivity probe for the readiness endpoint. Deliberately
   * avoids touching any application table so it stays cheap and does not
   * depend on migrations having been applied.
   */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(
        `Database readiness probe failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }
}
