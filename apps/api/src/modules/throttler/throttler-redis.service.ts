import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';

const REDIS_CHECK_TIMEOUT_MS = 1_500;

@Injectable()
export class ThrottlerRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ThrottlerRedisService.name);
  private readonly client: Redis | undefined;
  private readonly storage: RedisThrottlerStorage | undefined;
  private readonly production: boolean;

  constructor(config: ConfigService) {
    const url = config.get<string>('THROTTLER_REDIS_URL');
    this.production = config.get<string>('NODE_ENV') === 'production';
    if (!url) return;

    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: REDIS_CHECK_TIMEOUT_MS,
      commandTimeout: REDIS_CHECK_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(250 * attempt, 2_000),
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Throttler Redis connection error: ${error.name}`);
    });
    this.storage = new RedisThrottlerStorage(this.client);
  }

  getStorage(): RedisThrottlerStorage | undefined {
    return this.storage;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.withTimeout(this.client.connect(), REDIS_CHECK_TIMEOUT_MS);
      await this.check();
    } catch (error) {
      this.logger.error('Throttler Redis startup check failed');
      if (this.production) throw error;
    }
  }

  async isReachable(): Promise<boolean> {
    if (!this.client) return !this.production;
    try {
      if (this.client.status === 'wait') {
        await this.withTimeout(this.client.connect(), REDIS_CHECK_TIMEOUT_MS);
      }
      await this.check();
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      if (this.client.status !== 'end') {
        await this.withTimeout(this.client.quit(), REDIS_CHECK_TIMEOUT_MS);
      }
    } catch {
      this.client.disconnect();
    }
  }

  private async check(): Promise<void> {
    await this.withTimeout(this.client!.ping(), REDIS_CHECK_TIMEOUT_MS);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis check timed out')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
