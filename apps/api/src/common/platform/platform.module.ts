import { Module } from '@nestjs/common';
import { PlatformAccessGuard } from './platform-access.guard.js';

@Module({
  providers: [PlatformAccessGuard],
  exports: [PlatformAccessGuard],
})
export class PlatformModule {}
