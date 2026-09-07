import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireBranchParam } from '../../common/authorization/decorators/require-branch-param.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { BranchInventoryService } from './branch-inventory.service.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ReceiveStockDto } from './dto/receive-stock.dto.js';
import { UpdateReorderLevelDto } from './dto/update-reorder-level.dto.js';

@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@Controller('organizations/:organizationId/branches/:branchId/inventory')
export class BranchInventoryController {
  constructor(
    private readonly branchInventoryService: BranchInventoryService,
  ) {}

  @RequirePermissions('inventory.read')
  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
  ) {
    return this.branchInventoryService.list(tenant.organizationId, branchId);
  }

  @RequirePermissions('inventory.read')
  @Get('variants/:variantId/movements')
  movementHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.branchInventoryService.movementHistory(
      tenant.organizationId,
      branchId,
      variantId,
    );
  }

  @RequirePermissions('inventory.manage')
  @Post('variants/:variantId/receive')
  receive(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('variantId') variantId: string,
    @Body() dto: ReceiveStockDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchInventoryService.receive(
      actorFrom(tenant, branchId, request),
      variantId,
      dto,
    );
  }

  @RequirePermissions('inventory.manage')
  @Post('variants/:variantId/adjust')
  adjust(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchInventoryService.adjust(
      actorFrom(tenant, branchId, request),
      variantId,
      dto,
    );
  }

  @RequirePermissions('inventory.manage')
  @Put('variants/:variantId/reorder-level')
  updateReorderLevel(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateReorderLevelDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchInventoryService.updateReorderLevel(
      actorFrom(tenant, branchId, request),
      variantId,
      dto,
    );
  }
}

function actorFrom(
  tenant: TenantContext,
  branchId: string,
  request: RequestWithId,
) {
  return {
    organizationId: tenant.organizationId,
    branchId,
    actorUserId: tenant.userId,
    actorMembershipId: tenant.membershipId,
    requestId: request.requestId,
  };
}
