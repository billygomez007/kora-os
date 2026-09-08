import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service.js';

function createService(): PrismaService {
  const config = new ConfigService({
    DATABASE_URL: 'postgresql://kora_app:test@127.0.0.1:5433/kora',
  });
  return new PrismaService(config);
}

describe('PrismaService', () => {
  it('reports reachable when the probe query succeeds', async () => {
    const service = createService();
    vi.spyOn(
      service as unknown as { $queryRaw: (...args: unknown[]) => unknown },
      '$queryRaw',
    ).mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.isDatabaseReachable()).resolves.toBe(true);
  });

  it('reports unreachable when the probe query fails', async () => {
    const service = createService();
    vi.spyOn(
      service as unknown as { $queryRaw: (...args: unknown[]) => unknown },
      '$queryRaw',
    ).mockRejectedValue(new Error('connection refused'));

    await expect(service.isDatabaseReachable()).resolves.toBe(false);
  });
});
