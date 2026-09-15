import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

/**
 * A ThrottlerStorageRecord shape, restated locally because
 * @nestjs/throttler does not re-export the interface from its package
 * root (only the module that declares it). Field semantics match the
 * built-in ThrottlerStorageService exactly: `timeToExpire` and
 * `timeToBlockExpire` are seconds, everything else is a plain count/flag.
 */
export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * The minimal ioredis surface this storage needs. Kept narrow and
 * structural so tests can supply a fake client without depending on a
 * real Redis connection or the ioredis package at all.
 */
export interface RedisEvalClient {
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

// A fixed-window counter with a block period, evaluated atomically in a
// single round trip so concurrent requests from different API replicas
// never race on read-modify-write. This mirrors @nestjs/throttler's
// built-in in-memory algorithm (ThrottlerStorageService) exactly, so
// swapping storage does not change observed rate-limit behavior.
const INCREMENT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDuration = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'hits', 'expiresAt', 'isBlocked', 'blockExpiresAt')
local hits = tonumber(data[1]) or 0
local expiresAt = tonumber(data[2]) or 0
local isBlocked = data[3] == '1'
local blockExpiresAt = tonumber(data[4]) or 0

if expiresAt <= now then
  hits = 0
  expiresAt = now + ttl
end

if isBlocked and blockExpiresAt <= now then
  isBlocked = false
  hits = 0
  expiresAt = now + ttl
  blockExpiresAt = 0
end

if not isBlocked then
  hits = hits + 1
  if hits > limit then
    isBlocked = true
    blockExpiresAt = now + blockDuration
  end
end

redis.call('HMSET', key, 'hits', hits, 'expiresAt', expiresAt, 'isBlocked', isBlocked and '1' or '0', 'blockExpiresAt', blockExpiresAt)
local pexpireMs = math.max(expiresAt - now, blockExpiresAt - now, 1000)
redis.call('PEXPIRE', key, pexpireMs)

return {hits, expiresAt - now, isBlocked and 1 or 0, math.max(blockExpiresAt - now, 0)}
`;

const REDIS_KEY_PREFIX = 'kora:throttle:';

/**
 * Derive the Redis key from whatever tracker/throttler-name string the
 * guard already built. Hashed (not stored raw) so the key space never
 * carries a directly-readable IP or other tracker value, and namespaced so
 * this storage can share a Redis instance with unrelated future uses.
 */
function deriveRedisKey(key: string): string {
  return `${REDIS_KEY_PREFIX}${createHash('sha256').update(key).digest('hex')}`;
}

/**
 * Distributed ThrottlerStorage backed by Redis/Valkey. Structurally
 * implements @nestjs/throttler's ThrottlerStorage interface without
 * importing it, so this file has no compile-time dependency on the
 * throttler package's internal (non-exported) types.
 *
 * Outage policy (explicit, not silent): if the Redis command itself fails
 * (network error, connection drop, timeout), the request is allowed
 * through — this fails OPEN rather than taking down login/OTP/refresh for
 * every user during a transient Redis blip — and the failure is logged at
 * warn level so an operator can alert on it. This is a deliberate
 * availability/security tradeoff for a rate limiter: the counter itself
 * still requires Redis to be reachable at boot (see
 * config/environment.ts's production-required THROTTLER_REDIS_URL check),
 * so a fully-down Redis in production is already a loud, known condition,
 * not a silently-downgraded one.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly client: RedisEvalClient) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = deriveRedisKey(key);

    try {
      const result = (await this.client.eval(
        INCREMENT_SCRIPT,
        1,
        redisKey,
        Date.now(),
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      const [totalHits, timeToExpireMs, isBlockedFlag, timeToBlockExpireMs] =
        result;

      return {
        totalHits,
        timeToExpire: Math.ceil(timeToExpireMs / 1000),
        isBlocked: isBlockedFlag === 1,
        timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
      };
    } catch (error) {
      this.logger.warn(
        `Distributed throttler storage unavailable for throttler="${throttlerName}"; failing open for this request. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
