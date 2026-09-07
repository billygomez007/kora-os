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
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { ProductsService } from './products.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/suppliers')
export class SuppliersController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions('products.read')
  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.productsService.listSuppliers(
      tenant.organizationId,
      includeArchived === 'true',
    );
  }

  @RequirePermissions('products.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateSupplierDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.createSupplier(actorFrom(tenant, request), dto);
  }

  @RequirePermissions('products.manage')
  @Put(':supplierId')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('supplierId') supplierId: string,
    @Body() dto: UpdateSupplierDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.updateSupplier(
      actorFrom(tenant, request),
      supplierId,
      dto,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':supplierId/archive')
  archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('supplierId') supplierId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.archiveSupplier(
      actorFrom(tenant, request),
      supplierId,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':supplierId/restore')
  restore(
    @CurrentTenant() tenant: TenantContext,
    @Param('supplierId') supplierId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.restoreSupplier(
      actorFrom(tenant, request),
      supplierId,
    );
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
