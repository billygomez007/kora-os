import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServicesService } from './services.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @RequirePermissions('services.read')
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('includeArchived') includeArchived?: string,
    @Query('serviceCategoryId') serviceCategoryId?: string,
  ) {
    return this.servicesService.list(tenant.organizationId, {
      includeArchived: includeArchived === 'true',
      serviceCategoryId,
    });
  }

  @RequirePermissions('services.manage')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateServiceDto,
    @Req() request: RequestWithId,
  ) {
    return this.servicesService.create(actorFrom(tenant, request), dto);
  }

  @RequirePermissions('services.manage')
  @Put(':serviceId')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceDto,
    @Req() request: RequestWithId,
  ) {
    return this.servicesService.update(actorFrom(tenant, request), serviceId, dto);
  }

  @RequirePermissions('services.manage')
  @Post(':serviceId/archive')
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceId') serviceId: string,
    @Req() request: RequestWithId,
  ) {
    return this.servicesService.archive(actorFrom(tenant, request), serviceId);
  }

  @RequirePermissions('services.manage')
  @Post(':serviceId/restore')
  async restore(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceId') serviceId: string,
    @Req() request: RequestWithId,
  ) {
    return this.servicesService.restore(actorFrom(tenant, request), serviceId);
  }
}

function actorFrom(tenant: TenantContext, request: RequestWithId) {
  return {
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    actorMembershipId: tenant.membershipId,
    requestId: request.requestId,
  };
}
