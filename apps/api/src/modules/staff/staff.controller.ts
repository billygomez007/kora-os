import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { StaffService } from './staff.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @RequirePermissions('staff.read')
  @Get()
  async list(@Param('organizationId') organizationId: string) {
    return this.staffService.list(organizationId);
  }
}
