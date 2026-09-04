import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireBranchParam } from '../../common/authorization/decorators/require-branch-param.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { AvailabilityEngineService } from './availability-engine.service.js';
import { QueryAvailabilityDto } from './dto/query-availability.dto.js';
import { normalizeAvailabilityDateRange } from './normalize-availability-date-range.util.js';

/** The authenticated, organization-side equivalent of the public
 * discovery availability endpoint — for staff previewing slots before
 * creating a staff-assisted booking (docs task Phase 20). Unlike the
 * public path, this does not re-check discovery visibility (the caller
 * already has proven organization access via TenantAccessGuard) or
 * customer-bookability (a staff member may book a non-customer-bookable
 * service on a customer's behalf). */
@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@RequirePermissions('availability.read')
@Controller('organizations/:organizationId/branches/:branchId/availability')
export class OrganizationAvailabilityController {
  constructor(private readonly availabilityEngine: AvailabilityEngineService) {}

  @Get()
  async queryAvailability(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Query() query: QueryAvailabilityDto,
  ) {
    const serviceIds = query.serviceIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (serviceIds.length === 0) {
      throw new BadRequestException('serviceIds is required');
    }
    const { fromLocalDate, toLocalDate } = normalizeAvailabilityDateRange(query);

    return this.availabilityEngine.computeAvailability({
      organizationId: tenant.organizationId,
      branchId,
      serviceIds,
      staffProfileId: query.staffProfileId,
      fromLocalDate,
      toLocalDate,
    });
  }
}
