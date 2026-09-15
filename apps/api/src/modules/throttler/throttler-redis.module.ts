import { Global, Module } from '@nestjs/common';
import { ThrottlerRedisService } from './throttler-redis.service.js';

@Global()
@Module({
  providers: [ThrottlerRedisService],
  exports: [ThrottlerRedisService],
})
export class ThrottlerRedisModule {}
