import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CashRegistersService } from './cash-registers.service.js';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto.js';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/branches/:branchId/cash-registers')
export class CashRegistersController {
  constructor(private readonly registersService: CashRegistersService) {}

  @RequirePermissions('cash_registers.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Param('branchId') branchId: string) {
    return this.registersService.list(tenant, branchId);
  }

  @RequirePermissions('cash_registers.manage')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: CreateCashRegisterDto,
    @Req() request: RequestWithId,
  ) {
    return this.registersService.create(tenant, branchId, dto, request.requestId);
  }

  @RequirePermissions('cash_registers.manage')
  @Patch(':registerId')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('registerId') registerId: string,
    @Body() dto: UpdateCashRegisterDto,
    @Req() request: RequestWithId,
  ) {
    return this.registersService.update(tenant, branchId, registerId, dto, request.requestId);
  }

  @RequirePermissions('cash_registers.manage')
  @Post(':registerId/archive')
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('registerId') registerId: string,
    @Req() request: RequestWithId,
  ) {
    return this.registersService.archive(tenant, branchId, registerId, request.requestId);
  }
}
