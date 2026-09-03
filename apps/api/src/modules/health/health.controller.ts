import { Controller, Get, Header } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('readiness')
  @Header('Cache-Control', 'no-store')
  getReadiness() {
    return this.healthService.getReadiness();
  }
}
