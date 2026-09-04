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
import { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto.js';
import { ServiceCategoriesService } from './service-categories.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/service-categories')
export class ServiceCategoriesController {
  constructor(private readonly serviceCategoriesService: ServiceCategoriesService) {}

  @RequirePermissions('services.read')
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.serviceCategoriesService.list(tenant.organizationId, {
      includeArchived: includeArchived === 'true',
    });
  }

  @RequirePermissions('services.manage')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateServiceCategoryDto,
    @Req() request: RequestWithId,
  ) {
    return this.serviceCategoriesService.create(actorFrom(tenant, request), dto);
  }

  @RequirePermissions('services.manage')
  @Put(':categoryId')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateServiceCategoryDto,
    @Req() request: RequestWithId,
  ) {
    return this.serviceCategoriesService.update(actorFrom(tenant, request), categoryId, dto);
  }

  @RequirePermissions('services.manage')
  @Post(':categoryId/archive')
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.serviceCategoriesService.archive(actorFrom(tenant, request), categoryId);
  }

  @RequirePermissions('services.manage')
  @Post(':categoryId/restore')
  async restore(
    @CurrentTenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.serviceCategoriesService.restore(actorFrom(tenant, request), categoryId);
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
