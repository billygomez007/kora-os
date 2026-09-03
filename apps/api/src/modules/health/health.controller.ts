import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  @Header('Cache-Control', 'no-store')
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('readiness')
  @Header('Cache-Control', 'no-store')
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.healthService.getReadiness();

    // `passthrough: true` keeps the standard response envelope and
    // request-ID behavior (via ApiResponseInterceptor) while still letting
    // this handler choose a non-2xx status when a required dependency is
    // unavailable.
    response.status(
      readiness.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return readiness;
  }
}
