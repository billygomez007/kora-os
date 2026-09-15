import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';

const redisUrl = process.env.SEC03_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis('RedisThrottlerStorage (real Redis/Valkey)', () => {
  let client: Redis;
  let storage: RedisThrottlerStorage;

  beforeAll(async () => {
    client = new Redis(redisUrl!, {
      lazyConnect: false,
      connectTimeout: 1_500,
      commandTimeout: 1_500,
      maxRetriesPerRequest: 1,
    });
    storage = new RedisThrottlerStorage(client);
    await client.flushdb();
  });

  afterAll(async () => {
    await client.quit();
  });

  it('executes Lua atomically across concurrent requests and applies TTL/blocking', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        storage.increment('integration-key', 2_000, 5, 3_000, 'integration'),
      ),
    );

    expect(results.filter((result) => result.isBlocked)).toHaveLength(7);
    expect(results.filter((result) => !result.isBlocked)).toHaveLength(5);
    const keys = await client.keys('kora:throttle:*');
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('integration-key');
    expect(await client.pttl(keys[0]!)).toBeGreaterThan(0);
  });

  it('recovers after a Redis connection is restored', async () => {
    client.disconnect();
    await expect(
      storage.increment('outage-key', 1_000, 2, 1_000, 'integration'),
    ).rejects.toMatchObject({ code: 'THROTTLER_REDIS_UNAVAILABLE' });

    client = new Redis(redisUrl!, {
      lazyConnect: false,
      connectTimeout: 1_500,
      commandTimeout: 1_500,
      maxRetriesPerRequest: 1,
    });
    storage = new RedisThrottlerStorage(client);
    await expect(client.ping()).resolves.toBe('PONG');
    await expect(
      storage.increment('recovered-key', 1_000, 2, 1_000, 'integration'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
  });
});
