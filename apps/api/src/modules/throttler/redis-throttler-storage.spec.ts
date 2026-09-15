import {
  RedisThrottlerStorage,
  type RedisEvalClient,
} from './redis-throttler-storage.js';

/**
 * A fake Redis `eval` that implements the exact same fixed-window +
 * block-period algorithm as INCREMENT_SCRIPT (redis-throttler-storage.ts),
 * against a plain Map instead of a real Redis server. Docker/Redis are not
 * available in this environment, so this is how the distributed-storage
 * *contract* is verified locally; the Lua script's own syntax has been
 * hand-reviewed against Redis's documented Lua command set (HMGET, HMSET,
 * PEXPIRE) and should additionally be exercised against a real Redis/Valkey
 * instance before production traffic depends on it (see the SEC-03 report's
 * "External infrastructure required" note).
 */
function createFakeRedisStore() {
  const rows = new Map<
    string,
    { hits: number; expiresAt: number; isBlocked: boolean; blockExpiresAt: number }
  >();
  const evalCalls: Array<{ key: string; now: number }> = [];

  const client: RedisEvalClient = {
    async eval(_script, _numKeys, ...args) {
      const [key, now, ttl, limit, blockDuration] = args as [
        string,
        number,
        number,
        number,
        number,
      ];
      evalCalls.push({ key, now });

      let row = rows.get(key) ?? {
        hits: 0,
        expiresAt: 0,
        isBlocked: false,
        blockExpiresAt: 0,
      };

      if (row.expiresAt <= now) {
        row = { ...row, hits: 0, expiresAt: now + ttl };
      }

      if (row.isBlocked && row.blockExpiresAt <= now) {
        row = {
          hits: 0,
          expiresAt: now + ttl,
          isBlocked: false,
          blockExpiresAt: 0,
        };
      }

      if (!row.isBlocked) {
        row.hits += 1;
        if (row.hits > limit) {
          row.isBlocked = true;
          row.blockExpiresAt = now + blockDuration;
        }
      }

      rows.set(key, row);

      return [
        row.hits,
        row.expiresAt - now,
        row.isBlocked ? 1 : 0,
        Math.max(row.blockExpiresAt - now, 0),
      ];
    },
  };

  return { client, rows, evalCalls };
}

function failingClient(message: string): RedisEvalClient {
  return {
    async eval() {
      throw new Error(message);
    },
  };
}

describe('RedisThrottlerStorage', () => {
  it('counts hits and blocks once the limit is exceeded, matching the built-in in-memory algorithm', async () => {
    const { client } = createFakeRedisStore();
    const storage = new RedisThrottlerStorage(client);
    const call = () => storage.increment('route-key', 60_000, 2, 30_000, 'default');

    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await call());

    expect(results[0]).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(results[1]).toMatchObject({ totalHits: 2, isBlocked: false });
    // The third request exceeds the limit of 2 and becomes blocked.
    expect(results[2]).toMatchObject({ isBlocked: true });
    expect(results[3]).toMatchObject({ isBlocked: true });
  });

  // Test item: "distributed quota behavior across simulated replicas".
  it('shares quota across independent storage instances backed by the same Redis store (simulated replicas)', async () => {
    const { client } = createFakeRedisStore();
    const replicaA = new RedisThrottlerStorage(client);
    const replicaB = new RedisThrottlerStorage(client);

    await replicaA.increment('shared-key', 60_000, 3, 30_000, 'default');
    await replicaB.increment('shared-key', 60_000, 3, 30_000, 'default');
    const third = await replicaA.increment(
      'shared-key',
      60_000,
      3,
      30_000,
      'default',
    );
    const fourth = await replicaB.increment(
      'shared-key',
      60_000,
      3,
      30_000,
      'default',
    );

    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(false);
    // The 4th hit total across BOTH replicas exceeds the limit of 3 — proof
    // the quota is shared, not tracked independently per instance/process.
    expect(fourth.isBlocked).toBe(true);
  });

  it('would NOT share quota across two independent (unshared) stores — contrast case proving the shared test is meaningful', async () => {
    const storeA = createFakeRedisStore();
    const storeB = createFakeRedisStore();
    const replicaA = new RedisThrottlerStorage(storeA.client);
    const replicaB = new RedisThrottlerStorage(storeB.client);

    for (let i = 0; i < 3; i += 1) {
      await replicaA.increment('shared-key', 60_000, 3, 30_000, 'default');
    }
    const fromB = await replicaB.increment(
      'shared-key',
      60_000,
      3,
      30_000,
      'default',
    );

    // Unshared backends: replica B has no idea replica A already used the
    // whole quota.
    expect(fromB.totalHits).toBe(1);
    expect(fromB.isBlocked).toBe(false);
  });

  // Test item: "limiter outage follows explicit safe policy".
  it('fails OPEN (does not throw, does not block) when the Redis command itself fails', async () => {
    const storage = new RedisThrottlerStorage(
      failingClient('connect ECONNREFUSED'),
    );

    const result = await storage.increment(
      'route-key',
      60_000,
      10,
      30_000,
      'default',
    );

    expect(result).toEqual({
      totalHits: 0,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  // Test item: "proxy/IP key behavior" (key derivation, not raw tracker
  // values persisted in the store).
  it('never sends the raw tracker/key string to Redis — only a fixed-length hash', async () => {
    const { client, evalCalls } = createFakeRedisStore();
    const storage = new RedisThrottlerStorage(client);
    const rawKey = 'AuthController-refresh-default-203.0.113.42';

    await storage.increment(rawKey, 60_000, 10, 30_000, 'default');

    expect(evalCalls).toHaveLength(1);
    const sentKey = evalCalls[0]?.key ?? '';
    expect(sentKey).not.toBe(rawKey);
    expect(sentKey).not.toContain('203.0.113.42');
    expect(sentKey).toMatch(/^kora:throttle:[0-9a-f]{64}$/);
  });

  it('derives the same Redis key for the same input key (deterministic) and different keys for different input (no collisions)', async () => {
    const { client, evalCalls } = createFakeRedisStore();
    const storage = new RedisThrottlerStorage(client);

    await storage.increment('key-one', 60_000, 10, 30_000, 'default');
    await storage.increment('key-one', 60_000, 10, 30_000, 'default');
    await storage.increment('key-two', 60_000, 10, 30_000, 'default');

    expect(evalCalls[0]?.key).toBe(evalCalls[1]?.key);
    expect(evalCalls[0]?.key).not.toBe(evalCalls[2]?.key);
  });
});
