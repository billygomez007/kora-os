import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { PublicAvailabilityService } from './public-availability.service.js';
import { QueryAvailabilityDto } from './dto/query-availability.dto.js';

/**
 * Public discovery surface for services and availability (docs task
 * Phase 15). Unauthenticated by design — the same PUBLIC/LINK_ONLY
 * visibility rules DiscoveryController already enforces apply here, via
 * PublicAvailabilityService. Nothing in these responses exposes
 * membership, role, financial, audit, subscription, or internal
 * scheduling-note data.
 */
@Public()
@Controller('discovery/businesses/:slug/branches/:branchId')
export class PublicAvailabilityController {
  constructor(private readonly publicAvailabilityService: PublicAvailabilityService) {}

  @Get('services')
  async listServices(@Param('slug') slug: string, @Param('branchId') branchId: string) {
    return this.publicAvailabilityService.listBranchServices(slug, branchId);
  }

  @Get('services/:serviceId/providers')
  async listProviders(
    @Param('slug') slug: string,
    @Param('branchId') branchId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.publicAvailabilityService.listServiceProviders(slug, branchId, serviceId);
  }

  @Get('availability')
  async queryAvailability(
    @Param('slug') slug: string,
    @Param('branchId') branchId: string,
    @Query() query: QueryAvailabilityDto,
  ) {
    return this.publicAvailabilityService.queryAvailability(slug, branchId, query);
  }
}
