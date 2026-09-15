import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';

const logger = new Logger('ThrottlerStorageFactory');

/**
 * Build the shared ThrottlerStorage for the whole API process.
 *
 * - `throttlerRedisUrl` set: connect to Redis/Valkey and use the
 *   distributed, atomic storage (SEC-03 prerequisite for B2B — see
 *   docs/HTTPONLY_AUTH_MIGRATION.md).
 * - Not set: return `undefined`, which lets @nestjs/throttler fall back to
 *   its built-in in-memory storage. config/environment.ts's
 *   validateEnvironment already refuses to boot in production without
 *   THROTTLER_REDIS_URL, so reaching this branch means we are in
 *   development or test, where per-process limiting is an accepted,
 *   documented, testable-locally trade-off, not a silent production
 *   downgrade.
 *
 * The Redis client itself is configured to fail fast rather than queue or
 * retry indefinitely: a connection outage should surface immediately as a
 * storage error (handled by RedisThrottlerStorage's explicit fail-open
 * policy), not as hung requests.
 */
export function createThrottlerStorage(
  throttlerRedisUrl: string | undefined,
): ThrottlerStorage | undefined {
  if (!throttlerRedisUrl) return undefined;

  const client = new Redis(throttlerRedisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });

  client.on('error', (error: Error) => {
    logger.warn(`Throttler Redis connection error: ${error.message}`);
  });

  return new RedisThrottlerStorage(client);
}
