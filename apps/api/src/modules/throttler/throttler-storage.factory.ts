import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerRedisService } from './throttler-redis.service.js';

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
 * The shared client is configured with bounded connect/command timeouts and
 * finite retries. RedisThrottlerStorage surfaces command failures; the
 * KoraThrottlerGuard fails closed for token issuance and authentication
 * routes, while ordinary route throttling retains an explicit availability
 * fallback.
 */
export function createThrottlerStorage(
  throttlerRedisUrl: string | undefined,
  redisService?: ThrottlerRedisService,
): ThrottlerStorage | undefined {
  if (!throttlerRedisUrl) return undefined;
  const storage = redisService?.getStorage();
  if (!storage) {
    logger.error('THROTTLER_REDIS_URL is set but Redis storage was not initialized');
  }
  return storage;
}
